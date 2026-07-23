import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { clearRateLimitBuckets } from './rateLimit.ts'
import { loginSchema, signupSchema } from '../shared/schemas.ts'

async function withTempStores() {
  const dir = await mkdtemp(path.join(tmpdir(), 'transmit-auth-'))
  process.env.TWEET_STORE_PATH = path.join(dir, 'tweets.json')
  process.env.USERS_STORE_PATH = path.join(dir, 'users.json')
  process.env.SESSION_SECRET = 'test-session-secret-32chars!!'
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

describe('auth schemas', () => {
  it('rejects invalid email on signup', () => {
    expect(
      signupSchema.safeParse({
        email: 'not-an-email',
        password: 'securepass',
        handle: 'ops',
      }).success,
    ).toBe(false)
  })

  it('rejects short password on signup', () => {
    expect(
      signupSchema.safeParse({
        email: 'a@b.co',
        password: 'short',
        handle: 'ops',
      }).success,
    ).toBe(false)
  })

  it('rejects short password on login payload still requires password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(
      false,
    )
  })
})

describe('auth API', () => {
  let tempDir: string
  const app = createApp()

  beforeEach(async () => {
    clearRateLimitBuckets()
    tempDir = await withTempStores()
  })

  afterEach(async () => {
    delete process.env.TWEET_STORE_PATH
    delete process.env.USERS_STORE_PATH
    await rm(tempDir, { recursive: true, force: true })
  })

  it('rejects signup with invalid payload', async () => {
    const response = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'securepass',
        handle: 'lone',
      }),
    })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('signs up directly then logs in again', async () => {
    const email = 'pilot@kuiper.test'

    const signup = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'securepass',
        handle: 'pilot',
      }),
    })
    expect(signup.status).toBe(201)
    const created = await signup.json()
    expect(created.user.handle).toBe('@pilot')
    expect(created.user.email).toBe(email)
    expect(created.user.passwordHash).toBeUndefined()

    const me = await app.request('/api/auth/me', {
      headers: { Cookie: cookieFrom(signup) },
    })
    expect(me.status).toBe(200)
    const meBody = await me.json()
    expect(meBody.user.email).toBe(email)

    await app.request('/api/auth/logout', { method: 'POST' })

    const badLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password' }),
    })
    expect(badLogin.status).toBe(401)

    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'securepass' }),
    })
    expect(login.status).toBe(200)
    const loggedIn = await login.json()
    expect(loggedIn.user.handle).toBe('@pilot')
  })

  it('rejects duplicate email on signup', async () => {
    const email = 'dup@kuiper.test'
    const first = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'securepass',
        handle: 'dup',
      }),
    })
    expect(first.status).toBe(201)

    const again = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'securepass',
        handle: 'dup2',
      }),
    })
    expect(again.status).toBe(409)
    const body = await again.json()
    expect(body.error.code).toBe('EMAIL_TAKEN')
  })
})
