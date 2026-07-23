import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { TWEET_TTL_MS } from '../shared/constants.ts'
import {
  createTweetSchema,
  reactTweetSchema,
  tweetStoreSchema,
  type Tweet,
  type TweetStore,
} from '../shared/schemas.ts'
import { listFollowingIds } from './follows.ts'
import { DEFAULT_DATA_DIR, mutateJsonFile } from './jsonStore.ts'

function storePath(): string {
  return (
    process.env.TWEET_STORE_PATH ?? path.join(DEFAULT_DATA_DIR, 'tweets.json')
  )
}

const emptyStore = (): TweetStore => ({ tweets: [] })

function parseStore(raw: unknown): TweetStore {
  const parsed = tweetStoreSchema.safeParse(raw)
  if (!parsed.success) throw new Error('Tweet store is corrupt or invalid.')
  return parsed.data
}

function httpError(message: string, status: number, code?: string): Error {
  const error = new Error(message)
  ;(error as Error & { status: number; code?: string }).status = status
  if (code) (error as Error & { status: number; code?: string }).code = code
  return error
}

export function isTweetExpired(tweet: Tweet, now = Date.now()): boolean {
  const created = Date.parse(tweet.createdAt)
  if (Number.isNaN(created)) return true
  return now - created >= TWEET_TTL_MS
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function likedByOf(tweet: Tweet): string[] {
  return Array.isArray(tweet.likedBy) ? tweet.likedBy : []
}

/** Drop posts older than one day and persist if anything changed. */
export async function purgeExpired(): Promise<Tweet[]> {
  return mutateJsonFile(storePath(), emptyStore(), parseStore, (store) => {
    const now = Date.now()
    const live = store.tweets.filter((tweet) => !isTweetExpired(tweet, now))
    if (live.length === store.tweets.length) {
      return { store, result: live, dirty: false }
    }
    return { store: { tweets: live }, result: live }
  })
}

export async function readTweets(): Promise<Tweet[]> {
  return purgeExpired()
}

function annotateForViewer(
  tweets: Tweet[],
  userId: string | undefined,
  catalog: Tweet[] = tweets,
): Tweet[] {
  const myRepostTargets = new Set(
    userId
      ? catalog
          .filter((tweet) => tweet.userId === userId && tweet.repostOfId)
          .map((tweet) => tweet.repostOfId as string)
      : [],
  )
  return tweets.map((tweet) => {
    const likedBy = likedByOf(tweet)
    return {
      ...tweet,
      likedBy,
      likes: likedBy.length,
      reactions: tweet.reactions ?? [],
      comments: tweet.comments ?? [],
      tags: tweet.tags ?? [],
      imageUrl: tweet.imageUrl ?? null,
      replyToId: tweet.replyToId ?? null,
      repostOfId: tweet.repostOfId ?? null,
      repostOfHandle: tweet.repostOfHandle ?? null,
      repostCount: tweet.repostCount ?? 0,
      // Viewer-specific — never trust the persisted flag.
      liked: userId ? likedBy.includes(userId) : false,
      reposted: userId ? myRepostTargets.has(tweet.id) : false,
    }
  })
}

function annotateOne(
  tweet: Tweet,
  userId: string | undefined,
  catalog: Tweet[],
): Tweet {
  return annotateForViewer([tweet], userId, catalog)[0]
}

/** Public landing feed — recent originals only (no follower-gated reposts). */
export async function getPublicFeed(limit?: number): Promise<Tweet[]> {
  const tweets = await purgeExpired()
  const sorted = tweets
    .filter((tweet) => !tweet.repostOfId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const sliced = limit == null ? sorted : sorted.slice(0, limit)
  return sliced.map((tweet) => annotateOne(tweet, undefined, tweets))
}

/** Your posts + up to 5 random posts from everyone else (non-expired).
 * Others' reposts only appear if you follow the reposter.
 */
export async function getFeedForUser(userId: string): Promise<Tweet[]> {
  const tweets = await purgeExpired()
  const followingIds = await listFollowingIds(userId)
  const mine = tweets.filter((tweet) => tweet.userId === userId)
  const others = tweets.filter((tweet) => {
    if (!tweet.userId || tweet.userId === userId) return false
    // Reposts are follower-gated; originals stay in the public random pool.
    if (tweet.repostOfId) return followingIds.has(tweet.userId)
    return true
  })
  const randomOthers = shuffle(others).slice(0, 5)

  return annotateForViewer(
    [...mine, ...randomOthers].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    ),
    userId,
    tweets,
  )
}

/** Full timeline for a profile (originals, replies, and reposts). */
export async function listTweetsByUser(
  profileUserId: string,
  viewerId?: string,
): Promise<Tweet[]> {
  const tweets = await purgeExpired()
  const mine = tweets
    .filter((tweet) => tweet.userId === profileUserId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return annotateForViewer(mine, viewerId, tweets)
}

export async function searchTweets(query: string): Promise<Tweet[]> {
  const tweets = await purgeExpired()
  const q = query.trim().toLowerCase()
  if (!q) return tweets.slice(0, 40)

  return tweets
    .filter((tweet) => {
      const body = tweet.body.toLowerCase()
      const handle = tweet.handle.toLowerCase()
      const tags = (tweet.tags ?? []).join(' ').toLowerCase()
      const tagNeedle = q.replace(/^#/, '')
      return (
        body.includes(q) ||
        handle.includes(q) ||
        tags.includes(tagNeedle) ||
        body.includes(`#${tagNeedle}`)
      )
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 40)
}

/** All live tweets (for AI semantic ranking). */
export async function listLiveTweets(): Promise<Tweet[]> {
  return purgeExpired()
}

export type TrendingTopic = {
  hashtag: string
  category: string
  postCount: number
}

function categorizeHashtag(tag: string): string {
  const t = tag.toLowerCase()
  if (/mars|kuiper|europa|orbit|space|moon|zvezda/.test(t)) return 'Mission'
  if (/travel|tokyo|flight|boarding|air/.test(t)) return 'Transit'
  if (/lab|research|farnsworth|mercury|data/.test(t)) return 'Research'
  if (/signal|transmit|hud|ops|feed/.test(t)) return 'Comms'
  return 'General'
}

export async function getTrendingTopics(limit = 8): Promise<TrendingTopic[]> {
  const tweets = await purgeExpired()
  const counts = new Map<string, number>()

  for (const tweet of tweets) {
    const matches = tweet.body.match(/#[\p{L}\p{N}_]+/gu) ?? []
    for (const raw of matches) {
      const tag = raw.toLowerCase()
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  // Seed topics when the channel is quiet so Explore still reads as live.
  if (counts.size === 0) {
    return [
      { hashtag: '#kuiperalpha', category: 'Mission', postCount: 0 },
      { hashtag: '#marslanding', category: 'Mission', postCount: 0 },
      { hashtag: '#signalops', category: 'Comms', postCount: 0 },
      { hashtag: '#newtokyo', category: 'Transit', postCount: 0 },
      { hashtag: '#mercurylabs', category: 'Research', postCount: 0 },
    ].slice(0, limit)
  }

  return [...counts.entries()]
    .map(([hashtag, postCount]) => ({
      hashtag,
      category: categorizeHashtag(hashtag),
      postCount,
    }))
    .sort((a, b) => b.postCount - a.postCount || a.hashtag.localeCompare(b.hashtag))
    .slice(0, limit)
}

export async function createTweet(input: {
  body: string
  handle: string
  userId: string
  imageUrl?: string
  replyToId?: string
  tags?: string[]
}): Promise<Tweet> {
  const data = createTweetSchema.parse({
    body: input.body,
    imageUrl: input.imageUrl,
    replyToId: input.replyToId,
  })

  const tags = (input.tags ?? [])
    .map((tag) =>
      tag
        .trim()
        .toLowerCase()
        .replace(/^#/, '')
        .slice(0, 32),
    )
    .filter(Boolean)
    .slice(0, 4)

  return mutateJsonFile(storePath(), emptyStore(), parseStore, (store) => {
    const now = Date.now()
    const tweets = store.tweets.filter((tweet) => !isTweetExpired(tweet, now))

    if (data.replyToId) {
      const parent = tweets.find((tweet) => tweet.id === data.replyToId)
      if (!parent) throw httpError('Parent post not found.', 404)
    }

    const tweet: Tweet = {
      id: randomUUID(),
      body: data.body,
      handle: input.handle,
      userId: input.userId,
      createdAt: new Date().toISOString(),
      likes: 0,
      liked: false,
      likedBy: [],
      reactions: [],
      imageUrl: data.imageUrl ?? null,
      replyToId: data.replyToId ?? null,
      repostOfId: null,
      repostOfHandle: null,
      comments: [],
      repostCount: 0,
      reposted: false,
      tags,
    }

    const next = [tweet, ...tweets]
    return {
      store: { tweets: next },
      result: annotateOne(tweet, input.userId, next),
    }
  })
}

export async function commentOnTweet(input: {
  tweetId: string
  body: string
  handle: string
  userId: string
}): Promise<{ tweet: Tweet; ownerId?: string }> {
  return mutateJsonFile(storePath(), emptyStore(), parseStore, (store) => {
    const now = Date.now()
    const tweets = store.tweets.filter((tweet) => !isTweetExpired(tweet, now))
    const index = tweets.findIndex((tweet) => tweet.id === input.tweetId)
    if (index === -1) throw httpError('Tweet not found.', 404)

    const current = tweets[index]
    const comment = {
      id: randomUUID(),
      body: input.body.trim(),
      handle: input.handle,
      userId: input.userId,
      createdAt: new Date().toISOString(),
    }
    const likedBy = likedByOf(current)
    const updated: Tweet = {
      ...current,
      likedBy,
      likes: likedBy.length,
      liked: false,
      comments: [...(current.comments ?? []), comment],
      reactions: current.reactions ?? [],
      imageUrl: current.imageUrl ?? null,
      replyToId: current.replyToId ?? null,
      repostOfId: current.repostOfId ?? null,
      repostOfHandle: current.repostOfHandle ?? null,
      repostCount: current.repostCount ?? 0,
      reposted: false,
    }
    const next = [...tweets]
    next[index] = updated
    return {
      store: { tweets: next },
      result: {
        tweet: annotateOne(updated, input.userId, next),
        ownerId: current.userId,
      },
    }
  })
}

/** Create a repost entry attributed to the current user. */
export async function repostTweet(input: {
  tweetId: string
  handle: string
  userId: string
}): Promise<{ original: Tweet; repost: Tweet; ownerId?: string }> {
  return mutateJsonFile(storePath(), emptyStore(), parseStore, (store) => {
    const now = Date.now()
    const tweets = store.tweets.filter((tweet) => !isTweetExpired(tweet, now))
    const index = tweets.findIndex((tweet) => tweet.id === input.tweetId)
    if (index === -1) throw httpError('Tweet not found.', 404)

    let target = tweets[index]
    // Always attribute the repost to the root post, not another repost.
    if (target.repostOfId) {
      const root = tweets.find((tweet) => tweet.id === target.repostOfId)
      if (root) target = root
    }

    const already = tweets.some(
      (tweet) =>
        tweet.userId === input.userId && tweet.repostOfId === target.id,
    )
    if (already) {
      throw httpError('Already reposted.', 409, 'ALREADY_REPOSTED')
    }

    const targetIndex = tweets.findIndex((tweet) => tweet.id === target.id)
    if (targetIndex === -1) throw httpError('Tweet not found.', 404)

    const repost: Tweet = {
      id: randomUUID(),
      body: target.body,
      handle: input.handle,
      userId: input.userId,
      createdAt: new Date().toISOString(),
      likes: 0,
      liked: false,
      likedBy: [],
      reactions: [],
      imageUrl: target.imageUrl ?? null,
      replyToId: null,
      repostOfId: target.id,
      repostOfHandle: target.handle,
      comments: [],
      repostCount: 0,
      reposted: false,
      tags: target.tags ?? [],
    }

    const targetLikedBy = likedByOf(target)
    const updatedOriginal: Tweet = {
      ...target,
      likedBy: targetLikedBy,
      likes: targetLikedBy.length,
      liked: false,
      repostCount: (target.repostCount ?? 0) + 1,
      reactions: target.reactions ?? [],
      comments: target.comments ?? [],
      imageUrl: target.imageUrl ?? null,
      replyToId: target.replyToId ?? null,
      repostOfId: target.repostOfId ?? null,
      repostOfHandle: target.repostOfHandle ?? null,
      reposted: false,
    }

    const without = tweets.filter((_, i) => i !== targetIndex)
    const next = [repost, updatedOriginal, ...without]
    const [annotatedRepost, annotatedOriginal] = annotateForViewer(
      [repost, updatedOriginal],
      input.userId,
      next,
    )
    return {
      store: { tweets: next },
      result: {
        original: annotatedOriginal,
        repost: annotatedRepost,
        ownerId: target.userId,
      },
    }
  })
}

/** Toggle like for this viewer via likedBy ledger. */
export async function likeTweet(
  tweetId: string,
  viewerId: string,
): Promise<{ tweet: Tweet; justLiked: boolean; ownerId?: string }> {
  return mutateJsonFile(storePath(), emptyStore(), parseStore, (store) => {
    const now = Date.now()
    const tweets = store.tweets.filter((tweet) => !isTweetExpired(tweet, now))
    const index = tweets.findIndex((tweet) => tweet.id === tweetId)

    if (index === -1) {
      throw httpError('Tweet not found.', 404)
    }

    const current = tweets[index]
    const likedBy = [...likedByOf(current)]
    const existing = likedBy.indexOf(viewerId)
    let justLiked: boolean
    if (existing >= 0) {
      likedBy.splice(existing, 1)
      justLiked = false
    } else {
      likedBy.push(viewerId)
      justLiked = true
    }

    const updated: Tweet = {
      ...current,
      likedBy,
      likes: likedBy.length,
      liked: false,
      reactions: current.reactions ?? [],
      comments: current.comments ?? [],
      imageUrl: current.imageUrl ?? null,
      replyToId: current.replyToId ?? null,
      repostOfId: current.repostOfId ?? null,
      repostOfHandle: current.repostOfHandle ?? null,
      repostCount: current.repostCount ?? 0,
      reposted: false,
    }
    const next = [...tweets]
    next[index] = updated
    return {
      store: { tweets: next },
      result: {
        tweet: annotateOne(updated, viewerId, next),
        justLiked,
        ownerId: current.userId,
      },
    }
  })
}

export async function deleteTweet(
  tweetId: string,
  userId: string,
): Promise<void> {
  await mutateJsonFile(storePath(), emptyStore(), parseStore, (store) => {
    const now = Date.now()
    const tweets = store.tweets.filter((tweet) => !isTweetExpired(tweet, now))
    const index = tweets.findIndex((tweet) => tweet.id === tweetId)

    if (index === -1) {
      throw httpError('Tweet not found.', 404)
    }

    const tweet = tweets[index]
    if (tweet.userId !== userId) {
      throw httpError('You can only delete your own posts.', 403, 'FORBIDDEN')
    }

    let next = tweets.filter((_, i) => i !== index)

    if (tweet.repostOfId) {
      // Deleting a repost — decrement the original's repostCount.
      next = next.map((item) => {
        if (item.id !== tweet.repostOfId) return item
        return {
          ...item,
          repostCount: Math.max(0, (item.repostCount ?? 0) - 1),
        }
      })
    } else {
      // Deleting an original — remove orphaned reposts that point at it.
      next = next.filter((item) => item.repostOfId !== tweet.id)
    }

    return { store: { tweets: next }, result: undefined }
  })
}

/** Toggle an emoji reaction for this user (add if missing, remove if present). */
export async function reactToTweet(
  tweetId: string,
  userId: string,
  emojiRaw: string,
): Promise<{
  tweet: Tweet
  justAdded: boolean
  ownerId?: string
  emoji: string
}> {
  const { emoji } = reactTweetSchema.parse({ emoji: emojiRaw })
  return mutateJsonFile(storePath(), emptyStore(), parseStore, (store) => {
    const now = Date.now()
    const tweets = store.tweets.filter((tweet) => !isTweetExpired(tweet, now))
    const index = tweets.findIndex((tweet) => tweet.id === tweetId)

    if (index === -1) {
      throw httpError('Tweet not found.', 404)
    }

    const current = tweets[index]
    const reactions = [...(current.reactions ?? [])]
    const existing = reactions.findIndex(
      (reaction) => reaction.userId === userId && reaction.emoji === emoji,
    )

    if (existing >= 0) {
      reactions.splice(existing, 1)
    } else {
      reactions.push({ emoji, userId })
    }

    const likedBy = likedByOf(current)
    const updated: Tweet = {
      ...current,
      likedBy,
      likes: likedBy.length,
      liked: false,
      reactions,
      comments: current.comments ?? [],
      imageUrl: current.imageUrl ?? null,
      replyToId: current.replyToId ?? null,
      repostOfId: current.repostOfId ?? null,
      repostOfHandle: current.repostOfHandle ?? null,
      repostCount: current.repostCount ?? 0,
      reposted: false,
    }
    const next = [...tweets]
    next[index] = updated
    return {
      store: { tweets: next },
      result: {
        tweet: annotateOne(updated, userId, next),
        justAdded: existing < 0,
        ownerId: current.userId,
        emoji,
      },
    }
  })
}
