import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { clearRateLimitBuckets } from './rateLimit.ts'
import { TWEET_MAX_CHARS } from '../shared/constants.ts'

async function withTempStores() {
  const dir = await mkdtemp(path.join(tmpdir(), 'transmit-api-'))
  process.env.TWEET_STORE_PATH = path.join(dir, 'tweets.json')
  process.env.USERS_STORE_PATH = path.join(dir, 'users.json')
  process.env.OTPS_STORE_PATH = path.join(dir, 'otps.json')
  process.env.SESSION_SECRET = 'test-session-secret-32chars!!'
  process.env.AUTH_TEST_OTP = '123456'
  delete process.env.RESEND_API_KEY
  return dir
}

function cookieFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? []
  if (raw.length > 0) {
    return raw.map((part) => part.split(';')[0]).join('; ')
  }
  const single = response.headers.get('set-cookie')
  return single ? single.split(';')[0] : ''
}

async function signupSession(
  app: ReturnType<typeof createApp>,
  email = 'ops@kuiper.test',
  handle = 'ops',
) {
  await app.request('/api/auth/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })

  const signup = await app.request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      code: '123456',
      password: 'securepass',
      handle,
    }),
  })

  expect(signup.status).toBe(201)
  return cookieFrom(signup)
}

describe('API edge cases', () => {
  let tempDir: string
  const app = createApp()

  beforeEach(async () => {
    clearRateLimitBuckets()
    tempDir = await withTempStores()
  })

  afterEach(async () => {
    delete process.env.TWEET_STORE_PATH
    delete process.env.USERS_STORE_PATH
    delete process.env.OTPS_STORE_PATH
    delete process.env.AUTH_TEST_OTP
    await rm(tempDir, { recursive: true, force: true })
  })

  it('rejects unauthenticated posts with 401', async () => {
    const response = await app.request('/api/tweets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'no session' }),
    })
    expect(response.status).toBe(401)
  })

  it('rejects empty posts with 400 VALIDATION_ERROR', async () => {
    const cookie = await signupSession(app)
    const response = await app.request('/api/tweets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ body: '' }),
    })

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects whitespace-only posts', async () => {
    const cookie = await signupSession(app)
    const response = await app.request('/api/tweets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ body: '\n\t  ' }),
    })

    expect(response.status).toBe(400)
  })

  it('rejects character limit overflows', async () => {
    const cookie = await signupSession(app)
    const response = await app.request('/api/tweets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        body: 'x'.repeat(TWEET_MAX_CHARS + 1),
      }),
    })

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error.code).toBe('VALIDATION_ERROR')
    expect(JSON.stringify(payload.error.details)).toContain(String(TWEET_MAX_CHARS))
  })

  it('accepts a post at the character limit', async () => {
    const cookie = await signupSession(app)
    const body = Array.from({ length: TWEET_MAX_CHARS }, (_, i) =>
      String.fromCharCode(97 + (i % 26)),
    ).join('')
    const response = await app.request('/api/tweets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ body }),
    })

    expect(response.status).toBe(201)
    const payload = await response.json()
    expect(payload.tweet.body).toHaveLength(TWEET_MAX_CHARS)
    expect(payload.tweet.handle).toBe('@ops')
    expect(payload.tweet.likes).toBe(0)
    expect(payload.tweet.liked).toBe(false)
  })

  it('toggles like counter on / off', async () => {
    const cookie = await signupSession(app)
    const created = await app.request('/api/tweets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ body: 'toggle me' }),
    })
    const { tweet } = await created.json()

    const liked = await app.request(`/api/tweets/${tweet.id}/like`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(liked.status).toBe(200)
    const afterLike = await liked.json()
    expect(afterLike.tweet.likes).toBe(1)
    expect(afterLike.tweet.liked).toBe(true)

    const unliked = await app.request(`/api/tweets/${tweet.id}/like`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(unliked.status).toBe(200)
    const afterUnlike = await unliked.json()
    expect(afterUnlike.tweet.likes).toBe(0)
    expect(afterUnlike.tweet.liked).toBe(false)
  })

  it('persists like toggle across list reads', async () => {
    const cookie = await signupSession(app)
    const created = await app.request('/api/tweets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ body: 'persist like' }),
    })
    const { tweet } = await created.json()

    await app.request(`/api/tweets/${tweet.id}/like`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })

    const listed = await app.request('/api/tweets', {
      headers: { Cookie: cookie },
    })
    const feed = await listed.json()
    const found = feed.tweets.find((item: { id: string }) => item.id === tweet.id)

    expect(found.likes).toBe(1)
    expect(found.liked).toBe(true)
  })

  it('toggles emoji reaction buttons', async () => {
    const cookie = await signupSession(app, 'reactor@kuiper.test', 'reactor')
    const created = await app.request('/api/tweets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ body: 'react to me' }),
    })
    const { tweet } = await created.json()

    const reacted = await app.request(`/api/tweets/${tweet.id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ emoji: '🔥' }),
    })
    expect(reacted.status).toBe(200)
    const after = await reacted.json()
    expect(after.tweet.reactions).toHaveLength(1)
    expect(after.tweet.reactions[0].emoji).toBe('🔥')
  })
})
