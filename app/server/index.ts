import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { registerApiFallback } from './apiFallback.ts'
import {
  cleanupStaleTempFiles,
  DEFAULT_DATA_DIR,
} from './jsonStore.ts'
import { pruneRateLimitBuckets } from './rateLimit.ts'
import { assertSessionSecretConfigured } from './session.ts'
import { purgeExpired } from './store.ts'

assertSessionSecretConfigured()

if (
  process.env.AUTH_TEST_OTP &&
  (process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER))
) {
  throw new Error('AUTH_TEST_OTP must not be set in production.')
}

void cleanupStaleTempFiles(DEFAULT_DATA_DIR).catch((error) => {
  console.error('cleanupStaleTempFiles failed', error)
})

/**
 * Frontend API audit (`src/lib/api.ts`) — all implemented in createApp():
 *
 * | Method | Path                              |
 * |--------|-----------------------------------|
 * | GET    | /api/health                       |
 * | GET    | /api/stats                        |
 * | GET    | /api/auth/me                      |
 * | POST   | /api/auth/forgot-password         |
 * | POST   | /api/auth/reset-password          |
 * | POST   | /api/auth/signup                  |
 * | POST   | /api/auth/login                   |
 * | POST   | /api/auth/logout                  |
 * | GET    | /api/tweets                       |
 * | POST   | /api/tweets                       |
 * | POST   | /api/tweets/:id/comment           |
 * | POST   | /api/tweets/:id/repost            |
 * | POST   | /api/tweets/:id/like              |
 * | POST   | /api/tweets/:id/react             |
 * | DELETE | /api/tweets/:id                   |
 * | GET    | /api/explore/search               |
 * | GET    | /api/explore/trending             |
 * | GET    | /api/explore/suggestions          |
 * | POST   | /api/ai/assist                    |
 * | POST   | /api/ai/search                    |
 * | POST   | /api/ai/companion                 |
 * | GET    | /api/users/search                 |
 * | GET    | /api/users/:id/follow-stats       |
 * | GET    | /api/users/:id/followers          |
 * | GET    | /api/users/:id/following          |
 * | POST   | /api/users/:id/follow             |
 * | POST   | /api/users/:id/block              |
 * | GET    | /api/users/:id/tweets             |
 * | GET    | /api/messages                     |
 * | GET    | /api/messages/:peerId             |
 * | POST   | /api/messages                     |
 * | GET    | /api/notifications                |
 * | POST   | /api/notifications/read           |
 *
 * No `/api/tasks`, `/api/posts`, `/api/user`, or `/api/settings` calls exist
 * in the current SPA — posts map to `/api/tweets`.
 */
const app = createApp()

app.get('/', (c) =>
  c.json({
    ok: true,
    service: '7ransmi7-api',
    health: '/api/health',
  }),
)

// Catch-all last: unmatched /api/* → clean JSON (never raw Hono text 404).
registerApiFallback(app)

const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})

setInterval(() => {
  void purgeExpired().catch((error) => {
    console.error('purgeExpired failed', error)
  })
  pruneRateLimitBuckets()
}, 30_000)
