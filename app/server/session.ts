import { createHmac, timingSafeEqual } from 'node:crypto'
import { SESSION_COOKIE, SESSION_TTL_MS } from '../shared/constants.ts'

export type SessionPayload = {
  userId: string
  exp: number
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 16) {
    // Dev/test fallback — set SESSION_SECRET in production.
    return 'dev-only-transmit-session-secret'
  }
  return secret
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

export const sessionCookieOptions = {
  httpOnly: true,
  path: '/',
  sameSite: 'Lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
}

export { SESSION_COOKIE }
