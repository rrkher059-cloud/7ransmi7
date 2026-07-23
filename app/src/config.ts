/**
 * Central API origin for GitHub Pages → Render and local Vite → Hono.
 * Override with VITE_API_BASE_URL (absolute URL, no trailing slash).
 * In DEV without env, use '' so `/api/...` hits the Vite proxy.
 * Production / github.io never use relative `/api` (that hits Pages and 404s).
 */
export const RENDER_API_ORIGIN = 'https://sevenransmi7.onrender.com'

const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()

export function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function resolveApiBaseUrl(options?: {
  envBase?: string | undefined
  isProd?: boolean
  hostname?: string | undefined
}): string {
  const envBase =
    options && 'envBase' in options ? options.envBase : fromEnv
  const isProd = options?.isProd ?? Boolean(import.meta.env.PROD)
  const hostname =
    options && 'hostname' in options
      ? options.hostname
      : typeof window !== 'undefined'
        ? window.location.hostname
        : undefined

  if (envBase && isAbsoluteHttpUrl(envBase)) {
    return envBase.replace(/\/$/, '')
  }

  // Relative or empty env must never win on Pages / production builds.
  if (isProd || (hostname != null && hostname.endsWith('github.io'))) {
    return RENDER_API_ORIGIN
  }

  return ''
}

export const API_BASE_URL = resolveApiBaseUrl()

/** Join API_BASE_URL with a path that may start with `/api/...`. */
export function apiUrl(path: string): string {
  if (isAbsoluteHttpUrl(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${resolveApiBaseUrl()}${normalized}`
}
