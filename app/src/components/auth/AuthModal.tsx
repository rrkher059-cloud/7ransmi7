import { useEffect, useRef } from 'react'
import { AuthPanel, type AuthMode } from '@/components/auth/AuthPanel'
import type { PrivateUser } from '@/lib/api'

type AuthModalProps = {
  mode: AuthMode
  prompt?: string | null
  onClose: () => void
  onAuthenticated: (user: PrivateUser) => void
}

/** Overlay auth dialog — keeps the home feed visible behind it. */
export function AuthModal({
  mode,
  prompt = null,
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const root = panelRef.current
    const focusable = root?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    focusable?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'login' ? 'Log in' : 'Sign up'}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 text-[11px] uppercase tracking-[0.15em] text-[#ff9142] hover:underline"
          style={{ borderRadius: 0 }}
        >
          Close
        </button>
        <AuthPanel
          initialMode={mode}
          prompt={prompt}
          onAuthenticated={onAuthenticated}
        />
      </div>
    </div>
  )
}
