import { apiUrl } from '../config'
import {
  TWEET_MAX_CHARS,
  REACTION_EMOJIS,
  type ApiErrorBody,
  type PrivateUser,
  type PublicUser,
  type Tweet,
} from '../../shared/schemas'

export type { Tweet, PublicUser, PrivateUser }
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
            ? 'API route missing (404). Check the Render API is up and API_BASE_URL points at https://sevenransmi7.onrender.com.'
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

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
  })
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeTweet(raw: Partial<Tweet> | null | undefined): Tweet | null {
  if (!raw || typeof raw !== 'object' || !raw.id) return null
  const likedBy = Array.isArray(raw.likedBy)
    ? raw.likedBy.map(String)
    : []
  return {
    id: String(raw.id),
    userId: raw.userId ? String(raw.userId) : undefined,
    handle: String(raw.handle ?? 'unknown'),
    body: String(raw.body ?? ''),
    imageUrl: raw.imageUrl ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    createdAt: String(raw.createdAt ?? new Date(0).toISOString()),
    likes: asNumber(raw.likes),
    liked: Boolean(raw.liked),
    likedBy,
    reactions: Array.isArray(raw.reactions) ? raw.reactions : [],
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    replyToId: raw.replyToId ?? null,
    repostOfId: raw.repostOfId ?? null,
    repostOfHandle: raw.repostOfHandle ?? null,
    repostCount: asNumber(raw.repostCount),
    reposted: Boolean(raw.reposted),
  }
}

function normalizeTweets(raw: unknown): Tweet[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => normalizeTweet(item as Partial<Tweet>))
    .filter((tweet): tweet is Tweet => tweet !== null)
}

function normalizeUser(raw: Partial<PublicUser> | null | undefined): PublicUser | null {
  if (!raw || typeof raw !== 'object' || !raw.id) return null
  return {
    id: String(raw.id),
    handle: String(raw.handle ?? 'unknown'),
    createdAt: String(raw.createdAt ?? new Date(0).toISOString()),
  }
}

function normalizePrivateUser(
  raw: Partial<PrivateUser> | null | undefined,
): PrivateUser | null {
  const base = normalizeUser(raw)
  if (!base) return null
  const email =
    raw && typeof raw === 'object' && typeof raw.email === 'string'
      ? raw.email
      : ''
  return { ...base, email }
}

function normalizeMessage(
  raw: Partial<DmMessage> | null | undefined,
): DmMessage | null {
  if (!raw || typeof raw !== 'object' || !raw.id) return null
  return {
    id: String(raw.id),
    fromUserId: String(raw.fromUserId ?? ''),
    toUserId: String(raw.toUserId ?? ''),
    body: String(raw.body ?? ''),
    createdAt: String(raw.createdAt ?? new Date(0).toISOString()),
  }
}

function normalizeConversation(
  raw: Partial<DmConversation> | null | undefined,
): DmConversation | null {
  if (!raw || typeof raw !== 'object') return null
  const peer = normalizeUser(raw.peer as Partial<PublicUser> | undefined)
  if (!peer) return null
  const messages = Array.isArray(raw.messages)
    ? raw.messages
        .map((item) => normalizeMessage(item as Partial<DmMessage>))
        .filter((msg): msg is DmMessage => msg !== null)
    : []
  return {
    peer,
    preview: String(raw.preview ?? ''),
    updatedAt: String(raw.updatedAt ?? new Date(0).toISOString()),
    messages,
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await apiFetch('/api/health')
    if (!response.ok) return false
    const data = await parseResponse<{ ok?: boolean; status?: string }>(
      response,
    )
    return Boolean(data.ok) || data.status === 'ok'
  } catch {
    return false
  }
}

export async function getMe(): Promise<PrivateUser | null> {
  const response = await apiFetch('/api/auth/me')
  if (response.status === 401) return null
  const data = await parseResponse<{ user: PrivateUser }>(response)
  return normalizePrivateUser(data.user)
}

export async function forgotPassword(email: string): Promise<void> {
  const response = await apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email }),
  })
  await parseResponse<{ ok: boolean }>(response)
}

export async function resetPassword(input: {
  email: string
  code: string
  password: string
}): Promise<void> {
  const response = await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
  })
  await parseResponse<{ ok: boolean }>(response)
}

export async function signup(input: {
  email: string
  password: string
  handle: string
}): Promise<PrivateUser> {
  const response = await apiFetch('/api/auth/signup', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
  })
  const data = await parseResponse<{ user: PrivateUser }>(response)
  const user = normalizePrivateUser(data.user)
  if (!user) {
    throw new ApiClientError(500, {
      error: { code: 'BAD_USER', message: 'Invalid user payload from API.' },
    })
  }
  return user
}

export async function login(input: {
  email: string
  password: string
}): Promise<PrivateUser> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
  })
  const data = await parseResponse<{ user: PrivateUser }>(response)
  const user = normalizePrivateUser(data.user)
  if (!user) {
    throw new ApiClientError(500, {
      error: { code: 'BAD_USER', message: 'Invalid user payload from API.' },
    })
  }
  return user
}

export async function logout(): Promise<void> {
  const response = await apiFetch('/api/auth/logout', { method: 'POST' })
  await parseResponse<{ ok: boolean }>(response)
}

export async function listTweets(options?: {
  limit?: number
  cursor?: string
}): Promise<{ tweets: Tweet[]; nextCursor: string | null }> {
  const params = new URLSearchParams()
  if (options?.limit != null) params.set('limit', String(options.limit))
  if (options?.cursor) params.set('cursor', options.cursor)
  const qs = params.toString()
  const response = await apiFetch(qs ? `/api/tweets?${qs}` : '/api/tweets')
  const data = await parseResponse<
    { tweets?: Tweet[]; nextCursor?: string | null } | Tweet[]
  >(response)
  if (Array.isArray(data)) {
    return { tweets: normalizeTweets(data), nextCursor: null }
  }
  return {
    tweets: normalizeTweets(data.tweets),
    nextCursor: data.nextCursor ?? null,
  }
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
  const tweet = normalizeTweet(data.tweet)
  if (!tweet) {
    throw new ApiClientError(500, {
      error: { code: 'BAD_TWEET', message: 'Invalid tweet payload from API.' },
    })
  }
  return tweet
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
  const tweet = normalizeTweet(data.tweet)
  if (!tweet) {
    throw new ApiClientError(500, {
      error: { code: 'BAD_TWEET', message: 'Invalid tweet payload from API.' },
    })
  }
  return tweet
}

export async function repostTweet(
  tweetId: string,
): Promise<{ original: Tweet; repost: Tweet }> {
  const response = await apiFetch(`/api/tweets/${tweetId}/repost`, {
    method: 'POST',
  })
  const data = await parseResponse<{ original: Tweet; repost: Tweet }>(response)
  const original = normalizeTweet(data.original)
  const repost = normalizeTweet(data.repost)
  if (!original || !repost) {
    throw new ApiClientError(500, {
      error: { code: 'BAD_TWEET', message: 'Invalid repost payload from API.' },
    })
  }
  return { original, repost }
}

export async function likeTweet(tweetId: string): Promise<Tweet> {
  const response = await apiFetch(`/api/tweets/${tweetId}/like`, {
    method: 'POST',
  })
  const data = await parseResponse<{ tweet: Tweet }>(response)
  const tweet = normalizeTweet(data.tweet)
  if (!tweet) {
    throw new ApiClientError(500, {
      error: { code: 'BAD_TWEET', message: 'Invalid tweet payload from API.' },
    })
  }
  return tweet
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
  const tweet = normalizeTweet(data.tweet)
  if (!tweet) {
    throw new ApiClientError(500, {
      error: { code: 'BAD_TWEET', message: 'Invalid tweet payload from API.' },
    })
  }
  return tweet
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
    tweets?: Tweet[]
    users?: PublicUser[]
    semantic?: boolean
  }>(response)
  return {
    tweets: normalizeTweets(data.tweets),
    users: (data.users ?? [])
      .map((user) => normalizeUser(user))
      .filter((user): user is PublicUser => user !== null),
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
  return String(data.text ?? '')
}

export async function aiSemanticSearch(query: string): Promise<Tweet[]> {
  const response = await apiFetch('/api/ai/search', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ query }),
  })
  const data = await parseResponse<{ tweets?: Tweet[] }>(response)
  return normalizeTweets(data.tweets)
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
  return String(data.reply ?? '')
}

export async function searchUsers(query: string): Promise<PublicUser[]> {
  const params = new URLSearchParams()
  if (query.trim()) params.set('q', query.trim())
  const response = await apiFetch(`/api/users/search?${params.toString()}`)
  const data = await parseResponse<{ users?: PublicUser[] }>(response)
  return (data.users ?? [])
    .map((user) => normalizeUser(user))
    .filter((user): user is PublicUser => user !== null)
}

export async function fetchTrending(): Promise<TrendingTopic[]> {
  const response = await apiFetch('/api/explore/trending')
  const data = await parseResponse<{ topics?: TrendingTopic[] }>(response)
  return (data.topics ?? []).map((topic) => ({
    hashtag: String(topic?.hashtag ?? ''),
    category: String(topic?.category ?? ''),
    postCount: asNumber(topic?.postCount),
  }))
}

export async function fetchSuggestions(): Promise<PublicUser[]> {
  const response = await apiFetch('/api/explore/suggestions')
  if (response.status === 401) return []
  const data = await parseResponse<{ users?: PublicUser[] }>(response)
  return (data.users ?? [])
    .map((user) => normalizeUser(user))
    .filter((user): user is PublicUser => user !== null)
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
  const data = await parseResponse<{ conversations?: DmConversation[] }>(
    response,
  )
  return (data.conversations ?? [])
    .map((item) => normalizeConversation(item))
    .filter((item): item is DmConversation => item !== null)
}

export async function getMessageThread(
  peerId: string,
): Promise<DmConversation> {
  const response = await apiFetch(`/api/messages/${peerId}`)
  const data = await parseResponse<{ thread: DmConversation }>(response)
  const thread = normalizeConversation(data.thread)
  if (!thread) {
    throw new ApiClientError(500, {
      error: {
        code: 'BAD_THREAD',
        message: 'Invalid message thread payload from API.',
      },
    })
  }
  return thread
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
  const message = normalizeMessage(data.message)
  if (!message) {
    throw new ApiClientError(500, {
      error: {
        code: 'BAD_MESSAGE',
        message: 'Invalid message payload from API.',
      },
    })
  }
  return message
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
  const data = await parseResponse<{ stats?: FollowStats }>(response)
  return {
    followers: asNumber(data.stats?.followers),
    following: asNumber(data.stats?.following),
    isFollowing: Boolean(data.stats?.isFollowing),
  }
}

export async function fetchFollowers(userId: string): Promise<PublicUser[]> {
  const response = await apiFetch(`/api/users/${userId}/followers`)
  const data = await parseResponse<{ users?: PublicUser[] }>(response)
  return (data.users ?? [])
    .map((user) => normalizeUser(user))
    .filter((user): user is PublicUser => user !== null)
}

export async function fetchFollowing(userId: string): Promise<PublicUser[]> {
  const response = await apiFetch(`/api/users/${userId}/following`)
  const data = await parseResponse<{ users?: PublicUser[] }>(response)
  return (data.users ?? [])
    .map((user) => normalizeUser(user))
    .filter((user): user is PublicUser => user !== null)
}

export async function toggleFollowUser(
  userId: string,
): Promise<{ isFollowing: boolean; stats: FollowStats }> {
  const response = await apiFetch(`/api/users/${userId}/follow`, {
    method: 'POST',
  })
  const data = await parseResponse<{
    isFollowing?: boolean
    stats?: FollowStats
  }>(response)
  return {
    isFollowing: Boolean(data.isFollowing),
    stats: {
      followers: asNumber(data.stats?.followers),
      following: asNumber(data.stats?.following),
      isFollowing: Boolean(data.stats?.isFollowing ?? data.isFollowing),
    },
  }
}

export async function toggleBlockUser(
  userId: string,
): Promise<{ isBlocked: boolean }> {
  const response = await apiFetch(`/api/users/${userId}/block`, {
    method: 'POST',
  })
  const data = await parseResponse<{ isBlocked?: boolean }>(response)
  return { isBlocked: Boolean(data.isBlocked) }
}

export async function fetchUserTweets(userId: string): Promise<Tweet[]> {
  const response = await apiFetch(`/api/users/${userId}/tweets`)
  const data = await parseResponse<{ tweets?: Tweet[] }>(response)
  return normalizeTweets(data.tweets)
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

export async function listNotifications(options?: {
  limit?: number
  cursor?: string
}): Promise<{ notifications: AppNotification[]; nextCursor: string | null }> {
  const params = new URLSearchParams()
  if (options?.limit != null) params.set('limit', String(options.limit))
  if (options?.cursor) params.set('cursor', options.cursor)
  const qs = params.toString()
  const response = await apiFetch(
    qs ? `/api/notifications?${qs}` : '/api/notifications',
  )
  const data = await parseResponse<{
    notifications?: AppNotification[]
    nextCursor?: string | null
  }>(response)
  return {
    notifications: (data.notifications ?? []).map((item) => ({
      id: String(item?.id ?? ''),
      recipientId: String(item?.recipientId ?? ''),
      type: item?.type ?? 'like',
      actorId: String(item?.actorId ?? ''),
      actorHandle: String(item?.actorHandle ?? 'unknown'),
      tweetId: item?.tweetId ?? null,
      body: item?.body ?? null,
      createdAt: String(item?.createdAt ?? new Date(0).toISOString()),
      read: Boolean(item?.read),
    })),
    nextCursor: data.nextCursor ?? null,
  }
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
  const data = await parseResponse<{ stats?: Partial<PlatformStats> }>(response)
  return {
    users: asNumber(data.stats?.users),
    livePosts: asNumber(data.stats?.livePosts),
    messageThreads: asNumber(data.stats?.messageThreads),
    follows: asNumber(data.stats?.follows),
  }
}

export { API_BASE_URL } from '../config'
export { TWEET_MAX_CHARS }
