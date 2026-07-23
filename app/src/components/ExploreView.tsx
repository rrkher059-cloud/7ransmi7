import { useEffect, useMemo, useState } from 'react'
import { GlowButton } from '@/components/ui/GlowButton'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { Panel } from '@/components/ui/Panel'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { formatTimestamp } from '@/lib/format'
import {
  ApiClientError,
  fetchFollowStats,
  fetchSuggestions,
  fetchTrending,
  searchExplore,
  toggleFollowUser,
  type PublicUser,
  type TrendingTopic,
  type Tweet,
} from '@/lib/api'
import type { ProfilePeek } from '@/components/feed/TweetCard'

type ExploreViewProps = {
  localTweets?: Tweet[]
  onOpenProfile?: (profile: ProfilePeek) => void
  onMessageUser?: (profile: ProfilePeek) => void
  onRequireAuth?: () => boolean
}

async function syncFollowState(users: PublicUser[]): Promise<Set<string>> {
  const following = new Set<string>()
  await Promise.all(
    users.map(async (user) => {
      try {
        const stats = await fetchFollowStats(user.id)
        if (stats.isFollowing) following.add(user.id)
      } catch {
        // leave unset
      }
    }),
  )
  return following
}

export function ExploreView({
  localTweets = [],
  onOpenProfile,
  onMessageUser,
  onRequireAuth,
}: ExploreViewProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<Tweet[]>([])
  const [userHits, setUserHits] = useState<PublicUser[]>([])
  const [topics, setTopics] = useState<TrendingTopic[]>([])
  const [suggestions, setSuggestions] = useState<PublicUser[]>([])
  const [following, setFollowing] = useState<Set<string>>(() => new Set())
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [nextTopics, nextUsers] = await Promise.all([
          fetchTrending(),
          fetchSuggestions(),
        ])
        if (cancelled) return
        setTopics(nextTopics)
        setSuggestions(nextUsers)
        setError(null)
        const nextFollowing = await syncFollowState(nextUsers)
        if (!cancelled) {
          setFollowing((current) => {
            const merged = new Set(current)
            for (const user of nextUsers) {
              if (nextFollowing.has(user.id)) merged.add(user.id)
              else merged.delete(user.id)
            }
            return merged
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Explore downlink failed.',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const localMatches = useMemo(() => {
    const q = debounced.toLowerCase()
    if (!q) return []
    return localTweets.filter(
      (tweet) =>
        (tweet.body ?? '').toLowerCase().includes(q) ||
        (tweet.handle ?? '').toLowerCase().includes(q),
    )
  }, [debounced, localTweets])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingSearch(true)
      try {
        const { tweets, users } = await searchExplore(debounced, {
          semantic: Boolean(debounced),
        })
        if (cancelled) return
        setResults(tweets)
        setUserHits(users)
        setError(null)
        if (users.length > 0) {
          const nextFollowing = await syncFollowState(users)
          if (!cancelled) {
            setFollowing((current) => {
              const merged = new Set(current)
              for (const user of users) {
                if (nextFollowing.has(user.id)) merged.add(user.id)
                else merged.delete(user.id)
              }
              return merged
            })
          }
        }
      } catch (err) {
        if (!cancelled) {
          setResults(localMatches)
          setUserHits([])
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Search failed — showing local matches.',
          )
        }
      } finally {
        if (!cancelled) setLoadingSearch(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debounced, localMatches])

  function toggleFollow(userId: string) {
    if (onRequireAuth && !onRequireAuth()) return
    void toggleFollowUser(userId)
      .then((result) => {
        setFollowing((current) => {
          const next = new Set(current)
          if (result.isFollowing) next.add(userId)
          else next.delete(userId)
          return next
        })
      })
      .catch(() => {
        // keep local state
      })
  }

  function applyTopic(hashtag: string) {
    setQuery(hashtag)
  }

  const displayResults = results.length > 0 || debounced ? results : []

  return (
    <div className="flex flex-col gap-6 font-mono">
      <Panel label="Explore // Search">
        <MicroLabel>Scan channel</MicroLabel>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Natural language or exact: users, posts, #tags…"
          className="mt-2 w-full border border-[#4a4744] bg-[#262421] px-3 py-3 text-[14px] text-text-primary outline-none transition-colors duration-150 ease-in-out placeholder:text-text-muted focus:border-accent"
          style={{ borderRadius: 0 }}
          autoComplete="off"
          spellCheck={false}
        />
        <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-text-muted">
          {loadingSearch
            ? 'Semantic scan in progress…'
            : debounced
              ? `${userHits.length} user(s) · ${displayResults.length} post(s) · AI meaning match`
              : 'Ask in plain language or match handles / #tags'}
        </p>
      </Panel>

      {error ? (
        <p
          role="alert"
          className="border border-accent bg-base px-3 py-2 text-[12px] uppercase tracking-[0.12em] text-accent"
        >
          {error}
        </p>
      ) : null}

      {debounced ? (
        <Panel label="Users // Matches" elevated>
          {userHits.length === 0 && !loadingSearch ? (
            <p className="text-[14px] text-text-muted">No matching operators.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {userHits.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 border border-[#4a4744] bg-[#1b1b1a] px-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      userId={user.id}
                      handle={user.handle}
                      size={40}
                      onClick={
                        onOpenProfile
                          ? () =>
                              onOpenProfile({
                                id: user.id,
                                handle: user.handle,
                              })
                          : undefined
                      }
                    />
                    <div className="min-w-0">
                      <MicroLabel>Operator</MicroLabel>
                      <button
                        type="button"
                        className="truncate text-[14px] text-[#ff9142] hover:underline"
                        onClick={() =>
                          onOpenProfile?.({
                            id: user.id,
                            handle: user.handle,
                          })
                        }
                      >
                        {user.handle}
                      </button>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <GlowButton
                      type="button"
                      onClick={() =>
                        onMessageUser?.({ id: user.id, handle: user.handle })
                      }
                    >
                      Message
                    </GlowButton>
                    <GlowButton
                      type="button"
                      onClick={() => toggleFollow(user.id)}
                    >
                      {following.has(user.id) ? 'Following' : 'Follow'}
                    </GlowButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {debounced ? (
        <Panel label="Posts // Results" elevated>
          {displayResults.length === 0 && !loadingSearch ? (
            <p className="text-[14px] text-text-muted">No matching signals.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {displayResults.map((tweet) => (
                <li
                  key={tweet.id}
                  className="border border-border bg-base px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-accent">{tweet.handle}</p>
                    <time className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                      {formatTimestamp(tweet.createdAt)}
                    </time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[14px] leading-[1.4] text-text-primary">
                    {tweet.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      <Panel label="Trending Topics" elevated>
        <ul className="flex flex-col">
          {topics.map((topic, index) => (
            <li
              key={topic.hashtag}
              className={`flex items-center justify-between gap-3 py-3 ${
                index > 0 ? 'border-t border-border' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => applyTopic(topic.hashtag)}
                className="flex min-w-0 flex-1 flex-col items-start text-left transition-colors duration-150 ease-in-out hover:text-accent"
              >
                <span className="text-[11px] uppercase tracking-[0.15em] text-text-muted">
                  {topic.category}
                </span>
                <span className="mt-1 truncate text-[15px] text-text-primary">
                  {topic.hashtag}
                </span>
              </button>
              <span className="shrink-0 text-[12px] uppercase tracking-[0.12em] text-accent">
                {String(topic.postCount).padStart(2, '0')} posts
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel label="Who to Follow" elevated>
        {suggestions.length === 0 ? (
          <p className="text-[14px] text-text-muted">
            No other operators on the channel yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {suggestions.map((user) => {
              const isFollowing = following.has(user.id)
              return (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 border border-border bg-base px-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      userId={user.id}
                      handle={user.handle}
                      size={36}
                      onClick={
                        onOpenProfile
                          ? () =>
                              onOpenProfile({
                                id: user.id,
                                handle: user.handle,
                              })
                          : undefined
                      }
                    />
                    <div className="min-w-0">
                      <MicroLabel>Operator</MicroLabel>
                      <p className="truncate text-[14px] text-accent">
                        {user.handle}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <GlowButton
                      type="button"
                      onClick={() =>
                        onMessageUser?.({ id: user.id, handle: user.handle })
                      }
                    >
                      Message
                    </GlowButton>
                    <GlowButton
                      type="button"
                      onClick={() => toggleFollow(user.id)}
                      className="shrink-0"
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </GlowButton>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
