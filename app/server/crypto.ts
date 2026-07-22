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

export function generateOtpCode(length: number): string {
  const fixed = process.env.AUTH_TEST_OTP
  if (fixed && /^\d+$/.test(fixed)) {
    return fixed.padStart(length, '0').slice(-length)
  }
  const max = 10 ** length
  const num = randomBytes(4).readUInt32BE(0) % max
  return String(num).padStart(length, '0')
}
