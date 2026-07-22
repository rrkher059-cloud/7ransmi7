import { TWEET_MAX_CHARS } from '../../shared/constants'

/**
 * Design tokens mirrored from departure-mono-design-system.json (dark mode).
 * Single accent rule: amber only. Corner radius is always 0.
 */
export const tokens = {
  color: {
    base: '#1b1b1a',
    panel: '#262421',
    elevated: '#2e2b27',
    accent: '#ff9142',
    textPrimary: '#eae7e1',
    textMuted: '#8a8783',
    border: '#4a4744',
    blockFill: '#6f6c68',
  },
  typography: {
    family: ['Departure Mono', 'IBM Plex Mono', 'Fragment Mono', 'monospace'] as const,
    scale: {
      display: '64px',
      headline: '32px',
      subheading: '20px',
      body: '15px',
      data: '13px',
      microLabel: '11px',
    },
    microLabelTracking: '0.15em',
    bodyLeading: 1.4,
  },
  layout: {
    baseUnit: 8,
    borderWeight: '1px',
    cornerRadius: 0,
  },
  limits: {
    tweetMaxChars: TWEET_MAX_CHARS,
  },
} as const

export type DesignTokens = typeof tokens
