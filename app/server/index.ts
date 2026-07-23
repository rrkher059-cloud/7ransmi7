import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
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

const app = createApp()

app.get('/', (c) =>
  c.json({
    ok: true,
    service: '7ransmi7-api',
    health: '/api/health',
  }),
)

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
