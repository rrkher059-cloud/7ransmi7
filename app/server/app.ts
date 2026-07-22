import type { Context } from 'hono'
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { cors } from 'hono/cors'
import { ZodError } from 'zod'
import { OTP_LENGTH } from '../shared/constants.ts'
import {
  createTweetSchema,
  commentTweetSchema,
  likeTweetSchema,
  loginSchema,
  reactTweetSchema,
  requestCodeSchema,
  sendMessageSchema,
  signupSchema,
  aiAssistSchema,
  aiCompanionSchema,
  aiSearchSchema,
  type ApiErrorBody,
  type PublicUser,
} from '../shared/schemas.ts'
import {
  assistCompose,
  companionReply,
  generateTags,
  isAiConfigured,
  moderateContent,
  semanticSearchTweets,
} from './ai.ts'
import { checkRateLimit } from './rateLimit.ts'
import { generateOtpCode } from './crypto.ts'
import {
  getFollowStats,
  listFollowers,
  listFollowing,
  toggleFollow,
} from './follows.ts'
import { sendVerificationEmail } from './mailer.ts'
import {
  getThread,
  listConversations,
  sendMessage,
} from './messages.ts'
import { getPlatformStats } from './stats.ts'
import { consumeOtp, upsertOtp } from './otps.ts'
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
} from './session.ts'
import {
  createTweet,
  deleteTweet,
  getFeedForUser,
  getPublicFeed,
  getTrendingTopics,
  likeTweet,
  listLiveTweets,
  listTweetsByUser,
  commentOnTweet,
  reactToTweet,
  repostTweet,
  searchTweets,
} from './store.ts'
import {
  listNotificationsForUser,
  markNotificationsRead,
  pushNotification,
} from './notifications.ts'
import {
  authenticateUser,
  createUser,
  findUserByEmail,
  getPublicUser,
  listPublicUsers,
  searchUsers,
} from './users.ts'

type AppVariables = {
  user: PublicUser
}

function errorBody(
  code: string,
  message: string,
  details?: unknown,
): ApiErrorBody {
  return { error: { code, message, details } }
}

function statusError(
  error: unknown,
): error is Error & { status: number; code?: string } {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  )
}

async function currentUser(c: Context): Promise<PublicUser | null> {
  const token = getCookie(c, SESSION_COOKIE)
  const session = verifySession(token)
  if (!session) return null
  return getPublicUser(session.userId)
}

function clientKey(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return c.req.header('x-real-ip') ?? 'local'
}

function enforceAiRateLimit(c: Context) {
  const result = checkRateLimit(`ai:${clientKey(c)}`, 20, 60_000)
  if (!result.allowed) {
    return c.json(
      errorBody(
        'RATE_LIMITED',
        'Too many AI requests. Wait a moment and try again.',
        { retryAfterMs: result.retryAfterMs },
      ),
      429,
    )
  }
  return null
}

export function createApp() {
  const app = new Hono<{ Variables: AppVariables }>()

  app.use(
    '*',
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      credentials: true,
    }),
  )

  app.get('/api/health', (c) => c.json({ ok: true, service: 'transmit-api' }))

  app.get('/api/stats', async (c) => {
    try {
      const stats = await getPlatformStats()
      return c.json({ stats })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('STATS_FAILED', 'Failed to load network stats.'), 500)
    }
  })

  app.post('/api/auth/request-code', async (c) => {
    try {
      const json = await c.req.json()
      const { email } = requestCodeSchema.parse(json)

      const existing = await findUserByEmail(email)
      if (existing) {
        return c.json(
          errorBody('EMAIL_TAKEN', 'An account with this email already exists.'),
          409,
        )
      }

      const code = generateOtpCode(OTP_LENGTH)
      await upsertOtp(email, code)
      await sendVerificationEmail(email, code)

      return c.json({ ok: true, message: 'Verification code sent.' })
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid email.', error.flatten()),
          400,
        )
      }
      if (error instanceof SyntaxError) {
        return c.json(errorBody('INVALID_JSON', 'Request body must be JSON.'), 400)
      }
      console.error(error)
      return c.json(
        errorBody('MAIL_FAILED', 'Failed to send verification code.'),
        500,
      )
    }
  })

  app.post('/api/auth/signup', async (c) => {
    try {
      const json = await c.req.json()
      const payload = signupSchema.parse(json)

      const otpResult = await consumeOtp(payload.email, payload.code)
      if (!otpResult.ok) {
        return c.json(errorBody('OTP_INVALID', otpResult.reason), 400)
      }

      const user = await createUser({
        email: payload.email,
        handle: payload.handle,
        password: payload.password,
      })

      const token = signSession(user.id)
      setCookie(c, SESSION_COOKIE, token, sessionCookieOptions)

      return c.json({ user }, 201)
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid signup payload.', error.flatten()),
          400,
        )
      }
      if (statusError(error)) {
        return c.json(
          errorBody(error.code ?? 'CONFLICT', error.message),
          error.status as 409,
        )
      }
      if (error instanceof SyntaxError) {
        return c.json(errorBody('INVALID_JSON', 'Request body must be JSON.'), 400)
      }
      console.error(error)
      return c.json(errorBody('SIGNUP_FAILED', 'Failed to create account.'), 500)
    }
  })

  app.post('/api/auth/login', async (c) => {
    try {
      const json = await c.req.json()
      const payload = loginSchema.parse(json)
      const user = await authenticateUser(payload.email, payload.password)

      if (!user) {
        return c.json(
          errorBody('INVALID_CREDENTIALS', 'Email or password is incorrect.'),
          401,
        )
      }

      const token = signSession(user.id)
      setCookie(c, SESSION_COOKIE, token, sessionCookieOptions)
      return c.json({ user })
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid login payload.', error.flatten()),
          400,
        )
      }
      if (error instanceof SyntaxError) {
        return c.json(errorBody('INVALID_JSON', 'Request body must be JSON.'), 400)
      }
      console.error(error)
      return c.json(errorBody('LOGIN_FAILED', 'Failed to log in.'), 500)
    }
  })

  app.post('/api/auth/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  app.get('/api/auth/me', async (c) => {
    const user = await currentUser(c)
    if (!user) {
      return c.json(errorBody('UNAUTHORIZED', 'Not signed in.'), 401)
    }
    return c.json({ user })
  })

  app.get('/api/explore/search', async (c) => {
    try {
      const user = await currentUser(c)
      const q = c.req.query('q') ?? ''
      const semantic = c.req.query('semantic') === '1' || c.req.query('semantic') === 'true'
      const [tweets, users] = await Promise.all([
        semantic && q.trim()
          ? semanticSearchTweets(q, await listLiveTweets())
          : searchTweets(q),
        searchUsers(q, user?.id),
      ])
      // Guests can browse results; hide follower-gated reposts.
      const visible = user
        ? tweets
        : tweets.filter((tweet) => !tweet.repostOfId)
      return c.json({
        tweets: visible,
        users,
        query: q,
        semantic: Boolean(semantic && q.trim()),
      })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('SEARCH_FAILED', 'Failed to search posts.'), 500)
    }
  })

  app.get('/api/ai/status', (c) => {
    return c.json({ configured: isAiConfigured() })
  })

  app.post('/api/ai/assist', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to use AI assist.'), 401)
      }
      const limited = enforceAiRateLimit(c)
      if (limited) return limited

      const payload = aiAssistSchema.parse(await c.req.json())
      const text = await assistCompose(payload.body, payload.mode)
      return c.json({ text, mode: payload.mode })
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid assist payload.', error.flatten()),
          400,
        )
      }
      if (error instanceof SyntaxError) {
        return c.json(errorBody('INVALID_JSON', 'Request body must be JSON.'), 400)
      }
      if (statusError(error)) {
        return c.json(
          errorBody(error.code ?? 'AI_FAILED', error.message),
          error.status as 400 | 502 | 503,
        )
      }
      console.error(error)
      return c.json(
        errorBody('AI_FAILED', 'AI assist failed. Try again in a moment.'),
        502,
      )
    }
  })

  app.post('/api/ai/search', async (c) => {
    try {
      const limited = enforceAiRateLimit(c)
      if (limited) return limited

      const payload = aiSearchSchema.parse(await c.req.json())
      const user = await currentUser(c)
      const live = await listLiveTweets()
      const tweets = await semanticSearchTweets(payload.query, live)
      const visible = user
        ? tweets
        : tweets.filter((tweet) => !tweet.repostOfId)
      return c.json({ tweets: visible, query: payload.query, semantic: true })
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid search payload.', error.flatten()),
          400,
        )
      }
      if (error instanceof SyntaxError) {
        return c.json(errorBody('INVALID_JSON', 'Request body must be JSON.'), 400)
      }
      if (statusError(error)) {
        return c.json(
          errorBody(error.code ?? 'AI_FAILED', error.message),
          error.status as 400 | 502 | 503,
        )
      }
      console.error(error)
      return c.json(errorBody('SEARCH_FAILED', 'Semantic search failed.'), 500)
    }
  })

  app.post('/api/ai/companion', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(
          errorBody('UNAUTHORIZED', 'Sign in to use the AI companion.'),
          401,
        )
      }
      const limited = enforceAiRateLimit(c)
      if (limited) return limited

      const payload = aiCompanionSchema.parse(await c.req.json())
      const feed = await getFeedForUser(user.id)
      const reply = await companionReply({
        message: payload.message,
        history: payload.history,
        feedContext: feed.slice(0, 12).map((tweet) => ({
          handle: tweet.handle,
          body: tweet.body,
        })),
      })
      return c.json({ reply })
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody(
            'VALIDATION_ERROR',
            'Invalid companion payload.',
            error.flatten(),
          ),
          400,
        )
      }
      if (error instanceof SyntaxError) {
        return c.json(errorBody('INVALID_JSON', 'Request body must be JSON.'), 400)
      }
      if (statusError(error)) {
        return c.json(
          errorBody(error.code ?? 'AI_FAILED', error.message),
          error.status as 400 | 502 | 503,
        )
      }
      console.error(error)
      return c.json(
        errorBody('AI_FAILED', 'Companion is offline. Try again shortly.'),
        502,
      )
    }
  })

  app.get('/api/explore/trending', async (c) => {
    try {
      const topics = await getTrendingTopics()
      return c.json({ topics })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('TRENDING_FAILED', 'Failed to load trending.'), 500)
    }
  })

  app.get('/api/explore/suggestions', async (c) => {
    try {
      const user = await currentUser(c)
      const users = await listPublicUsers(user?.id, 5)
      return c.json({ users })
    } catch (error) {
      console.error(error)
      return c.json(
        errorBody('SUGGESTIONS_FAILED', 'Failed to load suggestions.'),
        500,
      )
    }
  })

  app.get('/api/tweets', async (c) => {
    try {
      const user = await currentUser(c)
      const tweets = user
        ? await getFeedForUser(user.id)
        : await getPublicFeed()
      return c.json({ tweets })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('STORE_READ_FAILED', 'Failed to read tweets.'), 500)
    }
  })

  app.post('/api/tweets', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to post.'), 401)
      }

      const json = await c.req.json()
      const payload = createTweetSchema.parse(json)

      if (payload.body.trim()) {
        const moderation = await moderateContent(payload.body)
        if (!moderation.allowed) {
          return c.json(
            errorBody(
              'MODERATION_BLOCKED',
              moderation.reason ??
                'This transmission was blocked by moderation.',
              { categories: moderation.categories },
            ),
            422,
          )
        }
      }

      const tags = payload.body.trim()
        ? await generateTags(payload.body)
        : []

      const tweet = await createTweet({
        body: payload.body,
        handle: user.handle,
        userId: user.id,
        imageUrl: payload.imageUrl,
        replyToId: payload.replyToId,
        tags,
      })
      return c.json({ tweet }, 201)
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid tweet payload.', error.flatten()),
          400,
        )
      }
      if (error instanceof SyntaxError) {
        return c.json(errorBody('INVALID_JSON', 'Request body must be JSON.'), 400)
      }
      if (statusError(error) && error.status === 404) {
        return c.json(errorBody('NOT_FOUND', error.message), 404)
      }
      console.error(error)
      return c.json(errorBody('STORE_WRITE_FAILED', 'Failed to save tweet.'), 500)
    }
  })

  app.post('/api/tweets/:id/like', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to like.'), 401)
      }

      const { tweetId } = likeTweetSchema.parse({ tweetId: c.req.param('id') })
      const { tweet, justLiked, ownerId } = await likeTweet(tweetId, user.id)
      if (justLiked && ownerId) {
        await pushNotification({
          recipientId: ownerId,
          type: 'like',
          actorId: user.id,
          actorHandle: user.handle,
          tweetId: tweet.id,
          body: tweet.body.slice(0, 80),
        })
      }
      return c.json({ tweet })
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid tweet id.', error.flatten()),
          400,
        )
      }
      if (statusError(error) && error.status === 404) {
        return c.json(errorBody('NOT_FOUND', error.message), 404)
      }
      console.error(error)
      return c.json(errorBody('STORE_WRITE_FAILED', 'Failed to like tweet.'), 500)
    }
  })

  app.post('/api/tweets/:id/comment', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to comment.'), 401)
      }
      const tweetId = likeTweetSchema.parse({ tweetId: c.req.param('id') }).tweetId
      const { body } = commentTweetSchema.parse(await c.req.json())
      const { tweet, ownerId } = await commentOnTweet({
        tweetId,
        body,
        handle: user.handle,
        userId: user.id,
      })
      if (ownerId) {
        await pushNotification({
          recipientId: ownerId,
          type: 'comment',
          actorId: user.id,
          actorHandle: user.handle,
          tweetId: tweet.id,
          body: body.slice(0, 80),
        })
      }
      return c.json({ tweet }, 201)
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid comment.', error.flatten()),
          400,
        )
      }
      if (error instanceof SyntaxError) {
        return c.json(errorBody('INVALID_JSON', 'Request body must be JSON.'), 400)
      }
      if (statusError(error) && error.status === 404) {
        return c.json(errorBody('NOT_FOUND', error.message), 404)
      }
      console.error(error)
      return c.json(errorBody('STORE_WRITE_FAILED', 'Failed to comment.'), 500)
    }
  })

  app.post('/api/tweets/:id/repost', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to repost.'), 401)
      }
      const tweetId = likeTweetSchema.parse({ tweetId: c.req.param('id') }).tweetId
      const result = await repostTweet({
        tweetId,
        handle: user.handle,
        userId: user.id,
      })
      if (result.ownerId) {
        await pushNotification({
          recipientId: result.ownerId,
          type: 'repost',
          actorId: user.id,
          actorHandle: user.handle,
          tweetId: result.original.id,
          body: result.original.body.slice(0, 80),
        })
      }
      return c.json(
        { original: result.original, repost: result.repost },
        201,
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid tweet id.', error.flatten()),
          400,
        )
      }
      if (statusError(error)) {
        return c.json(
          errorBody(error.code ?? 'REPOST_FAILED', error.message),
          error.status as 400 | 404 | 409,
        )
      }
      console.error(error)
      return c.json(errorBody('STORE_WRITE_FAILED', 'Failed to repost.'), 500)
    }
  })

  app.post('/api/tweets/:id/react', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to react.'), 401)
      }

      const tweetId = likeTweetSchema.parse({ tweetId: c.req.param('id') }).tweetId
      const json = await c.req.json()
      const { emoji } = reactTweetSchema.parse(json)
      const { tweet, justAdded, ownerId } = await reactToTweet(
        tweetId,
        user.id,
        emoji,
      )
      if (justAdded && ownerId) {
        await pushNotification({
          recipientId: ownerId,
          type: 'reaction',
          actorId: user.id,
          actorHandle: user.handle,
          tweetId: tweet.id,
          body: emoji,
        })
      }
      return c.json({ tweet })
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid reaction.', error.flatten()),
          400,
        )
      }
      if (error instanceof SyntaxError) {
        return c.json(errorBody('INVALID_JSON', 'Request body must be JSON.'), 400)
      }
      if (statusError(error) && error.status === 404) {
        return c.json(errorBody('NOT_FOUND', error.message), 404)
      }
      console.error(error)
      return c.json(errorBody('STORE_WRITE_FAILED', 'Failed to react.'), 500)
    }
  })

  app.delete('/api/tweets/:id', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to delete.'), 401)
      }

      const tweetId = likeTweetSchema.parse({ tweetId: c.req.param('id') }).tweetId
      await deleteTweet(tweetId, user.id)
      return c.json({ ok: true })
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid tweet id.', error.flatten()),
          400,
        )
      }
      if (statusError(error) && error.status === 404) {
        return c.json(errorBody('NOT_FOUND', error.message), 404)
      }
      if (statusError(error) && error.status === 403) {
        return c.json(errorBody(error.code ?? 'FORBIDDEN', error.message), 403)
      }
      console.error(error)
      return c.json(errorBody('STORE_WRITE_FAILED', 'Failed to delete tweet.'), 500)
    }
  })

  app.get('/api/messages', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to view messages.'), 401)
      }
      const conversations = await listConversations(user.id)
      return c.json({ conversations })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('MESSAGES_FAILED', 'Failed to load messages.'), 500)
    }
  })

  app.get('/api/messages/:peerId', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to view messages.'), 401)
      }
      const peerId = c.req.param('peerId')
      const thread = await getThread(user.id, peerId)
      if (!thread) {
        return c.json(errorBody('NOT_FOUND', 'User not found.'), 404)
      }
      return c.json({ thread })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('MESSAGES_FAILED', 'Failed to load thread.'), 500)
    }
  })

  app.post('/api/messages', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to send messages.'), 401)
      }
      const payload = sendMessageSchema.parse(await c.req.json())
      const message = await sendMessage({
        fromUserId: user.id,
        toUserId: payload.toUserId,
        body: payload.body,
      })
      return c.json({ message }, 201)
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          errorBody('VALIDATION_ERROR', 'Invalid message.', error.flatten()),
          400,
        )
      }
      if (error instanceof SyntaxError) {
        return c.json(errorBody('INVALID_JSON', 'Request body must be JSON.'), 400)
      }
      if (statusError(error)) {
        return c.json(
          errorBody(error.code ?? 'MESSAGE_FAILED', error.message),
          error.status as 400 | 404,
        )
      }
      console.error(error)
      return c.json(errorBody('MESSAGE_FAILED', 'Failed to send message.'), 500)
    }
  })

  app.get('/api/users/search', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to search users.'), 401)
      }
      const q = c.req.query('q') ?? ''
      const users = await searchUsers(q, user.id)
      return c.json({ users, query: q })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('SEARCH_FAILED', 'Failed to search users.'), 500)
    }
  })

  app.get('/api/users/:id/tweets', async (c) => {
    try {
      const viewer = await currentUser(c)
      const tweets = await listTweetsByUser(
        c.req.param('id'),
        viewer?.id ?? '00000000-0000-0000-0000-000000000000',
      )
      return c.json({ tweets })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('STORE_READ_FAILED', 'Failed to load posts.'), 500)
    }
  })

  app.get('/api/users/:id/follow-stats', async (c) => {
    try {
      const viewer = await currentUser(c)
      const profileId = c.req.param('id')
      const stats = await getFollowStats(profileId, viewer?.id)
      return c.json({ stats })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('FOLLOW_FAILED', 'Failed to load follow stats.'), 500)
    }
  })

  app.get('/api/users/:id/followers', async (c) => {
    try {
      const viewer = await currentUser(c)
      if (!viewer) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in required.'), 401)
      }
      const users = await listFollowers(c.req.param('id'))
      return c.json({ users })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('FOLLOW_FAILED', 'Failed to load followers.'), 500)
    }
  })

  app.get('/api/users/:id/following', async (c) => {
    try {
      const viewer = await currentUser(c)
      if (!viewer) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in required.'), 401)
      }
      const users = await listFollowing(c.req.param('id'))
      return c.json({ users })
    } catch (error) {
      console.error(error)
      return c.json(errorBody('FOLLOW_FAILED', 'Failed to load following.'), 500)
    }
  })

  app.post('/api/users/:id/follow', async (c) => {
    try {
      const viewer = await currentUser(c)
      if (!viewer) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in to follow.'), 401)
      }
      const result = await toggleFollow(viewer.id, c.req.param('id'))
      if (result.isFollowing) {
        await pushNotification({
          recipientId: c.req.param('id'),
          type: 'follow',
          actorId: viewer.id,
          actorHandle: viewer.handle,
        })
      }
      return c.json(result)
    } catch (error) {
      if (statusError(error)) {
        return c.json(
          errorBody(error.code ?? 'FOLLOW_FAILED', error.message),
          error.status as 400 | 404,
        )
      }
      console.error(error)
      return c.json(errorBody('FOLLOW_FAILED', 'Failed to toggle follow.'), 500)
    }
  })

  app.get('/api/notifications', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in required.'), 401)
      }
      const notifications = await listNotificationsForUser(user.id)
      return c.json({ notifications })
    } catch (error) {
      console.error(error)
      return c.json(
        errorBody('NOTIFICATIONS_FAILED', 'Failed to load notifications.'),
        500,
      )
    }
  })

  app.post('/api/notifications/read', async (c) => {
    try {
      const user = await currentUser(c)
      if (!user) {
        return c.json(errorBody('UNAUTHORIZED', 'Sign in required.'), 401)
      }
      await markNotificationsRead(user.id)
      return c.json({ ok: true })
    } catch (error) {
      console.error(error)
      return c.json(
        errorBody('NOTIFICATIONS_FAILED', 'Failed to mark notifications read.'),
        500,
      )
    }
  })

  return app
}
