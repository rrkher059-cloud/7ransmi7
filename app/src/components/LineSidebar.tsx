import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './LineSidebar.css'

const FALLOFF_CURVES = {
  linear: (p: number) => p,
  smooth: (p: number) => p * p * (3 - 2 * p),
  sharp: (p: number) => p * p * p,
}

export type LineSidebarProps = {
  items?: string[]
  unreadCount?: number
  accentColor?: string
  textColor?: string
  markerColor?: string
  showIndex?: boolean
  showMarker?: boolean
  proximityRadius?: number
  maxShift?: number
  falloff?: 'linear' | 'smooth' | 'sharp'
  markerLength?: number
  markerGap?: number
  tickScale?: number
  scaleTick?: boolean
  itemGap?: number
  fontSize?: number
  smoothing?: number
  defaultActive?: number | null
  activeIndex?: number | null
  onItemClick?: (index: number, label: string) => void
  className?: string
}

const DEFAULT_ITEMS = [
  'Home',
  'Explore',
  'Notifications',
  'Messages',
  'Profile',
]

/**
 * React Bits LineSidebar.
 * Important: rAF id must be cleared on unmount — React StrictMode remounts
 * on every cold load, and a stale non-null rafRef would permanently block
 * startLoop (looks like a dead, non-interactive sidebar after reload).
 */
export default function LineSidebar({
  items = DEFAULT_ITEMS,
  unreadCount = 0,
  accentColor = '#ff9142',
  textColor = '#c4c4c4',
  markerColor = '#4a4744',
  showIndex = false,
  showMarker = true,
  proximityRadius = 120,
  maxShift = 24,
  falloff = 'smooth',
  markerLength = 40,
  markerGap = 8,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 16,
  fontSize = 1.0,
  smoothing = 100,
  defaultActive = 0,
  activeIndex: activeIndexProp,
  onItemClick,
  className = '',
}: LineSidebarProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const targetsRef = useRef<number[]>(items.map(() => 0))
  const currentRef = useRef<number[]>(items.map(() => 0))
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef(0)
  const activeRef = useRef<number | null>(defaultActive)
  const smoothingRef = useRef(smoothing)
  const [activeIndex, setActiveIndex] = useState<number | null>(
    activeIndexProp ?? defaultActive,
  )

  useEffect(() => {
    if (activeIndexProp !== undefined) {
      setActiveIndex(activeIndexProp)
    }
  }, [activeIndexProp])

  useEffect(() => {
    targetsRef.current = items.map(() => 0)
    currentRef.current = items.map(
      (_, index) => currentRef.current[index] ?? 0,
    )
  }, [items])

  activeRef.current = activeIndex
  smoothingRef.current = smoothing

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05)
    lastRef.current = now
    const tau = Math.max(smoothingRef.current, 1) / 1000
    const k = 1 - Math.exp(-dt / tau)
    let moving = false
    const currentItems = itemRefs.current

    for (let i = 0; i < currentItems.length; i++) {
      const el = currentItems[i]
      if (!el) continue
      const target = Math.max(
        targetsRef.current[i] || 0,
        activeRef.current === i ? 1 : 0,
      )
      const cur = currentRef.current[i] || 0
      const next = cur + (target - cur) * k
      const settled = Math.abs(target - next) < 0.0015
      const value = settled ? target : next
      currentRef.current[i] = value
      el.style.setProperty('--effect', value.toFixed(4))
      if (!settled) moving = true
    }

    if (moving) {
      rafRef.current = requestAnimationFrame(runFrame)
    } else {
      rafRef.current = null
    }
  }, [])

  const startLoop = useCallback(() => {
    if (rafRef.current != null) return
    lastRef.current = performance.now()
    rafRef.current = requestAnimationFrame(runFrame)
  }, [runFrame])

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLUListElement>) => {
      const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear
      const currentItems = itemRefs.current
      for (let i = 0; i < currentItems.length; i++) {
        const el = currentItems[i]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const distance = Math.abs(e.clientY - center)
        targetsRef.current[i] = ease(
          Math.max(0, 1 - distance / proximityRadius),
        )
      }
      startLoop()
    },
    [falloff, proximityRadius, startLoop],
  )

  const handlePointerLeave = useCallback(() => {
    targetsRef.current = targetsRef.current.map(() => 0)
    startLoop()
  }, [startLoop])

  const handleClick = useCallback(
    (index: number, label: string) => {
      setActiveIndex(index)
      onItemClick?.(index, label)
      startLoop()
    },
    [onItemClick, startLoop],
  )

  // Kick the loop on mount / tab change — survives StrictMode remounts.
  useEffect(() => {
    startLoop()
    return () => {
      stopLoop()
    }
  }, [activeIndex, startLoop, stopLoop])

  const style = {
    '--accent-color': accentColor,
    '--text-color': textColor,
    '--marker-color': markerColor,
    '--marker-length': `${markerLength}px`,
    '--marker-gap': `${markerGap}px`,
    '--tick-scale': tickScale,
    '--max-shift': `${maxShift}px`,
    '--item-gap': `${itemGap}px`,
    '--font-size': `${fontSize}rem`,
    '--smoothing': `${smoothing}ms`,
  } as CSSProperties

  return (
    <nav
      className={`line-sidebar${showMarker ? ' line-sidebar--markers' : ''}${scaleTick ? ' line-sidebar--scale-tick' : ''}${className ? ` ${className}` : ''}`}
      style={style}
    >
      <ul
        className="line-sidebar__list"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {items.map((label, index) => (
          <li key={`${label}-${index}`} className="line-sidebar__item-wrap">
            <button
              type="button"
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              className="line-sidebar__item"
              aria-current={activeIndex === index ? 'true' : undefined}
              onClick={() => handleClick(index, label)}
            >
              {showMarker ? (
                <span className="line-sidebar__marker" aria-hidden="true" />
              ) : null}
              <span className="line-sidebar__label">
                {showIndex ? (
                  <span className="line-sidebar__index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                ) : null}
                <span className="line-sidebar__text">
                  {label}
                  {index === 2 && unreadCount > 0 ? (
                    <span
                      className="line-sidebar__unread"
                      style={{ color: accentColor }}
                    >
                      {' '}
                      · {unreadCount}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
