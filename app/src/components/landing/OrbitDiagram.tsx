import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './OrbitDiagram.css'

const CX = 200
const CY = 200
const VIEW = 400

type Operator = {
  id: string
  handle: string
  tag: string
  r: number
  speed: number
  phase: number
  accent: boolean
}

const OPERATORS: Operator[] = [
  {
    id: 'nova',
    handle: '@nova',
    tag: 'ONLINE',
    r: 78,
    speed: 0.42,
    phase: 0.4,
    accent: true,
  },
  {
    id: 'helio',
    handle: '@helio',
    tag: 'POSTING',
    r: 118,
    speed: -0.28,
    phase: 2.1,
    accent: false,
  },
  {
    id: 'vanta',
    handle: '@vanta',
    tag: 'IDLE',
    r: 152,
    speed: 0.18,
    phase: 4.2,
    accent: false,
  },
]

type NodePose = {
  id: string
  x: number
  y: number
  angle: number
  handle: string
  tag: string
  accent: boolean
  r: number
}

type Ripple = { id: number; x: number; y: number; born: number }

type Frame = {
  poses: NodePose[]
  dashPhase: number
  sweepAngle: number
  now: number
  ripples: Ripple[]
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by)
}

function plateWidth(handle: string) {
  return handle.length * 7.6 + 18
}

function initialPoses(): NodePose[] {
  return OPERATORS.map((op) => ({
    id: op.id,
    x: CX + Math.cos(op.phase) * op.r,
    y: CY + Math.sin(op.phase) * op.r,
    angle: op.phase,
    handle: op.handle,
    tag: op.tag,
    accent: op.accent,
    r: op.r,
  }))
}

function TickMarks({ radius, count }: { radius: number; count: number }) {
  return (
    <g className="orbit-ticks">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2
        const major = i % 6 === 0
        const len = major ? 9 : 5
        return (
          <line
            key={i}
            x1={CX + Math.cos(angle) * (radius - len)}
            y1={CY + Math.sin(angle) * (radius - len)}
            x2={CX + Math.cos(angle) * radius}
            y2={CY + Math.sin(angle) * radius}
            className={major ? 'orbit-tick orbit-tick-major' : 'orbit-tick'}
          />
        )
      })}
    </g>
  )
}

/** Interactive circular orbit HUD — operators drift around the feed core. */
export function OrbitDiagram() {
  const uid = useId().replace(/:/g, '')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const rafRef = useRef(0)
  const t0Ref = useRef(performance.now())
  const spinRef = useRef(0)
  const spinVelRef = useRef(0)
  const dragRef = useRef<{
    active: boolean
    lastAngle: number
    moved: boolean
  } | null>(null)
  const pointerRef = useRef({ x: CX, y: CY, inside: false })
  const hoverRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const posesRef = useRef<NodePose[]>(initialPoses())
  const ripplesRef = useRef<Ripple[]>([])
  const reducedMotionRef = useRef(false)

  const [frame, setFrame] = useState<Frame>(() => ({
    poses: initialPoses(),
    dashPhase: 0,
    sweepAngle: -Math.PI / 2,
    now: performance.now(),
    ripples: [],
  }))
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pointer, setPointer] = useState({ x: CX, y: CY, inside: false })

  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: CX, y: CY }
    const rect = svg.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW,
      y: ((clientY - rect.top) / rect.height) * VIEW,
    }
  }, [])

  const spawnRipple = useCallback((x: number, y: number) => {
    const id = performance.now()
    ripplesRef.current = [...ripplesRef.current.slice(-4), { id, x, y, born: id }]
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = mq.matches
    const onChange = () => {
      reducedMotionRef.current = mq.matches
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    hoverRef.current = hoverId
  }, [hoverId])

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    const tick = (now: number) => {
      const elapsed = (now - t0Ref.current) / 1000
      const reduced = reducedMotionRef.current
      const ptr = pointerRef.current
      const hover = hoverRef.current
      const selected = selectedRef.current

      if (!reduced && !dragRef.current?.active) {
        spinVelRef.current *= 0.965
        if (Math.abs(spinVelRef.current) < 0.00004) spinVelRef.current = 0
        spinRef.current += spinVelRef.current
      }

      const globalSpin = spinRef.current
      const nextPoses: NodePose[] = OPERATORS.map((op) => {
        let angle =
          op.phase +
          (reduced ? 0 : elapsed * op.speed) +
          globalSpin * (op.speed >= 0 ? 1 : -1)

        if (ptr.inside && !reduced) {
          const pointerAngle = Math.atan2(ptr.y - CY, ptr.x - CX)
          const pointerR = dist(ptr.x, ptr.y, CX, CY)
          const orbitProximity = 1 - clamp(Math.abs(pointerR - op.r) / 40, 0, 1)
          if (orbitProximity > 0) {
            let delta = pointerAngle - angle
            while (delta > Math.PI) delta -= Math.PI * 2
            while (delta < -Math.PI) delta += Math.PI * 2
            const boost = hover === op.id || selected === op.id ? 2.2 : 1
            angle += delta * orbitProximity * 0.05 * boost
          }
        }

        if (selected === op.id && ptr.inside && !reduced) {
          const pointerAngle = Math.atan2(ptr.y - CY, ptr.x - CX)
          let delta = pointerAngle - angle
          while (delta > Math.PI) delta -= Math.PI * 2
          while (delta < -Math.PI) delta += Math.PI * 2
          angle += delta * 0.1
        }

        const focusBoost = hover === op.id || selected === op.id ? 4 : 1.6
        const breathe = reduced
          ? 0
          : Math.sin(elapsed * 1.7 + op.phase) * focusBoost
        const radius = op.r + breathe

        return {
          id: op.id,
          x: CX + Math.cos(angle) * radius,
          y: CY + Math.sin(angle) * radius,
          angle,
          handle: op.handle,
          tag: op.tag,
          accent: op.accent,
          r: radius,
        }
      })

      posesRef.current = nextPoses
      ripplesRef.current = ripplesRef.current.filter((r) => now - r.born < 900)

      setFrame({
        poses: nextPoses,
        dashPhase: reduced ? 0 : elapsed * 28,
        sweepAngle: reduced
          ? -Math.PI / 2
          : -Math.PI / 2 + elapsed * 0.85 + globalSpin,
        now,
        ripples: ripplesRef.current,
      })

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const hitTest = useCallback((x: number, y: number) => {
    let best: { id: string; d: number } | null = null
    for (const pose of posesRef.current) {
      const d = dist(x, y, pose.x, pose.y)
      if (d < 38 && (!best || d < best.d)) best = { id: pose.id, d }
    }
    return best?.id ?? null
  }, [])

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const { x, y } = clientToSvg(event.clientX, event.clientY)
    pointerRef.current = { x, y, inside: true }
    setPointer({ x, y, inside: true })

    const drag = dragRef.current
    if (drag?.active) {
      const angle = Math.atan2(y - CY, x - CX)
      let delta = angle - drag.lastAngle
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      if (Math.abs(delta) > 0.002) drag.moved = true
      spinRef.current += delta
      spinVelRef.current = delta * 0.9
      drag.lastAngle = angle
      return
    }

    const next = hitTest(x, y)
    setHoverId((prev) => (prev === next ? prev : next))
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const { x, y } = clientToSvg(event.clientX, event.clientY)
    pointerRef.current = { x, y, inside: true }
    rootRef.current?.setPointerCapture(event.pointerId)

    const hit = hitTest(x, y)
    if (hit) {
      setSelectedId((prev) => (prev === hit ? null : hit))
      spawnRipple(x, y)
      return
    }

    if (dist(x, y, CX, CY) < 34) {
      setSelectedId(null)
      spawnRipple(CX, CY)
      return
    }

    dragRef.current = {
      active: true,
      lastAngle: Math.atan2(y - CY, x - CX),
      moved: false,
    }
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (rootRef.current?.hasPointerCapture(event.pointerId)) {
      rootRef.current.releasePointerCapture(event.pointerId)
    }
    const drag = dragRef.current
    if (drag?.active && !drag.moved) {
      setSelectedId(null)
    }
    dragRef.current = null
  }

  const onPointerLeave = () => {
    pointerRef.current = { ...pointerRef.current, inside: false }
    setPointer((p) => ({ ...p, inside: false }))
    setHoverId(null)
    dragRef.current = null
  }

  const { poses, dashPhase, sweepAngle, now, ripples } = frame
  const activeId = hoverId ?? selectedId
  const activePose = poses.find((p) => p.id === activeId) ?? null
  const selectedPose = poses.find((p) => p.id === selectedId) ?? null

  const sweepX = CX + Math.cos(sweepAngle) * 168
  const sweepY = CY + Math.sin(sweepAngle) * 168
  const sweepArmX = CX + Math.cos(sweepAngle + Math.PI / 2) * 168
  const sweepArmY = CY + Math.sin(sweepAngle + Math.PI / 2) * 168

  return (
    <div
      ref={rootRef}
      className={`orbit-diagram${pointer.inside ? ' is-hot' : ''}${activeId ? ' has-focus' : ''}`}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={onPointerLeave}
      role="img"
      aria-label="Interactive operator orbit. Drag to spin. Click operators to focus."
    >
      <svg
        ref={svgRef}
        className="orbit-svg"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="presentation"
      >
        <defs>
          <radialGradient id={`${uid}-panel`} cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="rgba(255, 145, 66, 0.18)" />
            <stop offset="45%" stopColor="rgba(255, 145, 66, 0.05)" />
            <stop offset="100%" stopColor="rgba(27, 27, 26, 0)" />
          </radialGradient>

          <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 145, 66, 0.6)" />
            <stop offset="55%" stopColor="rgba(255, 145, 66, 0.14)" />
            <stop offset="100%" stopColor="rgba(255, 145, 66, 0)" />
          </radialGradient>

          <radialGradient id={`${uid}-cursor`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255, 145, 66, 0.38)" />
            <stop offset="100%" stopColor="rgba(255, 145, 66, 0)" />
          </radialGradient>

          <filter
            id={`${uid}-glow`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="2.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <mask id={`${uid}-sweep`}>
            <rect width={VIEW} height={VIEW} fill="black" />
            <path
              d={`M ${CX} ${CY} L ${sweepX} ${sweepY} A 168 168 0 0 1 ${sweepArmX} ${sweepArmY} Z`}
              fill="white"
            />
          </mask>
        </defs>

        <rect className="orbit-frame" x="0.5" y="0.5" width="399" height="399" />
        <rect
          x="1"
          y="1"
          width="398"
          height="398"
          fill={`url(#${uid}-panel)`}
        />

        <g className="orbit-brackets">
          <path d="M12 36 V12 H36" />
          <path d="M364 12 H388 V36" />
          <path d="M388 364 V388 H364" />
          <path d="M36 388 H12 V364" />
        </g>

        <g className="orbit-crosshair">
          <line x1={CX} y1={28} x2={CX} y2={72} />
          <line x1={CX} y1={328} x2={CX} y2={372} />
          <line x1={28} y1={CY} x2={72} y2={CY} />
          <line x1={328} y1={CY} x2={372} y2={CY} />
        </g>

        <circle className="orbit-ring-outer" cx={CX} cy={CY} r={168} />
        <TickMarks radius={168} count={48} />
        <circle className="orbit-ring-guide" cx={CX} cy={CY} r={160} />

        {OPERATORS.map((op) => (
          <circle
            key={`track-${op.id}`}
            className={`orbit-track${activeId === op.id ? ' is-active' : ''}${op.accent ? ' orbit-track-accent' : ''}`}
            cx={CX}
            cy={CY}
            r={op.r}
          />
        ))}

        <circle
          className="orbit-dash"
          cx={CX}
          cy={CY}
          r={152}
          strokeDasharray="3 11"
          strokeDashoffset={-dashPhase}
        />
        <circle
          className="orbit-dash orbit-dash-accent"
          cx={CX}
          cy={CY}
          r={118}
          strokeDasharray="2 9"
          strokeDashoffset={dashPhase * 0.7}
        />
        <circle
          className="orbit-dash"
          cx={CX}
          cy={CY}
          r={78}
          strokeDasharray="1.5 7"
          strokeDashoffset={-dashPhase * 1.3}
        />

        <g mask={`url(#${uid}-sweep)`}>
          <circle cx={CX} cy={CY} r={168} fill="rgba(255, 145, 66, 0.12)" />
        </g>
        <line
          className="orbit-sweep-beam"
          x1={CX}
          y1={CY}
          x2={sweepX}
          y2={sweepY}
        />

        {activePose ? (
          <g className="orbit-link-group">
            <line
              className="orbit-link"
              x1={CX}
              y1={CY}
              x2={activePose.x}
              y2={activePose.y}
            />
            <circle
              className="orbit-link-bead"
              cx={(CX + activePose.x) / 2}
              cy={(CY + activePose.y) / 2}
              r={2.5}
            />
          </g>
        ) : null}

        {pointer.inside ? (
          <g className="orbit-cursor" pointerEvents="none">
            <circle
              cx={pointer.x}
              cy={pointer.y}
              r={48}
              fill={`url(#${uid}-cursor)`}
            />
            <circle
              className="orbit-cursor-ring"
              cx={pointer.x}
              cy={pointer.y}
              r={15}
            />
            <line
              className="orbit-cursor-cross"
              x1={pointer.x - 24}
              y1={pointer.y}
              x2={pointer.x - 9}
              y2={pointer.y}
            />
            <line
              className="orbit-cursor-cross"
              x1={pointer.x + 9}
              y1={pointer.y}
              x2={pointer.x + 24}
              y2={pointer.y}
            />
            <line
              className="orbit-cursor-cross"
              x1={pointer.x}
              y1={pointer.y - 24}
              x2={pointer.x}
              y2={pointer.y - 9}
            />
            <line
              className="orbit-cursor-cross"
              x1={pointer.x}
              y1={pointer.y + 9}
              x2={pointer.x}
              y2={pointer.y + 24}
            />
          </g>
        ) : null}

        {ripples.map((ripple) => {
          const age = clamp((now - ripple.born) / 900, 0, 1)
          return (
            <circle
              key={ripple.id}
              className="orbit-ripple"
              cx={ripple.x}
              cy={ripple.y}
              r={8 + age * 40}
              opacity={1 - age}
            />
          )
        })}

        <circle className="orbit-pulse" cx={CX} cy={CY} r={46} />
        <circle className="orbit-pulse orbit-pulse-delay" cx={CX} cy={CY} r={46} />

        {poses.map((pose) => {
          const focused = activeId === pose.id
          const selected = selectedId === pose.id
          const w = plateWidth(pose.handle)
          return (
            <g
              key={pose.id}
              className={`orbit-node${focused ? ' is-focused' : ''}${selected ? ' is-selected' : ''}${pose.accent ? ' is-accent' : ''}`}
              transform={`translate(${pose.x} ${pose.y})`}
            >
              <circle className="orbit-node-hit" r={30} />
              <circle className="orbit-node-halo" r={focused ? 15 : 9} />
              <circle className="orbit-node-dot" r={focused ? 6.5 : 4} />
              <g transform={`translate(${-w / 2} ${focused ? -36 : -28})`}>
                <rect
                  className="orbit-node-plate"
                  x={0}
                  y={0}
                  width={w}
                  height={focused ? 34 : 18}
                />
                <text
                  className="orbit-node-label"
                  x={w / 2}
                  y={13}
                  textAnchor="middle"
                >
                  {pose.handle}
                </text>
                {focused ? (
                  <text
                    className="orbit-node-tag"
                    x={w / 2}
                    y={27}
                    textAnchor="middle"
                  >
                    {pose.tag}
                  </text>
                ) : null}
              </g>
            </g>
          )
        })}

        <g className="orbit-core" filter={`url(#${uid}-glow)`}>
          <circle
            cx={CX}
            cy={CY}
            r={36}
            fill={`url(#${uid}-core)`}
            opacity={0.9}
          />
          <circle className="orbit-core-ring" cx={CX} cy={CY} r={28} />
          <rect
            className="orbit-core-plate"
            x={CX - 28}
            y={CY - 12}
            width={56}
            height={24}
          />
          <text className="orbit-core-label" x={CX} y={CY + 4}>
            FEED
          </text>
        </g>

        <text className="orbit-meta" x={16} y={24}>
          OPS // 03
        </text>
        <text className="orbit-meta orbit-meta-right" x={384} y={24}>
          {pointer.inside ? 'TRACK' : 'SYNC'}
        </text>
        <text className="orbit-meta" x={16} y={388}>
          {selectedPose ? selectedPose.handle.toUpperCase() : 'DRAG SPIN'}
        </text>
        <text className="orbit-meta orbit-meta-right" x={384} y={388}>
          {activePose ? activePose.tag : 'LIVE'}
        </text>
      </svg>

      <div className="orbit-hint" aria-hidden>
        {selectedPose
          ? `Focused ${selectedPose.handle} — move pointer to guide`
          : 'Drag to spin · Click @nova @helio @vanta'}
      </div>
    </div>
  )
}
