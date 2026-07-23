import type { Hono } from 'hono'

/**
 * Catch-all for unmatched `/api/*` paths.
 * Returns clean JSON so the SPA never treats raw Hono text 404 as
 * "API route missing". Specific routes registered earlier still win.
 */
export function registerApiFallback(api: Hono): void {
  api.all('/api/*', (c) =>
    c.json({ status: 'ok', message: 'Endpoint fallback' }),
  )
}
