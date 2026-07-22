import { useEffect, useState } from 'react'
import { TweetComposer } from '@/components/composer/TweetComposer'
import { FeedProfileHeader } from '@/components/feed/FeedProfileHeader'
import { TweetFeed } from '@/components/feed/TweetFeed'
import type { ProfilePeek } from '@/components/feed/TweetCard'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { Panel } from '@/components/ui/Panel'
import {
  aiSemanticSearch,
  ApiClientError,
  type PublicUser,
  type Tweet,
} from '@/lib/api'

type HomeFeedProps = {
  handle: string
  tweets: Tweet[]
  currentUserId: string
  loading: boolean
  posting: boolean
  busyId: string | null
  feedError: string | null
  composerError: string | null
  profileUser?: PublicUser | null
  onPost: (input: { body: string; imageUrl?: string }) => Promise<void>
  onReact: (tweetId: string, emoji: string) => Promise<void>
  onLike: (tweetId: string) => Promise<void>
  onComment: (tweetId: string, body: string) => Promise<void>
  onRepost: (tweetId: string) => Promise<void>
  onDelete: (tweetId: string) => Promise<void>
  onOpenProfile?: (profile: ProfilePeek) => void
}

/** Home tab — profile strip, composer uplink + live feed. */
export function HomeFeed({
  handle,
  tweets,
  currentUserId,
  loading,
  posting,
  busyId,
  feedError,
  composerError,
  profileUser = null,
  onPost,
  onReact,
  onLike,
  onComment,
  onRepost,
  onDelete,
  onOpenProfile,
}: HomeFeedProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [semanticHits, setSemanticHits] = useState<Tweet[] | null>(null)
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false
    if (!debounced) {
      setSemanticHits(null)
      setSearchError(null)
      setSearchBusy(false)
      return
    }

    ;(async () => {
      setSearchBusy(true)
      try {
        const hits = await aiSemanticSearch(debounced)
        if (!cancelled) {
          setSemanticHits(hits)
          setSearchError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setSemanticHits(null)
          setSearchError(
            err instanceof ApiClientError
              ? err.message
              : 'Semantic search failed.',
          )
        }
      } finally {
        if (!cancelled) setSearchBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [debounced])

  const displayTweets = semanticHits ?? tweets

  return (
    <>
      {profileUser ? (
        <FeedProfileHeader
          user={profileUser}
          onOpenProfile={() =>
            onOpenProfile?.({
              id: profileUser.id,
              handle: profileUser.handle,
            })
          }
        />
      ) : null}
      <TweetComposer
        handle={handle}
        busy={posting}
        error={composerError}
        onPost={onPost}
      />

      <Panel label="Feed // Semantic scan">
        <MicroLabel>Natural language search</MicroLabel>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. posts about orbit ops or late-night status…"
          className="mt-2 w-full border border-[#4a4744] bg-[#1b1b1a] px-3 py-3 text-[14px] text-text-primary outline-none transition-colors duration-150 ease-in-out placeholder:text-text-muted focus:border-accent"
          style={{ borderRadius: 0 }}
          autoComplete="off"
          spellCheck={false}
        />
        <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-text-muted">
          {searchBusy
            ? 'Ranking by meaning…'
            : debounced
              ? `${displayTweets.length} match(es) · AI semantic`
              : 'Leave empty to show the live feed'}
        </p>
        {searchError ? (
          <p
            role="alert"
            className="mt-2 border border-accent bg-base px-3 py-2 text-[12px] uppercase tracking-[0.12em] text-accent"
          >
            {searchError}
          </p>
        ) : null}
      </Panel>

      <TweetFeed
        tweets={displayTweets}
        currentUserId={currentUserId}
        loading={loading || searchBusy}
        error={feedError}
        busyId={busyId}
        onReact={onReact}
        onLike={onLike}
        onComment={onComment}
        onRepost={onRepost}
        onDelete={onDelete}
        onOpenProfile={onOpenProfile}
      />
    </>
  )
}
