import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { Panel } from '@/components/ui/Panel'
import { formatCharCount } from '@/lib/format'
import {
  aiAssist,
  ApiClientError,
  TWEET_MAX_CHARS,
  type AssistMode,
} from '@/lib/api'
import { TWEET_IMAGE_MAX_CHARS } from '../../../shared/constants'
import { readImageAsDataUrl } from '@/lib/profileMedia'

type TweetComposerProps = {
  handle: string
  busy?: boolean
  error?: string | null
  onPost: (input: {
    body: string
    imageUrl?: string
  }) => Promise<void> | void
}

const ASSIST_OPTIONS: { mode: AssistMode; label: string }[] = [
  { mode: 'polished', label: 'Polished' },
  { mode: 'concise', label: 'More Concise' },
  { mode: 'hashtags', label: 'Add Hashtags' },
  { mode: 'summarize', label: 'Summarize' },
]

export function TweetComposer({
  handle,
  busy = false,
  error = null,
  onPost,
}: TweetComposerProps) {
  const bodyId = useId()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [assistBusy, setAssistBusy] = useState(false)
  const [assistError, setAssistError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const length = body.length
  const overLimit = length > TWEET_MAX_CHARS
  const canPost =
    (body.trim().length > 0 || Boolean(imageUrl)) && !overLimit && !busy
  const canAssist = body.trim().length > 0 && !busy && !assistBusy

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  async function handleImagePick(file: File | undefined) {
    setImageError(null)
    if (!file) return
    try {
      const dataUrl = await readImageAsDataUrl(file)
      if (dataUrl.length > TWEET_IMAGE_MAX_CHARS) {
        setImageError('Image is too large. Use a smaller file.')
        return
      }
      setImageUrl(dataUrl)
    } catch {
      setImageError('Could not read that image.')
    }
  }

  async function runAssist(mode: AssistMode) {
    if (!canAssist) return
    setMenuOpen(false)
    setAssistBusy(true)
    setAssistError(null)
    try {
      const text = await aiAssist(body, mode)
      setPreview(text)
    } catch (err) {
      setAssistError(
        err instanceof ApiClientError
          ? err.message
          : 'AI assist failed. Try again.',
      )
    } finally {
      setAssistBusy(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canPost) return
    await onPost({
      body: body.trim(),
      imageUrl: imageUrl ?? undefined,
    })
    setBody('')
    setImageUrl(null)
    setImageError(null)
    setPreview(null)
    setAssistError(null)
  }

  const counterClass = overLimit
    ? 'text-accent'
    : length > TWEET_MAX_CHARS - 20
      ? 'text-accent'
      : 'text-text-muted'

  const displayError = imageError ?? error ?? assistError

  return (
    <Panel label="COMPOSER // UPLINK" id="composer-uplink">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <MicroLabel>Handle</MicroLabel>
          <p className="border border-border bg-base px-3 py-2 text-[14px] text-accent">
            {handle}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <MicroLabel>Transmission body</MicroLabel>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                disabled={!canAssist}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="AI assist"
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex items-center gap-1.5 border border-[#4a4744] bg-[#262421] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#ff9142] transition-colors hover:border-[#ff9142] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderRadius: 0 }}
              >
                <SparkleIcon busy={assistBusy} />
                {assistBusy ? 'Working…' : 'AI'}
              </button>
              {menuOpen ? (
                <ul
                  role="menu"
                  className="absolute right-0 z-30 mt-1 min-w-[11rem] border border-[#4a4744] bg-[#1b1b1a] py-1 shadow-none"
                >
                  {ASSIST_OPTIONS.map((option) => (
                    <li key={option.mode} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-text-primary transition-colors hover:bg-[#262421] hover:text-[#ff9142]"
                        style={{ borderRadius: 0 }}
                        onClick={() => void runAssist(option.mode)}
                      >
                        {option.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          <textarea
            id={bodyId}
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            maxLength={TWEET_MAX_CHARS}
            spellCheck
            className="w-full resize-y border border-border bg-base px-3 py-3 text-[15px] leading-[1.4] text-text-primary outline-none transition-colors duration-150 ease-in-out placeholder:text-text-muted focus:border-accent"
            placeholder="Log status from Kuiper Alpha…"
            disabled={busy || assistBusy}
            aria-invalid={overLimit}
          />
        </div>

        {preview ? (
          <div className="flex flex-col gap-2 border border-[#4a4744] bg-[#262421] px-3 py-3">
            <MicroLabel>AI preview</MicroLabel>
            <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.4] text-text-primary">
              {preview}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="accent"
                disabled={busy || assistBusy}
                onClick={() => {
                  setBody(preview.slice(0, TWEET_MAX_CHARS))
                  setPreview(null)
                }}
              >
                Insert
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy || assistBusy}
                onClick={() => setPreview(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <MicroLabel>Image</MicroLabel>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Attach image"
            onChange={(event) => {
              void handleImagePick(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          {imageUrl ? (
            <div className="relative border border-border bg-base">
              <img
                src={imageUrl}
                alt="Attachment preview"
                className="max-h-64 w-full object-contain"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => setImageUrl(null)}
                className="absolute right-2 top-2 border border-[#4a4744] bg-[#1b1b1a] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#ff9142]"
                style={{ borderRadius: 0 }}
              >
                Remove
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => imageInputRef.current?.click()}
            >
              Attach image
            </Button>
          )}
        </div>

        {displayError ? (
          <p
            role="alert"
            className="border border-accent bg-base px-3 py-2 text-[12px] uppercase tracking-[0.12em] text-accent"
          >
            {displayError}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <MicroLabel className={counterClass}>
            {formatCharCount(length, TWEET_MAX_CHARS)}
          </MicroLabel>
          <Button type="submit" variant="accent" disabled={!canPost}>
            {busy ? 'Sending' : 'Post'}
          </Button>
        </div>
      </form>
    </Panel>
  )
}

function SparkleIcon({ busy }: { busy: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden
      className={busy ? 'animate-pulse' : undefined}
    >
      <path
        d="M6 0.5 L6.9 4.2 L10.5 5 L6.9 5.8 L6 9.5 L5.1 5.8 L1.5 5 L5.1 4.2 Z"
        fill="currentColor"
      />
      <path
        d="M9.5 7.5 L9.9 9 L11.5 9.4 L9.9 9.8 L9.5 11.5 L9.1 9.8 L7.5 9.4 L9.1 9 Z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  )
}
