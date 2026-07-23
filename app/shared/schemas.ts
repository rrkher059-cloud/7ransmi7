import { z } from 'zod'
import {
  OTP_LENGTH,
  PASSWORD_MIN_LENGTH,
  TWEET_IMAGE_MAX_CHARS,
  TWEET_MAX_CHARS,
} from './constants.ts'

export { TWEET_MAX_CHARS, TWEET_IMAGE_MAX_CHARS }

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: 'Valid email is required.' })
  .max(254)

const handleSchema = z
  .string()
  .trim()
  .min(1, { message: 'Handle is required.' })
  .max(32, { message: 'Handle must be at most 32 characters.' })
  .regex(/^@?[a-zA-Z0-9_]+$/, {
    message: 'Handle may only contain letters, numbers, and underscores.',
  })
  .transform((value) => (value.startsWith('@') ? value : `@${value}`))

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyui',
  'letmein1',
  'welcome1',
  'admin123',
  'iloveyou',
  'monkey12',
  'abc12345',
  'passw0rd',
])

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(128, { message: 'Password must be at most 128 characters.' })
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: 'Choose a less common password.',
  })

const otpCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), {
    message: `Code must be ${OTP_LENGTH} digits.`,
  })

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
])

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  handle: handleSchema,
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Password is required.' }),
})

/** Used for password reset OTP. */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  password: passwordSchema,
})

/** Client sends body and optional image / reply target. */
export const createTweetSchema = z
  .object({
    body: z
      .string()
      .trim()
      .max(TWEET_MAX_CHARS, {
        message: `Tweet must be at most ${TWEET_MAX_CHARS} characters.`,
      })
      .default(''),
    imageUrl: z
      .string()
      .max(TWEET_IMAGE_MAX_CHARS, {
        message: 'Image is too large. Use a smaller file.',
      })
      .optional(),
    replyToId: z.string().uuid({ message: 'Invalid reply target.' }).optional(),
  })
  .superRefine((value, ctx) => {
    const hasBody = value.body.trim().length > 0
    const hasImage = Boolean(value.imageUrl && value.imageUrl.length > 0)
    if (!hasBody && !hasImage) {
      ctx.addIssue({
        code: 'custom',
        message: 'Add text or an image to post.',
        path: ['body'],
      })
    }
    if (value.imageUrl) {
      if (!value.imageUrl.startsWith('data:image/')) {
        ctx.addIssue({
          code: 'custom',
          message: 'Image must be a data URL.',
          path: ['imageUrl'],
        })
      } else {
        const mime = value.imageUrl
          .slice('data:'.length)
          .split(';')[0]
          ?.toLowerCase()
        if (!mime || !ALLOWED_IMAGE_MIMES.has(mime)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Image must be png, jpeg, gif, or webp.',
            path: ['imageUrl'],
          })
        }
      }
    }
  })

export const commentTweetSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { message: 'Comment is required.' })
    .max(TWEET_MAX_CHARS, {
      message: `Comment must be at most ${TWEET_MAX_CHARS} characters.`,
    }),
})

export const likeTweetSchema = z.object({
  tweetId: z.string().uuid({ message: 'Invalid tweet id.' }),
})

export const REACTION_EMOJIS = ['❤️', '🔥', '😂', '👍', '👀'] as const

export const reactTweetSchema = z.object({
  emoji: z
    .string()
    .trim()
    .refine(
      (value): value is (typeof REACTION_EMOJIS)[number] =>
        (REACTION_EMOJIS as readonly string[]).includes(value),
      { message: 'Pick a valid reaction emoji.' },
    ),
})

export const sendMessageSchema = z.object({
  toUserId: z.string().uuid({ message: 'Invalid recipient.' }),
  body: z
    .string()
    .trim()
    .min(1, { message: 'Message body is required.' })
    .max(TWEET_MAX_CHARS, {
      message: `Message must be at most ${TWEET_MAX_CHARS} characters.`,
    }),
})

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
  userId: z.string().uuid(),
})

export const commentSchema = z.object({
  id: z.string().uuid(),
  body: z.string().min(1).max(TWEET_MAX_CHARS),
  handle: z.string().min(2).max(33),
  userId: z.string().uuid(),
  createdAt: z.string().datetime(),
})

export const tweetSchema = z.object({
  id: z.string().uuid(),
  body: z.string().max(TWEET_MAX_CHARS),
  handle: z.string().min(2).max(33),
  userId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  likes: z.number().int().nonnegative(),
  /** Viewer-only flag — derived from likedBy; not source of truth on disk. */
  liked: z.boolean().default(false),
  /** Per-user like ledger (source of truth for likes count). */
  likedBy: z.array(z.string().uuid()).default([]),
  reactions: z.array(reactionSchema).default([]),
  imageUrl: z.string().nullish(),
  replyToId: z.string().uuid().nullish(),
  repostOfId: z.string().uuid().nullish(),
  repostOfHandle: z.string().nullish(),
  comments: z.array(commentSchema).default([]),
  repostCount: z.number().int().nonnegative().default(0),
  reposted: z.boolean().default(false),
  /** AI-generated high-level topic tags (no # prefix). */
  tags: z.array(z.string().min(1).max(32)).max(4).default([]),
})

export const ASSIST_MODES = [
  'polished',
  'concise',
  'hashtags',
  'summarize',
] as const

export const aiAssistSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { message: 'Draft text is required.' })
    .max(TWEET_MAX_CHARS, {
      message: `Draft must be at most ${TWEET_MAX_CHARS} characters.`,
    }),
  mode: z.enum(ASSIST_MODES),
})

export const aiCompanionSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, { message: 'Message is required.' })
    .max(1000, { message: 'Message must be at most 1000 characters.' }),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(12)
    .optional(),
})

export const aiSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, { message: 'Search query is required.' })
    .max(200, { message: 'Query must be at most 200 characters.' }),
})

export const tweetStoreSchema = z.object({
  tweets: z.array(tweetSchema),
})

/** Safe for explore / followers / search — never includes email. */
export const publicUserSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().min(2).max(33),
  createdAt: z.string().datetime(),
})

/** Self-only responses (me / login / signup). */
export const privateUserSchema = publicUserSchema.extend({
  email: emailSchema,
})

export const userRecordSchema = privateUserSchema.extend({
  passwordHash: z.string().min(1),
})

export const userStoreSchema = z.object({
  users: z.array(userRecordSchema),
})

export const otpRecordSchema = z.object({
  email: emailSchema,
  codeHash: z.string().min(1),
  expiresAt: z.string().datetime(),
  attempts: z.number().int().nonnegative(),
})

export const otpStoreSchema = z.object({
  otps: z.array(otpRecordSchema),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type CreateTweetInput = z.infer<typeof createTweetSchema>
export type CommentTweetInput = z.infer<typeof commentTweetSchema>
export type LikeTweetInput = z.infer<typeof likeTweetSchema>
export type ReactTweetInput = z.infer<typeof reactTweetSchema>
export type AiAssistInput = z.infer<typeof aiAssistSchema>
export type AiCompanionInput = z.infer<typeof aiCompanionSchema>
export type AiSearchInput = z.infer<typeof aiSearchSchema>
export type Reaction = z.infer<typeof reactionSchema>
export type Comment = z.infer<typeof commentSchema>
export type Tweet = z.infer<typeof tweetSchema>
export type TweetStore = z.infer<typeof tweetStoreSchema>
export type PublicUser = z.infer<typeof publicUserSchema>
export type PrivateUser = z.infer<typeof privateUserSchema>
export type UserRecord = z.infer<typeof userRecordSchema>
export type UserStore = z.infer<typeof userStoreSchema>
export type OtpRecord = z.infer<typeof otpRecordSchema>
export type OtpStore = z.infer<typeof otpStoreSchema>

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
