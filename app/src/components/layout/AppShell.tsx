import type { ReactNode } from 'react'
import DotField from '@/components/effects/DotField'
import { Button } from '@/components/ui/Button'
import { MicroLabel } from '@/components/ui/MicroLabel'

type AppShellProps = {
  children: ReactNode
  online?: boolean
  handle?: string | null
  onLogout?: () => void
}

export function AppShell({
  children,
  online = true,
  handle = null,
  onLogout,
}: AppShellProps) {
  return (
    <div className="relative min-h-screen bg-base font-mono text-text-primary">
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden
      >
        <DotField
          dotRadius={1.5}
          dotSpacing={14}
          bulgeStrength={67}
          glowRadius={0}
          sparkle={false}
          waveAmplitude={0}
          cursorRadius={500}
          cursorForce={0.1}
          bulgeOnly
          gradientFrom="rgba(255, 145, 66, 0.35)"
          gradientTo="rgba(74, 71, 68, 0.25)"
          glowColor="transparent"
        />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-border bg-panel/95">
          <div className="mx-auto flex max-w-2xl items-end justify-between gap-4 px-4 py-5">
            <div className="flex flex-col gap-2">
              <MicroLabel>SIGNAL CHANNEL // V0.1</MicroLabel>
              <h1 className="text-[32px] uppercase leading-none tracking-[0.12em] text-text-primary">
                <span className="bg-accent px-1 text-[#1b1b1a]">X</span>
                <span className="ml-2">7RANSMI7</span>
              </h1>
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              <div className="flex flex-col items-end gap-1">
                <MicroLabel>Link status</MicroLabel>
                <p
                  className={`text-[12px] uppercase tracking-[0.15em] ${online ? 'text-accent' : 'text-text-muted'}`}
                >
                  {online ? 'Online' : 'Offline'}
                </p>
              </div>
              {handle ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end gap-1">
                    <MicroLabel>Operator</MicroLabel>
                    <p className="text-[12px] text-accent">{handle}</p>
                  </div>
                  {onLogout ? (
                    <Button type="button" variant="primary" onClick={onLogout}>
                      Log out
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-border bg-panel/95">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted">
              Departure Mono / Dark HUD
            </p>
            <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted">
              Accent #FF9142 · Radius 0
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
