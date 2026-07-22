import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import {
  loginSchema,
  requestCodeSchema,
  signupSchema,
} from '../shared/schemas.ts'

async function withTempStores() {
  const dir = await mkdtemp(path.join(tmpdir(), 'transmit-auth-'))
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

describe('auth schemas', () => {
  it('rejects invalid email', () => {
    expect(requestCodeSchema.safeParse({ email: 'not-an-email' }).success).toBe(
      false,
    )
  })

  it('rejects empty OTP', () => {
    expect(
      signupSchema.safeParse({
        email: 'a@b.co',
        code: '',
        password: 'securepass',
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
    tempDir = await withTempStores()
  })

  afterEach(async () => {
    delete process.env.TWEET_STORE_PATH
    delete process.env.USERS_STORE_PATH
    delete process.env.OTPS_STORE_PATH
    delete process.env.AUTH_TEST_OTP
    await rm(tempDir, { recursive: true, force: true })
  })

  it('rejects signup without a prior code', async () => {
    const response = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'lone@kuiper.test',
        code: '123456',
        password: 'securepass',
        handle: 'lone',
      }),
    })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('OTP_INVALID')
  })

  it('rejects wrong OTP', async () => {
    await app.request('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wrong@kuiper.test' }),
    })

    const response = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'wrong@kuiper.test',
        code: '000000',
        password: 'securepass',
        handle: 'wrong',
      }),
    })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('OTP_INVALID')
  })

  it('signs up with valid OTP then logs in again', async () => {
    const email = 'pilot@kuiper.test'

    const codeRes = await app.request('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    expect(codeRes.status).toBe(200)

    const signup = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        code: '123456',
        password: 'securepass',
        handle: 'pilot',
      }),
    })
    expect(signup.status).toBe(201)
    const created = await signup.json()
    expect(created.user.handle).toBe('@pilot')
    expect(created.user.email).toBe(email)

    const me = await app.request('/api/auth/me', {
      headers: { Cookie: cookieFrom(signup) },
    })
    expect(me.status).toBe(200)

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

  it('rejects duplicate email on request-code after signup', async () => {
    const email = 'dup@kuiper.test'
    await app.request('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        code: '123456',
        password: 'securepass',
        handle: 'dup',
      }),
    })

    const again = await app.request('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    expect(again.status).toBe(409)
  })
})
