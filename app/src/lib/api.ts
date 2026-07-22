import {
  TWEET_MAX_CHARS,
  REACTION_EMOJIS,
  type ApiErrorBody,
  type PublicUser,
  type Tweet,
} from '../../shared/schemas'

export type { Tweet, PublicUser }
export { REACTION_EMOJIS }

export class ApiClientError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = body.error.code
    this.details = body.error.details
  }
}

const jsonHeaders = { 'Content-Type': 'application/json' }

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new ApiClientError(response.status, {
      error: {
        code: 'BAD_RESPONSE',
        message:
          response.status === 404
            ? 'API route missing — restart npm run dev.'
            : `Request failed (${response.status}).`,
      },
    })
  }
  if (!response.ok) {
    const errBody = body as ApiErrorBody
    if (errBody?.error?.message) {
      throw new ApiClientError(response.status, errBody)
    }
    throw new ApiClientError(response.status, {
      error: {
        code: 'REQUEST_FAILED',
        message: `Request failed (${response.status}).`,
      },
    })
  }
  return body as T
}

function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: 'include',
  })
}

export async function getMe(): Promise<PublicUser | null> {
  const response = await apiFetch('/api/auth/me')
  if (response.status === 401) return null
  const data = await parseResponse<{ user: PublicUser }>(response)
  return data.user
}

export async function requestCode(email: string): Promise<void> {
  const response = await apiFetch('/api/auth/request-code', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email }),
  })
  await parseResponse<{ ok: boolean }>(response)
}

export async function signup(input: {
  email: string
  code: string
  password: string
  handle: string
}): Promise<PublicUser> {
  const response = await apiFetch('/api/auth/signup', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
  })
  const data = await parseResponse<{ user: PublicUser }>(response)
  return data.user
}

export async function login(input: {
  email: string
  password: string
}): Promise<PublicUser> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
  })
  const data = await parseResponse<{ user: PublicUser }>(response)
  return data.user
}

export async function logout(): Promise<void> {
  const response = await apiFetch('/api/auth/logout', { method: 'POST' })
  await parseResponse<{ ok: boolean }>(response)
}

export async function listTweets(): Promise<Tweet[]> {
  const response = await apiFetch('/api/tweets')
  const data = await parseResponse<{ tweets: Tweet[] }>(response)
  return data.tweets
}

export async function postTweet(input: {
  body: string
  imageUrl?: string
  replyToId?: string
}): Promise<Tweet> {
  if (input.body.length > TWEET_MAX_CHARS) {
    throw new ApiClientError(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: `Tweet must be at most ${TWEET_MAX_CHARS} characters.`,
      },
    })
  }

  const response = await apiFetch('/api/tweets', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
  })
  const data = await parseResponse<{ tweet: Tweet }>(response)
  return data.tweet
}

export async function commentTweet(
  tweetId: string,
  body: string,
): Promise<Tweet> {
  const response = await apiFetch(`/api/tweets/${tweetId}/comment`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ body }),
  })
  const data = await parseResponse<{ tweet: Tweet }>(response)
  return data.tweet
}

export async function repostTweet(
  tweetId: string,
): Promise<{ original: Tweet; repost: Tweet }> {
  const response = await apiFetch(`/api/tweets/${tweetId}/repost`, {
    method: 'POST',
  })
  return parseResponse<{ original: Tweet; repost: Tweet }>(response)
}

export async function likeTweet(tweetId: string): Promise<Tweet> {
  const response = await apiFetch(`/api/tweets/${tweetId}/like`, {
    method: 'POST',
  })
  const data = await parseResponse<{ tweet: Tweet }>(response)
  return data.tweet
}

export async function reactToTweet(
  tweetId: string,
  emoji: string,
): Promise<Tweet> {
  const response = await apiFetch(`/api/tweets/${tweetId}/react`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ emoji }),
  })
  const data = await parseResponse<{ tweet: Tweet }>(response)
  return data.tweet
}

export async function deleteTweet(tweetId: string): Promise<void> {
  const response = await apiFetch(`/api/tweets/${tweetId}`, {
    method: 'DELETE',
  })
  await parseResponse<{ ok: boolean }>(response)
}

export type TrendingTopic = {
  hashtag: string
  category: string
  postCount: number
}

export async function searchExplore(
  query: string,
  options?: { semantic?: boolean },
): Promise<{ tweets: Tweet[]; users: PublicUser[]; semantic?: boolean }> {
  const params = new URLSearchParams()
  if (query.trim()) params.set('q', query.trim())
  if (options?.semantic) params.set('semantic', '1')
  const response = await apiFetch(`/api/explore/search?${params.toString()}`)
  const data = await parseResponse<{
    tweets: Tweet[]
    users?: PublicUser[]
    semantic?: boolean
  }>(response)
  return {
    tweets: data.tweets,
    users: data.users ?? [],
    semantic: data.semantic,
  }
}

export type AssistMode = 'polished' | 'concise' | 'hashtags' | 'summarize'

export async function aiAssist(
  body: string,
  mode: AssistMode,
): Promise<string> {
  const response = await apiFetch('/api/ai/assist', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ body, mode }),
  })
  const data = await parseResponse<{ text: string }>(response)
  return data.text
}

export async function aiSemanticSearch(query: string): Promise<Tweet[]> {
  const response = await apiFetch('/api/ai/search', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ query }),
  })
  const data = await parseResponse<{ tweets: Tweet[] }>(response)
  return data.tweets
}

export type CompanionChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export async function aiCompanion(
  message: string,
  history?: CompanionChatMessage[],
): Promise<string> {
  const response = await apiFetch('/api/ai/companion', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ message, history }),
  })
  const data = await parseResponse<{ reply: string }>(response)
  return data.reply
}

export async function aiStatus(): Promise<boolean> {
  const response = await apiFetch('/api/ai/status')
  const data = await parseResponse<{ configured: boolean }>(response)
  return Boolean(data.configured)
}

export async function searchUsers(query: string): Promise<PublicUser[]> {
  const params = new URLSearchParams()
  if (query.trim()) params.set('q', query.trim())
  const response = await apiFetch(`/api/users/search?${params.toString()}`)
  const data = await parseResponse<{ users: PublicUser[] }>(response)
  return data.users
}

export async function fetchTrending(): Promise<TrendingTopic[]> {
  const response = await apiFetch('/api/explore/trending')
  const data = await parseResponse<{ topics: TrendingTopic[] }>(response)
  return data.topics
}

export async function fetchSuggestions(): Promise<PublicUser[]> {
  const response = await apiFetch('/api/explore/suggestions')
  const data = await parseResponse<{ users: PublicUser[] }>(response)
  return data.users
}

export type DmMessage = {
  id: string
  fromUserId: string
  toUserId: string
  body: string
  createdAt: string
}

export type DmConversation = {
  peer: PublicUser
  preview: string
  updatedAt: string
  messages: DmMessage[]
}

export async function listMessageConversations(): Promise<DmConversation[]> {
  const response = await apiFetch('/api/messages')
  const data = await parseResponse<{ conversations: DmConversation[] }>(
    response,
  )
  return data.conversations
}

export async function getMessageThread(
  peerId: string,
): Promise<DmConversation> {
  const response = await apiFetch(`/api/messages/${peerId}`)
  const data = await parseResponse<{ thread: DmConversation }>(response)
  return data.thread
}

export async function sendDirectMessage(input: {
  toUserId: string
  body: string
}): Promise<DmMessage> {
  const response = await apiFetch('/api/messages', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
  })
  const data = await parseResponse<{ message: DmMessage }>(response)
  return data.message
}

export type FollowStats = {
  followers: number
  following: number
  isFollowing: boolean
}

export async function fetchFollowStats(
  userId: string,
): Promise<FollowStats> {
  const response = await apiFetch(`/api/users/${userId}/follow-stats`)
  const data = await parseResponse<{ stats: FollowStats }>(response)
  return data.stats
}

export async function fetchFollowers(userId: string): Promise<PublicUser[]> {
  const response = await apiFetch(`/api/users/${userId}/followers`)
  const data = await parseResponse<{ users: PublicUser[] }>(response)
  return data.users
}

export async function fetchFollowing(userId: string): Promise<PublicUser[]> {
  const response = await apiFetch(`/api/users/${userId}/following`)
  const data = await parseResponse<{ users: PublicUser[] }>(response)
  return data.users
}

export async function toggleFollowUser(
  userId: string,
): Promise<{ isFollowing: boolean; stats: FollowStats }> {
  const response = await apiFetch(`/api/users/${userId}/follow`, {
    method: 'POST',
  })
  return parseResponse<{ isFollowing: boolean; stats: FollowStats }>(response)
}

export async function fetchUserTweets(userId: string): Promise<Tweet[]> {
  const response = await apiFetch(`/api/users/${userId}/tweets`)
  const data = await parseResponse<{ tweets: Tweet[] }>(response)
  return data.tweets
}

export type AppNotification = {
  id: string
  recipientId: string
  type: 'like' | 'comment' | 'repost' | 'reaction' | 'follow'
  actorId: string
  actorHandle: string
  tweetId?: string | null
  body?: string | null
  createdAt: string
  read: boolean
}

export async function listNotifications(): Promise<AppNotification[]> {
  const response = await apiFetch('/api/notifications')
  const data = await parseResponse<{ notifications: AppNotification[] }>(
    response,
  )
  return data.notifications
}

export async function markNotificationsRead(): Promise<void> {
  const response = await apiFetch('/api/notifications/read', { method: 'POST' })
  await parseResponse<{ ok: boolean }>(response)
}

export type PlatformStats = {
  users: number
  livePosts: number
  messageThreads: number
  follows: number
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const response = await apiFetch('/api/stats')
  const data = await parseResponse<{ stats: PlatformStats }>(response)
  return data.stats
}

export { TWEET_MAX_CHARS }
