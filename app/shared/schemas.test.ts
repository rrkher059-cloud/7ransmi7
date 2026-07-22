import { describe, expect, it } from 'vitest'
import { createTweetSchema, TWEET_MAX_CHARS } from './schemas.ts'

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
