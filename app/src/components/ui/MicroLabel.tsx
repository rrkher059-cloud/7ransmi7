import type { HTMLAttributes } from 'react'

type MicroLabelProps = HTMLAttributes<HTMLSpanElement> & {
  children: string
}

/** UPPERCASE micro-label caption placed above the element it annotates. */
export function MicroLabel({ children, className = '', ...props }: MicroLabelProps) {
  return (
    <span
      className={`block text-[11px] uppercase tracking-[0.15em] ${className.includes('text-') ? className : `text-text-muted ${className}`}`}
      {...props}
    >
      {children}
    </span>
  )
}
