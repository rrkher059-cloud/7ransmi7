import './LandingPage.css'

import { useEffect, useRef, useState } from 'react'
import DotField from '@/components/effects/DotField'
import { OrbitDiagram } from '@/components/landing/OrbitDiagram'
import { Button } from '@/components/ui/Button'
import { MicroLabel } from '@/components/ui/MicroLabel'
import type { AuthMode } from '@/components/auth/AuthPanel'
import {
  ApiClientError,
  fetchPlatformStats,
  type PlatformStats,
} from '@/lib/api'

type LandingPageProps = {
  onExplore: () => void
  onOpenAuth: (mode?: AuthMode) => void
}

const EMPTY_STATS: PlatformStats = {
  users: 0,
  livePosts: 0,
  messageThreads: 0,
  follows: 0,
}

function useCountUp(target: number, active: boolean): string {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) {
      setValue(0)
      return
    }
    let frame = 0
    const duration = 900
    const start = performance.now()
    const from = 0

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setValue(from + (target - from) * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, target])

  return Math.round(value).toLocaleString('en-US')
}

function MetricCell({
  label,
  value,
  active,
}: {
  label: string
  value: number
  active: boolean
}) {
  const display = useCountUp(value, active)
  return (
    <div className="landing-metric">
      <MicroLabel>{label}</MicroLabel>
      <p className="landing-metric-value">{display}</p>
    </div>
  )
}

/** Feed-independent root landing — high-density HUD architecture. */
export function LandingPage({ onExplore, onOpenAuth }: LandingPageProps) {
  const metricsRef = useRef<HTMLElement | null>(null)
  const [metricsActive, setMetricsActive] = useState(false)
  const [stats, setStats] = useState<PlatformStats>(EMPTY_STATS)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const next = await fetchPlatformStats()
        if (cancelled) return
        setStats(next)
        setStatsError(null)
      } catch (error) {
        if (cancelled) return
        setStats(EMPTY_STATS)
        setStatsError(
          error instanceof ApiClientError
            ? error.message
            : 'Could not load network stats.',
        )
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const node = metricsRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setMetricsActive(true)
      },
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const metrics = [
    { label: 'Operators', value: stats.users },
    { label: 'Live posts', value: stats.livePosts },
    { label: 'Message threads', value: stats.messageThreads },
    { label: 'Follow links', value: stats.follows },
  ]

  return (
    <div className="landing-root">
      <div className="landing-field" aria-hidden>
        <DotField
          dotRadius={1.5}
          dotSpacing={16}
          bulgeStrength={55}
          glowRadius={0}
          sparkle={false}
          waveAmplitude={0}
          cursorRadius={420}
          cursorForce={0.08}
          bulgeOnly
          gradientFrom="rgba(255, 145, 66, 0.28)"
          gradientTo="rgba(74, 71, 68, 0.2)"
          glowColor="transparent"
        />
      </div>

      <header className="landing-nav">
        <div className="landing-nav-brand">
          <button
            type="button"
            className="landing-nav-brand-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="7RANSMI7 home"
          >
            <span className="landing-nav-mark">X</span>
            <span className="landing-nav-name">7RANSMI7</span>
          </button>
        </div>
        <div className="landing-nav-actions">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenAuth('login')}
          >
            Log in
          </Button>
          <Button
            type="button"
            variant="accent"
            onClick={() => onOpenAuth('signup')}
          >
            Sign up
          </Button>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-label="Hero">
          <div className="landing-hero-copy">
            <p className="landing-brand-lockup landing-reveal">
              <span className="landing-brand-block">X</span>
              <span className="landing-brand-word">7RANSMI7</span>
            </p>
            <h1 className="landing-headline landing-reveal landing-reveal-delay-1">
              Short posts
              <br />
              for quick people.
            </h1>
            <p className="landing-sub landing-reveal landing-reveal-delay-2">
              A timed feed for those who keep it moving.
            </p>
            <div className="landing-cta-row landing-reveal landing-reveal-delay-3">
              <Button type="button" variant="accent" onClick={onExplore}>
                Open Feed
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => onOpenAuth('signup')}
              >
                Sign up
              </Button>
            </div>
          </div>

          <div className="landing-hero-anchor landing-reveal landing-reveal-delay-2">
            <OrbitDiagram />
          </div>
        </section>

        <section
          ref={metricsRef}
          className="landing-section landing-metrics-section"
          aria-label="Platform Metrics"
        >
          <div className="landing-section-head landing-section-head-split">
            <div>
              <MicroLabel>Activity</MicroLabel>
              <h2 className="landing-section-title">Network stats</h2>
            </div>
            <p className="landing-callout">
              {statsLoading ? 'Loading…' : 'Live channel snapshot'}
            </p>
          </div>

          {statsError ? (
            <p
              role="alert"
              className="mb-4 border border-[#ff9142] bg-[#1b1b1a] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-[#ff9142]"
            >
              {statsError}
            </p>
          ) : null}

          <div className="landing-metrics-grid">
            {metrics.map((metric) => (
              <MetricCell
                key={metric.label}
                label={metric.label}
                value={metric.value}
                active={metricsActive && !statsLoading}
              />
            ))}
          </div>
        </section>

        <footer className="landing-footer">
          <p className="landing-footer-brand">7RANSMI7 // TIMED CHANNEL</p>
          <div className="landing-footer-actions">
            <button
              type="button"
              className="landing-footer-link"
              onClick={onExplore}
            >
              Open Feed
            </button>
            <button
              type="button"
              className="landing-footer-link"
              onClick={() => onOpenAuth('login')}
            >
              Log in
            </button>
          </div>
        </footer>
      </main>
    </div>
  )
}
