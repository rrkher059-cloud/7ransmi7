import { AuthPanel, type AuthMode } from '@/components/auth/AuthPanel'
import type { PublicUser } from '@/lib/api'

type AuthModalProps = {
  mode: AuthMode
  prompt?: string | null
  onClose: () => void
  onAuthenticated: (user: PublicUser) => void
}

/** Overlay auth dialog — keeps the home feed visible behind it. */
export function AuthModal({
  mode,
  prompt = null,
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'login' ? 'Log in' : 'Sign up'}
      onClick={onClose}
    >
      <div
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
