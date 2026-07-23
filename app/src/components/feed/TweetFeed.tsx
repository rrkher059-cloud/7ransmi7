import { Panel } from '@/components/ui/Panel'
import { TweetCard, type ProfilePeek } from '@/components/feed/TweetCard'
import type { Tweet } from '@/lib/api'

type TweetFeedProps = {
  tweets: Tweet[]
  currentUserId: string
  loading?: boolean
  error?: string | null
  busyId?: string | null
  onReact: (tweetId: string, emoji: string) => void
  onLike: (tweetId: string) => void
  onComment: (tweetId: string, body: string) => Promise<void> | void
  onRepost: (tweetId: string) => void
  onDelete: (tweetId: string) => void
  onOpenProfile?: (profile: ProfilePeek) => void
}

export function TweetFeed({
  tweets,
  currentUserId,
  loading = false,
  error = null,
  busyId = null,
  onReact,
  onLike,
  onComment,
  onRepost,
  onDelete,
  onOpenProfile,
}: TweetFeedProps) {
  const label =
    loading && tweets.length === 0
      ? 'FEED // SYNCING'
      : tweets.length === 0
        ? 'FEED // EMPTY BUFFER'
        : `FEED // ${String(tweets.length).padStart(2, '0')} SIGNALS`

  return (
    <Panel label={label} elevated>
      <p className="mb-4 text-[11px] uppercase tracking-[0.12em] text-text-muted">
        Your posts + 5 random signals · auto-purge at 24 hours
      </p>

      {error ? (
        <p
          role="alert"
          className="mb-4 border border-accent bg-base px-3 py-2 text-[12px] uppercase tracking-[0.12em] text-accent"
        >
          {error}
        </p>
      ) : null}

      {loading && tweets.length === 0 ? (
        <p className="text-[14px] text-text-muted">Awaiting downlink…</p>
      ) : null}

      {!loading && tweets.length === 0 && !error ? (
        <p className="text-[14px] text-text-muted">
          No transmissions yet. Post from the composer to open the channel.
        </p>
      ) : null}

      {tweets.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {tweets.map((tweet) => (
            <li key={tweet.id}>
              <TweetCard
                tweet={tweet}
                currentUserId={currentUserId}
                busy={busyId === tweet.id}
                onReact={onReact}
                onLike={onLike}
                onComment={onComment}
                onRepost={onRepost}
                onDelete={onDelete}
                onOpenProfile={onOpenProfile}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  )
}
