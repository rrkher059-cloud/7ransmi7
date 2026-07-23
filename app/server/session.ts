import { createHmac, timingSafeEqual } from 'node:crypto'
import { SESSION_COOKIE, SESSION_TTL_MS } from '../shared/constants.ts'

export type SessionPayload = {
  userId: string
  exp: number
}

/** Documented local-only default — never used when NODE_ENV=production or RENDER is set. */
const DEV_SESSION_SECRET = 'dev-only-transmit-session-secret'

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER)
}

function isDevOrTestRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.AUTH_TEST_OTP && process.env.NODE_ENV === 'test')
  )
}

/**
 * Call at process boot. Production/Render require SESSION_SECRET (min 16).
 * Development/test may fall back to a documented local default.
 */
export function assertSessionSecretConfigured(): void {
  const secret = process.env.SESSION_SECRET
  if (isProductionRuntime()) {
    if (!secret || secret.length < 16) {
      throw new Error(
        'SESSION_SECRET must be set to a strong value (min 16 characters) in production.',
      )
    }
    return
  }
  if (secret && secret.length > 0 && secret.length < 16) {
    throw new Error('SESSION_SECRET must be at least 16 characters when set.')
  }
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length >= 16) return secret

  if (isProductionRuntime()) {
    throw new Error(
      'SESSION_SECRET must be set to a strong value (min 16 characters) in production.',
    )
  }

  if (isDevOrTestRuntime() || !process.env.NODE_ENV) {
    return DEV_SESSION_SECRET
  }

  throw new Error('SESSION_SECRET is required (min 16 characters).')
}

export function signSession(userId: string, ttlMs = SESSION_TTL_MS): string {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + ttlMs,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', sessionSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expected = createHmac('sha256', sessionSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as SessionPayload
    if (!payload.userId || typeof payload.exp !== 'number') return null
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

/** Cross-site cookies (GitHub Pages → Render) need SameSite=None; Secure. */
const crossSite =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RENDER) ||
  process.env.COOKIE_SECURE === 'true'

export const sessionCookieOptions = {
  httpOnly: true,
  path: '/',
  sameSite: (crossSite ? 'None' : 'Lax') as 'None' | 'Lax',
  secure: crossSite,
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
}

/** Options for deleteCookie — must match path/secure/sameSite used at set. */
export const sessionCookieClearOptions = {
  path: sessionCookieOptions.path,
  sameSite: sessionCookieOptions.sameSite,
  secure: sessionCookieOptions.secure,
}

export { SESSION_COOKIE }
