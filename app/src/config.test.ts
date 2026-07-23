import { describe, expect, it } from 'vitest'
import {
  RENDER_API_ORIGIN,
  apiUrl,
  resolveApiBaseUrl,
} from './config.ts'

describe('resolveApiBaseUrl', () => {
  it('uses Render origin for production builds', () => {
    expect(
      resolveApiBaseUrl({ envBase: undefined, isProd: true, hostname: 'localhost' }),
    ).toBe(RENDER_API_ORIGIN)
  })

  it('uses Render origin on github.io even when not marked PROD', () => {
    expect(
      resolveApiBaseUrl({
        envBase: '',
        isProd: false,
        hostname: 'rrkher059-cloud.github.io',
      }),
    ).toBe(RENDER_API_ORIGIN)
  })

  it('uses empty base in local dev so the Vite /api proxy is hit', () => {
    expect(
      resolveApiBaseUrl({ envBase: undefined, isProd: false, hostname: 'localhost' }),
    ).toBe('')
  })

  it('honors an absolute VITE_API_BASE_URL override', () => {
    expect(
      resolveApiBaseUrl({
        envBase: 'https://custom.example.com/',
        isProd: true,
        hostname: 'localhost',
      }),
    ).toBe('https://custom.example.com')
  })

  it('ignores relative env overrides that would break Pages', () => {
    expect(
      resolveApiBaseUrl({
        envBase: '/api',
        isProd: true,
        hostname: 'rrkher059-cloud.github.io',
      }),
    ).toBe(RENDER_API_ORIGIN)
  })
})

describe('apiUrl', () => {
  it('returns absolute URLs unchanged', () => {
    expect(apiUrl('https://example.com/api/health')).toBe(
      'https://example.com/api/health',
    )
  })

  it('prefixes /api paths with the resolved base in production', () => {
    expect(RENDER_API_ORIGIN).toBe('https://sevenransmi7.onrender.com')
    expect(apiUrl('/api/health').endsWith('/api/health')).toBe(true)
  })
})
