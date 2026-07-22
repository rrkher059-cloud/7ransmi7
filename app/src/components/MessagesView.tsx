import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { GlowButton } from '@/components/ui/GlowButton'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { formatCharCount, formatTimestamp } from '@/lib/format'
import {
  ApiClientError,
  getMessageThread,
  listMessageConversations,
  searchUsers,
  sendDirectMessage,
  TWEET_MAX_CHARS,
  type DmConversation,
  type DmMessage,
  type PublicUser,
} from '@/lib/api'
import { createTweetSchema } from '../../shared/schemas'
import type { ProfilePeek } from '@/components/feed/TweetCard'

type MessagesViewProps = {
  selfHandle: string
  selfUserId: string
  startWith?: ProfilePeek | null
  onStartConsumed?: () => void
}

export function MessagesView({
  selfHandle,
  selfUserId,
  startWith = null,
  onStartConsumed,
}: MessagesViewProps) {
  const [conversations, setConversations] = useState<DmConversation[]>([])
  const [activePeerId, setActivePeerId] = useState<string | null>(null)
  const [thread, setThread] = useState<DmConversation | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [composeQuery, setComposeQuery] = useState('')
  const [userHits, setUserHits] = useState<PublicUser[]>([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)

  const refreshList = useCallback(async () => {
    try {
      const next = await listMessageConversations()
      setConversations(next)
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load conversations.',
      )
    }
  }, [])

  const refreshThread = useCallback(async (peerId: string) => {
    try {
      const next = await getMessageThread(peerId)
      setThread(next)
      setError(null)
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to load thread.',
      )
    }
  }, [])

  useEffect(() => {
    void refreshList()
    const timer = window.setInterval(() => {
      void refreshList()
      if (activePeerId) void refreshThread(activePeerId)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [refreshList, refreshThread, activePeerId])

  useEffect(() => {
    if (!startWith) return
    setActivePeerId(startWith.id)
    void refreshThread(startWith.id).then(() => refreshList())
    onStartConsumed?.()
  }, [startWith, onStartConsumed, refreshThread, refreshList])

  useEffect(() => {
    if (!activePeerId) {
      setThread(null)
      return
    }
    void refreshThread(activePeerId)
  }, [activePeerId, refreshThread])

  useEffect(() => {
    const q = composeQuery.trim()
    if (q.length < 1) {
      setUserHits([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      void searchUsers(q)
        .then((users) => {
          if (!cancelled) setUserHits(users)
        })
        .catch(() => {
          if (!cancelled) setUserHits([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [composeQuery])

  const active = useMemo(() => {
    if (thread && thread.peer.id === activePeerId) return thread
    return conversations.find((c) => c.peer.id === activePeerId) ?? null
  }, [thread, conversations, activePeerId])

  const messages: DmMessage[] = active?.messages ?? []
  const length = draft.length
  const overLimit = length > TWEET_MAX_CHARS
  const canSend = draft.trim().length > 0 && !overLimit && !sending

  function openChat(user: PublicUser | ProfilePeek) {
    setActivePeerId(user.id)
    setComposeQuery('')
    setUserHits([])
    setError(null)
    void refreshThread(user.id)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!activePeerId) return

    const parsed = createTweetSchema.safeParse({ body: draft })
    if (!parsed.success) {
      const message =
        parsed.error.flatten().fieldErrors.body?.[0] ??
        'Message failed validation.'
      setError(message)
      return
    }

    setSending(true)
    try {
      await sendDirectMessage({
        toUserId: activePeerId,
        body: parsed.data.body,
      })
      setDraft('')
      setError(null)
      await refreshThread(activePeerId)
      await refreshList()
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Failed to send message.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-[28rem] flex-col border border-[#4a4744] bg-base font-mono md:flex-row">
      <aside className="flex w-full flex-col border-[#4a4744] md:w-72 md:border-r">
        <div className="border-b border-[#4a4744] bg-[#262421] px-3 py-3">
          <MicroLabel>New message</MicroLabel>
          <input
            type="search"
            value={composeQuery}
            onChange={(event) => setComposeQuery(event.target.value)}
            placeholder="Find user by handle…"
            className="mt-2 w-full border border-[#4a4744] bg-[#1b1b1a] px-2 py-2 text-[13px] text-text-primary outline-none focus:border-[#ff9142]"
            style={{ borderRadius: 0 }}
            autoComplete="off"
          />
          {composeQuery.trim() ? (
            <ul className="mt-2 max-h-40 overflow-y-auto border border-[#4a4744] bg-[#1b1b1a]">
              {searching ? (
                <li className="px-2 py-2 text-[11px] text-text-muted">
                  Scanning…
                </li>
              ) : userHits.length === 0 ? (
                <li className="px-2 py-2 text-[11px] text-text-muted">
                  No operators found.
                </li>
              ) : (
                userHits.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => openChat(user)}
                      className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-[#262421]"
                    >
                      <UserAvatar
                        userId={user.id}
                        handle={user.handle}
                        size={28}
                      />
                      <span className="text-[12px] text-[#ff9142]">
                        {user.handle}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>

        <div className="border-b border-[#4a4744] bg-[#262421] px-3 py-2">
          <MicroLabel>Active chats</MicroLabel>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <li className="px-3 py-4 text-[13px] text-text-muted">
              No threads yet. Search a handle above to start.
            </li>
          ) : (
            conversations.map((conversation) => {
              const selected = conversation.peer.id === activePeerId
              return (
                <li key={conversation.peer.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePeerId(conversation.peer.id)
                      setError(null)
                    }}
                    className={`flex w-full items-center gap-2 border-b border-[#4a4744] px-3 py-3 text-left transition-colors duration-150 ease-in-out ${
                      selected
                        ? 'bg-[#262421] text-[#ff9142]'
                        : 'bg-base text-text-primary hover:bg-[#262421]/80'
                    }`}
                    style={{ borderRadius: 0 }}
                  >
                    <UserAvatar
                      userId={conversation.peer.id}
                      handle={conversation.peer.handle}
                      size={32}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px]">
                        {conversation.peer.handle}
                      </span>
                      <span
                        className={`line-clamp-1 text-[11px] uppercase tracking-[0.1em] ${
                          selected ? 'text-[#ff9142]/80' : 'text-text-muted'
                        }`}
                      >
                        {conversation.preview || 'Empty channel'}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </aside>

      <section className="flex min-h-[22rem] min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[#4a4744] bg-[#262421] px-4 py-3">
          <div>
            <MicroLabel>Thread</MicroLabel>
            <p className="text-[14px] text-[#ff9142]">
              {active?.peer.handle ?? '—'}
            </p>
          </div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
            You {selfHandle}
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-base px-4 py-4">
          {!activePeerId ? (
            <p className="text-[14px] text-text-muted">
              Select a chat or start one by searching a user.
            </p>
          ) : messages.length === 0 ? (
            <p className="text-[14px] text-text-muted">
              Channel open. Send the first transmission — they will see it on
              their account.
            </p>
          ) : (
            messages.map((message) => {
              const mine = message.fromUserId === selfUserId
              return (
                <div
                  key={message.id}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] border px-3 py-2 ${
                      mine
                        ? 'border-[#ff9142] bg-[#262421]'
                        : 'border-[#4a4744] bg-[#262421]'
                    }`}
                    style={{ borderRadius: 0 }}
                  >
                    <p className="whitespace-pre-wrap text-[14px] leading-[1.4] text-text-primary">
                      {message.body}
                    </p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-text-muted">
                      {formatTimestamp(message.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <form
          onSubmit={(event) => {
            void handleSubmit(event)
          }}
          className="border-t border-[#4a4744] bg-[#262421] px-3 py-3"
        >
          <MicroLabel>Compose</MicroLabel>
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              if (error) setError(null)
            }}
            rows={3}
            maxLength={TWEET_MAX_CHARS}
            placeholder="Transmit up to 280 characters…"
            className="mt-2 w-full resize-none border border-[#4a4744] bg-base px-3 py-2 text-[14px] text-text-primary outline-none transition-colors duration-150 ease-in-out placeholder:text-text-muted focus:border-[#ff9142]"
            style={{ borderRadius: 0 }}
            disabled={!activePeerId || sending}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span
              className={`text-[11px] uppercase tracking-[0.15em] ${
                overLimit ? 'text-[#ff9142]' : 'text-text-muted'
              }`}
            >
              {formatCharCount(length, TWEET_MAX_CHARS)}
            </span>
            <GlowButton
              type="submit"
              disabled={!canSend || !activePeerId}
            >
              Send
            </GlowButton>
          </div>
          {error ? (
            <p
              role="alert"
              className="mt-2 border border-[#ff9142] bg-base px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-[#ff9142]"
              style={{ borderRadius: 0 }}
            >
              {error}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  )
}
