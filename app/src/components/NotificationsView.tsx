import { useEffect, useState } from 'react'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { Panel } from '@/components/ui/Panel'
import { formatTimestamp } from '@/lib/format'
import {
  ApiClientError,
  listNotifications,
  markNotificationsRead,
  type AppNotification,
} from '@/lib/api'
import type { ProfilePeek } from '@/components/feed/TweetCard'

type NotificationsViewProps = {
  onOpenProfile?: (profile: ProfilePeek) => void
  onNotificationsRead?: () => void
}

function titleFor(type: AppNotification['type']): string {
  switch (type) {
    case 'like':
      return 'Like'
    case 'comment':
      return 'Comment'
    case 'repost':
      return 'Repost'
    case 'reaction':
      return 'Reaction'
    case 'follow':
      return 'Follow'
    default:
      return 'Alert'
  }
}

function bodyFor(item: AppNotification): string {
  switch (item.type) {
    case 'like':
      return `${item.actorHandle} liked your transmission.`
    case 'comment':
      return `${item.actorHandle} commented: ${item.body ?? '…'}`
    case 'repost':
      return `${item.actorHandle} reposted your transmission.`
    case 'reaction':
      return `${item.actorHandle} reacted ${item.body ?? ''} to your post.`
    case 'follow':
      return `${item.actorHandle} started following you.`
    default:
      return 'New signal in the queue.'
  }
}

/** Notifications tab — live alert queue from likes, comments, reposts, follows. */
export function NotificationsView({
  onOpenProfile,
  onNotificationsRead,
}: NotificationsViewProps) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const { notifications: next } = await listNotifications()
        if (cancelled) return
        setItems(next)
        setError(null)
        const hasUnread = next.some((item) => !item.read)
        if (hasUnread) {
          void markNotificationsRead()
            .then(() => {
              if (!cancelled) onNotificationsRead?.()
            })
            .catch(() => undefined)
        }
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Notification downlink failed.',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 8_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [onNotificationsRead])

  return (
    <Panel label="Notifications // Queue" elevated>
      <h2 className="text-[20px] uppercase tracking-[0.12em] text-text-primary">
        Alerts
      </h2>
      <p className="mt-3 text-[14px] leading-[1.4] text-text-muted">
        Mentions, likes, comments, reposts, and follows land here.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 border border-accent bg-base px-3 py-2 text-[12px] uppercase tracking-[0.12em] text-accent"
        >
          {error}
        </p>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="mt-6 text-[14px] text-text-muted">Syncing alert queue…</p>
      ) : null}

      {!loading && items.length === 0 && !error ? (
        <p className="mt-6 text-[14px] text-text-muted">
          No alerts yet. Likes, comments, and reposts on your posts will show up
          here.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((item, index) => (
            <li
              key={item.id}
              className={`border px-3 py-3 ${
                item.read
                  ? 'border-[#4a4744] bg-[#1b1b1a]'
                  : 'border-[#ff9142] bg-[#1b1b1a]'
              }`}
              style={{ borderRadius: 0 }}
            >
              <div className="flex items-center justify-between gap-3">
                <MicroLabel>{titleFor(item.type)}</MicroLabel>
                <span className="text-[11px] text-[#ff9142]">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <button
                type="button"
                className="mt-2 text-left text-[14px] leading-[1.4] text-text-primary hover:text-[#ff9142]"
                onClick={() =>
                  onOpenProfile?.({
                    id: item.actorId,
                    handle: item.actorHandle,
                  })
                }
              >
                {bodyFor(item)}
              </button>
              <time className="mt-2 block text-[11px] uppercase tracking-[0.12em] text-text-muted">
                {formatTimestamp(item.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  )
}
