/** Shared product limits — single source of truth for client and API. */
export const TWEET_MAX_CHARS = 280
export const TWEET_TTL_MS = 24 * 60 * 60 * 1000
/** Max data-URL length for inline post images (~0.75MB). */
export const TWEET_IMAGE_MAX_CHARS = 750_000
export const OTP_LENGTH = 6
export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
export const PASSWORD_MIN_LENGTH = 8
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SESSION_COOKIE = 'transmit_session'
