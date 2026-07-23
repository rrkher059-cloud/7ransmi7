import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { Panel } from '@/components/ui/Panel'
import {
  ApiClientError,
  login,
  signup,
  type PrivateUser,
} from '@/lib/api'
import { PASSWORD_MIN_LENGTH } from '../../shared/constants'

export type AuthMode = 'login' | 'signup'

type AuthPanelProps = {
  onAuthenticated: (user: PrivateUser) => void
  initialMode?: AuthMode
  prompt?: string | null
}

const fieldClass =
  'w-full border border-border bg-base px-3 py-2 text-[14px] text-text-primary outline-none transition-colors duration-150 ease-in-out placeholder:text-text-muted focus:border-accent'

export function AuthPanel({
  onAuthenticated,
  initialMode = 'signup',
  prompt = null,
}: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMode(initialMode)
    setError(null)
    setPassword('')
  }, [initialMode])

  function switchMode(next: AuthMode) {
    setMode(next)
    setError(null)
    setPassword('')
  }

  async function handleSignup(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = await signup({ email, password, handle })
      onAuthenticated(user)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Signup failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = await login({ email, password })
      onAuthenticated(user)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  const panelLabel = mode === 'signup' ? 'ACCESS // SIGN UP' : 'ACCESS // LOG IN'

  return (
    <Panel label={panelLabel}>
      {prompt ? (
        <p className="mb-4 border border-[#4a4744] bg-[#1b1b1a] px-3 py-2 text-[12px] uppercase tracking-[0.12em] text-[#ff9142]">
          {prompt}
        </p>
      ) : null}

      <div className="mb-4 flex gap-2 border-b border-border pb-3">
        <Button
          type="button"
          variant={mode === 'signup' ? 'accent' : 'primary'}
          onClick={() => switchMode('signup')}
        >
          Sign up
        </Button>
        <Button
          type="button"
          variant={mode === 'login' ? 'accent' : 'primary'}
          onClick={() => switchMode('login')}
        >
          Log in
        </Button>
      </div>

      {mode === 'signup' ? (
        <form className="flex flex-col gap-4" onSubmit={handleSignup}>
          <div className="flex flex-col gap-2">
            <MicroLabel>Email</MicroLabel>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
              placeholder="ops@kuiper.alpha"
              disabled={busy}
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <MicroLabel>Handle</MicroLabel>
            <input
              required
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className={fieldClass}
              placeholder="@ops"
              disabled={busy}
              spellCheck={false}
              autoComplete="username"
            />
          </div>
          <div className="flex flex-col gap-2">
            <MicroLabel>Password</MicroLabel>
            <input
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              pattern=".*\d.*"
              title={`At least ${PASSWORD_MIN_LENGTH} characters and include a number`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
              placeholder={`Min ${PASSWORD_MIN_LENGTH} characters, include a number`}
              disabled={busy}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" variant="accent" disabled={busy}>
            {busy ? 'Creating' : 'Create account'}
          </Button>
        </form>
      ) : null}

      {mode === 'login' ? (
        <form className="flex flex-col gap-4" onSubmit={handleLogin}>
          <div className="flex flex-col gap-2">
            <MicroLabel>Email</MicroLabel>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
              placeholder="ops@kuiper.alpha"
              disabled={busy}
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <MicroLabel>Password</MicroLabel>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
              disabled={busy}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" variant="accent" disabled={busy}>
            {busy ? 'Signing in' : 'Log in'}
          </Button>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 border border-accent bg-base px-3 py-2 text-[12px] uppercase tracking-[0.12em] text-accent"
        >
          {error}
        </p>
      ) : null}
    </Panel>
  )
}
