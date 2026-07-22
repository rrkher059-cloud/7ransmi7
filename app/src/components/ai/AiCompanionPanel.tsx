import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { Panel } from '@/components/ui/Panel'
import {
  aiCompanion,
  ApiClientError,
  type CompanionChatMessage,
} from '@/lib/api'

type AiCompanionPanelProps = {
  open: boolean
  onToggle: () => void
  signedIn: boolean
  onRequireAuth?: () => void
}

const QUICK_PROMPTS = [
  'Summarize the top posts on my feed',
  'What topics are active right now?',
  'How do I post and explore on 7RANSMI7?',
]

export function AiCompanionPanel({
  open,
  onToggle,
  signedIn,
  onRequireAuth,
}: AiCompanionPanelProps) {
  const inputId = useId()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<CompanionChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy, open])

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    if (!signedIn) {
      onRequireAuth?.()
      return
    }

    const history = messages.slice(-8)
    setMessages((current) => [...current, { role: 'user', content: message }])
    setDraft('')
    setBusy(true)
    setError(null)
    try {
      const reply = await aiCompanion(message, history)
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: reply },
      ])
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Companion downlink failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void send(draft)
  }

  return (
    <aside
      className={`flex h-full flex-col border border-[#4a4744] bg-[#262421]/95 transition-[width] duration-200 ease-out ${
        open ? 'w-72 lg:w-80' : 'w-11'
      }`}
      aria-label="AI companion"
    >
      <div
        className="flex items-center gap-2 border-b border-[#4a4744] px-2 py-2"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="ai-companion-body"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center border border-[#4a4744] bg-[#1b1b1a] text-[#ff9142] transition-colors hover:border-[#ff9142]"
          style={{ borderRadius: 0 }}
          title={open ? 'Collapse AI companion' : 'Open AI companion'}
        >
          {open ? '«' : '✦'}
        </button>
        {open ? (
          <div className="min-w-0">
            <MicroLabel>Companion</MicroLabel>
            <p className="truncate text-[12px] uppercase tracking-[0.12em] text-text-primary">
              AI // Relay
            </p>
          </div>
        ) : null}
      </div>

      {open ? (
        <div
          id="ai-companion-body"
          className="flex min-h-0 flex-1 flex-col gap-3 p-3"
        >
          <Panel label="Channel">
            <div className="flex max-h-72 min-h-[12rem] flex-col gap-3 overflow-y-auto pr-1">
              {messages.length === 0 && !busy ? (
                <p className="text-[12px] leading-[1.4] text-text-muted">
                  Ask about feed content, request a summary, or get platform
                  support.
                </p>
              ) : null}
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`border px-2 py-2 text-[12px] leading-[1.4] ${
                    message.role === 'user'
                      ? 'border-[#4a4744] bg-[#1b1b1a] text-text-primary'
                      : 'border-[#ff9142]/40 bg-[#1b1b1a] text-text-primary'
                  }`}
                >
                  <MicroLabel>
                    {message.role === 'user' ? 'You' : 'Companion'}
                  </MicroLabel>
                  <p className="mt-1 whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                </div>
              ))}
              {busy ? <CompanionSkeleton /> : null}
              <div ref={bottomRef} />
            </div>
          </Panel>

          <div className="flex flex-col gap-2">
            <MicroLabel>Quick asks</MicroLabel>
            <div className="flex flex-col gap-1">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(prompt)}
                  className="border border-[#4a4744] bg-[#1b1b1a] px-2 py-1.5 text-left text-[10px] uppercase tracking-[0.1em] text-text-muted transition-colors hover:border-[#ff9142] hover:text-[#ff9142] disabled:opacity-40"
                  style={{ borderRadius: 0 }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="border border-accent bg-base px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] text-accent"
            >
              {error}
            </p>
          ) : null}

          <form className="mt-auto flex flex-col gap-2" onSubmit={handleSubmit}>
            <label htmlFor={inputId} className="sr-only">
              Ask companion
            </label>
            <textarea
              id={inputId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              maxLength={1000}
              disabled={busy}
              placeholder={
                signedIn
                  ? 'Ask the companion…'
                  : 'Sign in to open the companion uplink'
              }
              className="w-full resize-none border border-[#4a4744] bg-[#1b1b1a] px-2 py-2 text-[12px] leading-[1.4] text-text-primary outline-none placeholder:text-text-muted focus:border-accent disabled:opacity-50"
            />
            <Button
              type="submit"
              variant="accent"
              disabled={busy || !draft.trim()}
            >
              {busy ? 'Thinking…' : 'Send'}
            </Button>
          </form>
        </div>
      ) : null}
    </aside>
  )
}

function CompanionSkeleton() {
  return (
    <div
      className="flex flex-col gap-2 border border-[#4a4744] bg-[#1b1b1a] px-2 py-2"
      aria-busy
      aria-label="Companion thinking"
    >
      <MicroLabel>Companion</MicroLabel>
      <div className="h-2 w-[80%] animate-pulse bg-[#4a4744]/60" />
      <div className="h-2 w-full animate-pulse bg-[#4a4744]/40" />
      <div className="h-2 w-[60%] animate-pulse bg-[#4a4744]/50" />
    </div>
  )
}
