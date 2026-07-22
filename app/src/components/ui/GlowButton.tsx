import type { ButtonHTMLAttributes } from 'react'
import BorderGlow from '@/components/effects/BorderGlow'

type GlowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  fullWidth?: boolean
}

/** Amber primary action — cool steel BorderGlow for contrast on orange fill. */
export function GlowButton({
  className = '',
  type = 'button',
  children,
  disabled,
  fullWidth = false,
  ...props
}: GlowButtonProps) {
  return (
    <BorderGlow
      className={`border-glow-button ${fullWidth ? 'w-full' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      borderRadius={0}
      backgroundColor="#ff9142"
      glowColor="205 28 78"
      glowRadius={28}
      glowIntensity={1.4}
      edgeSensitivity={20}
      coneSpread={30}
      fillOpacity={0.45}
      colors={['#d7e4ef', '#eae7e1', '#8fadc4']}
      animated={false}
    >
      <button
        type={type}
        disabled={disabled}
        className={`inline-flex w-full items-center justify-center px-4 py-3 text-[12px] uppercase tracking-[0.15em] text-[#1b1b1a] transition-colors duration-150 ease-in-out disabled:cursor-not-allowed`}
        {...props}
      >
        {children}
      </button>
    </BorderGlow>
  )
}
