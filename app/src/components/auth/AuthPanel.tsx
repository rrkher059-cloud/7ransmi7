import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { Panel } from '@/components/ui/Panel'
import {
  ApiClientError,
  forgotPassword,
  login,
  resetPassword,
  signup,
  type PrivateUser,
} from '@/lib/api'

export type AuthMode = 'login' | 'signup' | 'reset'
type ResetStep = 'email' | 'verify'

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
  const [mode, setMode] = useState<AuthMode>(
    initialMode === 'reset' ? 'reset' : initialMode,
  )
  const [resetStep, setResetStep] = useState<ResetStep>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    setMode(initialMode === 'reset' ? 'reset' : initialMode)
    setResetStep('email')
    setError(null)
    setInfo(null)
    setCode('')
    setPassword('')
  }, [initialMode])

  function switchMode(next: AuthMode) {
    setMode(next)
    setResetStep('email')
    setError(null)
    setInfo(null)
    setCode('')
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

  async function handleForgotPassword(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await forgotPassword(email)
      setResetStep('verify')
      setInfo('Code sent. Check your email (or API console in local mode).')
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to send code.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleResetPassword(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await resetPassword({ email, code, password })
      setInfo('Password updated. Sign in with your new credentials.')
      setMode('login')
      setResetStep('email')
      setCode('')
      setPassword('')
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Password reset failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  const panelLabel =
    mode === 'signup'
      ? 'ACCESS // SIGN UP'
      : mode === 'reset'
        ? 'ACCESS // RESET'
        : 'ACCESS // LOG IN'

  return (
    <Panel label={panelLabel}>
      {prompt ? (
        <p className="mb-4 border border-[#4a4744] bg-[#1b1b1a] px-3 py-2 text-[12px] uppercase tracking-[0.12em] text-[#ff9142]">
          {prompt}
        </p>
      ) : null}

      {mode !== 'reset' ? (
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
      ) : null}

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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
              placeholder="Min 8 characters"
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
          <button
            type="button"
            className="self-start text-[11px] uppercase tracking-[0.14em] text-text-muted underline-offset-2 hover:text-accent hover:underline"
            disabled={busy}
            onClick={() => switchMode('reset')}
          >
            Forgot password?
          </button>
        </form>
      ) : null}

      {mode === 'reset' && resetStep === 'email' ? (
        <form className="flex flex-col gap-4" onSubmit={handleForgotPassword}>
          <p className="text-[12px] uppercase tracking-[0.12em] text-text-muted">
            Enter your email to receive a reset code.
          </p>
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="accent"
              disabled={busy || !email.trim()}
            >
              {busy ? 'Sending' : 'Send reset code'}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => switchMode('login')}
            >
              Back to login
            </Button>
          </div>
        </form>
      ) : null}

      {mode === 'reset' && resetStep === 'verify' ? (
        <form className="flex flex-col gap-4" onSubmit={handleResetPassword}>
          <div className="flex flex-col gap-2">
            <MicroLabel>Email</MicroLabel>
            <input
              type="email"
              value={email}
              readOnly
              className={`${fieldClass} opacity-70`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <MicroLabel>Reset code</MicroLabel>
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              className={fieldClass}
              placeholder="000000"
              disabled={busy}
              autoComplete="one-time-code"
            />
          </div>
          <div className="flex flex-col gap-2">
            <MicroLabel>New password</MicroLabel>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
              placeholder="Min 8 characters"
              disabled={busy}
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="accent" disabled={busy}>
              {busy ? 'Updating' : 'Update password'}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => {
                setResetStep('email')
                setCode('')
                setInfo(null)
              }}
            >
              Back
            </Button>
          </div>
        </form>
      ) : null}

      {info ? (
        <p className="mt-4 border border-border bg-base px-3 py-2 text-[12px] uppercase tracking-[0.12em] text-text-muted">
          {info}
        </p>
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
