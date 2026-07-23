/**
 * Central API origin for GitHub Pages → Render and local Vite → Hono.
 * Override with VITE_API_BASE_URL (no trailing slash).
 * In DEV without env, use '' so `/api/...` hits the Vite proxy.
 */
const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()

export const API_BASE_URL = (
  fromEnv && fromEnv.length > 0
    ? fromEnv
    : import.meta.env.PROD
      ? 'https://sevenransmi7.onrender.com'
      : ''
).replace(/\/$/, '')

/** Join API_BASE_URL with a path that may start with `/api/...`. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalized}`
}
