import type { ButtonHTMLAttributes, ReactNode } from 'react'
import BorderGlow from './BorderGlow'

type GlowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  fullWidth?: boolean
}

/** Amber primary action for root prototype — BorderGlow, 0px radius. */
export function GlowButton({
  children,
  className = '',
  type = 'button',
  disabled,
  fullWidth = false,
  ...props
}: GlowButtonProps) {
  return (
    <BorderGlow
      className={`${fullWidth ? 'w-full' : ''} ${className}`}
      borderRadius={0}
      backgroundColor="#ff9142"
      glowColor="24 100 63"
      glowRadius={28}
      glowIntensity={1.2}
      edgeSensitivity={20}
      coneSpread={30}
      fillOpacity={0.45}
      colors={['#ff9142', '#ffb06b', '#eae7e1']}
      animated={false}
    >
      <button
        type={type}
        disabled={disabled}
        className="inline-flex w-full items-center justify-center px-4 py-3 text-[12px] uppercase tracking-[0.15em] text-[#1b1b1a]"
        style={{ borderRadius: 0 }}
        {...props}
      >
        {children}
      </button>
    </BorderGlow>
  )
}

export default GlowButton
