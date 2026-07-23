import { describe, expect, it } from 'vitest'
import {
  createTweetSchema,
  publicUserSchema,
  privateUserSchema,
  signupSchema,
  TWEET_MAX_CHARS,
} from './schemas.ts'

describe('createTweetSchema — empty posts', () => {
  it('rejects an empty body without an image', () => {
    const result = createTweetSchema.safeParse({ body: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.body?.[0]).toMatch(
        /text or an image/i,
      )
    }
  })

  it('rejects whitespace-only body without an image', () => {
    const result = createTweetSchema.safeParse({ body: '   ' })
    expect(result.success).toBe(false)
  })

  it('accepts an image-only post', () => {
    const result = createTweetSchema.safeParse({
      body: '',
      imageUrl: 'data:image/png;base64,abc',
    })
    expect(result.success).toBe(true)
  })

  it('rejects svg data URLs', () => {
    const result = createTweetSchema.safeParse({
      body: '',
      imageUrl: 'data:image/svg+xml;base64,abc',
    })
    expect(result.success).toBe(false)
  })
})

describe('createTweetSchema — character limit overflows', () => {
  it(`accepts a body of exactly ${TWEET_MAX_CHARS} characters`, () => {
    const result = createTweetSchema.safeParse({
      body: 'x'.repeat(TWEET_MAX_CHARS),
    })
    expect(result.success).toBe(true)
  })

  it(`rejects a body over ${TWEET_MAX_CHARS} characters`, () => {
    const result = createTweetSchema.safeParse({
      body: 'x'.repeat(TWEET_MAX_CHARS + 1),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.body?.[0]).toMatch(
        new RegExp(String(TWEET_MAX_CHARS)),
      )
    }
  })
})

describe('user schemas', () => {
  it('public user omits email', () => {
    const result = publicUserSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      handle: '@ops',
      createdAt: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('email' in result.data).toBe(false)
    }
  })

  it('private user includes email', () => {
    const result = privateUserSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'ops@kuiper.test',
      handle: '@ops',
      createdAt: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
  })

  it('rejects common passwords on signup', () => {
    const result = signupSchema.safeParse({
      email: 'a@b.co',
      password: 'password',
      handle: 'ops',
    })
    expect(result.success).toBe(false)
  })
})
