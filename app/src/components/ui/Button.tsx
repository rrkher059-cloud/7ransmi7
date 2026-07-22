import type { ButtonHTMLAttributes } from 'react'
import BorderGlow from '@/components/effects/BorderGlow'

type ButtonVariant = 'primary' | 'ghost' | 'accent'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
}

const textVariants: Record<ButtonVariant, string> = {
  primary: 'text-text-primary hover:text-accent',
  ghost: 'text-text-muted hover:text-text-primary',
  accent: 'text-[#1b1b1a] hover:text-[#1b1b1a]',
}

const backgroundByVariant: Record<ButtonVariant, string> = {
  primary: '#262421',
  ghost: '#1b1b1a',
  accent: '#ff9142',
}

/** Cool steel glow — contrasts against orange fill (not another amber wash). */
const accentGlow = {
  glowColor: '205 28 78',
  colors: ['#d7e4ef', '#eae7e1', '#8fadc4'] as string[],
}

const defaultGlow = {
  glowColor: '24 100 63',
  colors: ['#ff9142', '#ffb06b', '#eae7e1'] as string[],
}

/** Sharp HUD control with React Bits BorderGlow on every instance. */
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const glow = variant === 'accent' ? accentGlow : defaultGlow

  return (
    <BorderGlow
      className={`border-glow-button ${disabled ? 'is-disabled' : ''} ${className}`}
      borderRadius={0}
      backgroundColor={backgroundByVariant[variant]}
      glowColor={glow.glowColor}
      glowRadius={24}
      glowIntensity={variant === 'accent' ? 1.35 : 1.15}
      edgeSensitivity={22}
      coneSpread={28}
      fillOpacity={0.4}
      colors={glow.colors}
      animated={false}
    >
      <button
        type={type}
        disabled={disabled}
        className={`inline-flex items-center justify-center px-4 py-2 text-[12px] uppercase tracking-[0.15em] transition-colors duration-150 ease-in-out disabled:cursor-not-allowed ${textVariants[variant]}`}
        {...props}
      >
        {children}
      </button>
    </BorderGlow>
  )
}
