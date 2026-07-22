import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { purgeExpired } from './store.ts'

const app = createApp()
const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})

// Permanently drop expired posts from disk every 30s.
setInterval(() => {
  void purgeExpired().catch((error) => {
    console.error('Failed to purge expired tweets:', error)
  })
}, 30_000)
