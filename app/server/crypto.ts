import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

const KEY_LEN = 64

export async function hashSecret(value: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scryptAsync(value, salt, KEY_LEN)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

export async function verifySecret(
  value: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = (await scryptAsync(value, salt, KEY_LEN)) as Buffer
  const expected = Buffer.from(hash, 'hex')
  if (expected.length !== derived.length) return false
  return timingSafeEqual(expected, derived)
}

/** Fixed-format dummy hash so missing-user auth still runs scrypt. */
export const DUMMY_PASSWORD_HASH =
  '0123456789abcdef0123456789abcdef:' + '00'.repeat(KEY_LEN)
