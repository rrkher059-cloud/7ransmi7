import type { HTMLAttributes, ReactNode } from 'react'
import { MicroLabel } from './MicroLabel'

type PanelProps = HTMLAttributes<HTMLElement> & {
  label?: string
  children: ReactNode
  elevated?: boolean
}

/** Instrument-panel block with optional micro-label and 1px hairline border. */
export function Panel({
  label,
  children,
  elevated = false,
  className = '',
  ...props
}: PanelProps) {
  return (
    <section className={`flex flex-col gap-2 ${className}`} {...props}>
      {label ? <MicroLabel>{label}</MicroLabel> : null}
      <div
        className={`border border-border p-4 ${elevated ? 'bg-elevated' : 'bg-panel'}`}
      >
        {children}
      </div>
    </section>
  )
}
