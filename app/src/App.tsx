import { useCallback, useEffect, useState } from 'react'
import { AuthModal } from '@/components/auth/AuthModal'
import type { AuthMode } from '@/components/auth/AuthPanel'
import { LandingPage } from '@/components/landing/LandingPage'
import { MainLayout } from '@/components/MainLayout'
import { TWEET_TTL_MS } from '../shared/constants'
import {
  ApiClientError,
  commentTweet,
  deleteTweet,
  getMe,
  healthCheck,
  listTweets,
  likeTweet,
  logout,
  postTweet,
  reactToTweet,
  repostTweet,
  type PrivateUser,
  type Tweet,
} from '@/lib/api'

function isExpired(tweet: Tweet, now = Date.now()): boolean {
  const created = Date.parse(tweet.createdAt)
  if (Number.isNaN(created)) return true
  return now - created >= TWEET_TTL_MS
}

const AUTH_PROMPTS: Record<string, string> = {
  post: 'Sign in to post a transmission.',
  like: 'Sign in to like posts.',
  react: 'Sign in to react to posts.',
  comment: 'Sign in to leave a comment.',
  repost: 'Sign in to repost.',
  delete: 'Sign in to manage posts.',
  messages: 'Sign in to open messages.',
  notifications: 'Sign in to view notifications.',
  profile: 'Sign in to open your profile.',
  follow: 'Sign in to follow operators.',
  default: 'Sign in to continue.',
}

export default function App() {
  const [user, setUser] = useState<PrivateUser | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authPrompt, setAuthPrompt] = useState<string | null>(null)
  /** Root `/` defaults to the feed-independent landing until Explore / auth. */
  const [surface, setSurface] = useState<'landing' | 'app'>('landing')

  const openAuth = useCallback(
    (mode: AuthMode = 'login', reason: keyof typeof AUTH_PROMPTS = 'default') => {
      setAuthMode(mode)
      setAuthPrompt(AUTH_PROMPTS[reason] ?? AUTH_PROMPTS.default)
      setAuthOpen(true)
    },
    [],
  )

  const requireAuth = useCallback(
    (reason: keyof typeof AUTH_PROMPTS = 'default'): boolean => {
      if (user) return true
      openAuth('login', reason)
      return false
    },
    [openAuth, user],
  )

  const refresh = useCallback(async () => {
    try {
      const { tweets: next } = await listTweets()
      setTweets(next.filter((tweet) => !isExpired(tweet)))
      setFeedError(null)
      setOnline(true)
    } catch {
      setFeedError('Downlink failed. Is the API online?')
      setOnline(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const pingHealth = useCallback(async () => {
    const ok = await healthCheck()
    setOnline(ok)
    return ok
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await getMe()
        if (!cancelled) {
          setUser(me)
          setOnline(true)
          // Returning sessions skip the landing and open the feed.
          if (me) setSurface('app')
        }
      } catch {
        if (!cancelled) {
          setUser(null)
          setOnline(false)
        }
      } finally {
        if (!cancelled) setSessionReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!sessionReady || surface !== 'app') return
    void refresh()
    void pingHealth()
    const timer = window.setInterval(() => {
      setTweets((current) => current.filter((tweet) => !isExpired(tweet)))
      void refresh()
      void pingHealth()
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [pingHealth, refresh, sessionReady, surface])

  async function handlePost(input: { body: string; imageUrl?: string }) {
    if (!requireAuth('post')) return
    setPosting(true)
    setComposerError(null)
    try {
      const tweet = await postTweet(input)
      setTweets((current) => [
        tweet,
        ...current.filter((item) => item.id !== tweet.id),
      ])
      setOnline(true)
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : 'Uplink failed. Transmission not stored.'
      setComposerError(message)
      if (error instanceof ApiClientError && error.status === 401) {
        openAuth('login', 'post')
      }
    } finally {
      setPosting(false)
    }
  }

  async function handleReact(tweetId: string, emoji: string) {
    if (!requireAuth('react')) return
    setBusyId(tweetId)
    setFeedError(null)
    try {
      const updated = await reactToTweet(tweetId, emoji)
      setTweets((current) =>
        current.map((tweet) => (tweet.id === updated.id ? updated : tweet)),
      )
      setOnline(true)
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : 'Reaction failed.'
      setFeedError(message)
      if (error instanceof ApiClientError && error.status === 401) {
        openAuth('login', 'react')
      }
    } finally {
      setBusyId(null)
    }
  }

  async function handleLike(tweetId: string) {
    if (!requireAuth('like')) return
    setBusyId(tweetId)
    setFeedError(null)
    try {
      const updated = await likeTweet(tweetId)
      setTweets((current) =>
        current.map((tweet) => (tweet.id === updated.id ? updated : tweet)),
      )
      setOnline(true)
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : 'Like failed.'
      setFeedError(message)
      if (error instanceof ApiClientError && error.status === 401) {
        openAuth('login', 'like')
      }
    } finally {
      setBusyId(null)
    }
  }

  async function handleComment(tweetId: string, body: string) {
    if (!requireAuth('comment')) {
      throw new Error('Auth required')
    }
    setBusyId(tweetId)
    setFeedError(null)
    try {
      const updated = await commentTweet(tweetId, body)
      setTweets((current) =>
        current.map((tweet) => (tweet.id === updated.id ? updated : tweet)),
      )
      setOnline(true)
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : 'Comment failed.'
      setFeedError(message)
      if (error instanceof ApiClientError && error.status === 401) {
        openAuth('login', 'comment')
      }
      throw error
    } finally {
      setBusyId(null)
    }
  }

  async function handleRepost(tweetId: string) {
    if (!requireAuth('repost')) return
    setBusyId(tweetId)
    setFeedError(null)
    try {
      const { original, repost } = await repostTweet(tweetId)
      setTweets((current) => {
        const without = current.filter(
          (tweet) => tweet.id !== original.id && tweet.id !== repost.id,
        )
        return [repost, { ...original, reposted: true }, ...without]
      })
      setOnline(true)
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : 'Repost failed.'
      setFeedError(message)
      if (error instanceof ApiClientError && error.status === 401) {
        openAuth('login', 'repost')
      }
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(tweetId: string) {
    if (!requireAuth('delete')) return
    setBusyId(tweetId)
    setFeedError(null)
    try {
      await deleteTweet(tweetId)
      setTweets((current) => current.filter((tweet) => tweet.id !== tweetId))
      setOnline(true)
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : 'Delete failed.'
      setFeedError(message)
      if (error instanceof ApiClientError && error.status === 401) {
        openAuth('login', 'delete')
      }
    } finally {
      setBusyId(null)
    }
  }

  async function handleLogout() {
    try {
      await logout()
    } catch {
      // clear local session regardless
    }
    setUser(null)
    setSurface('landing')
  }

  function handleAuthenticated(next: PrivateUser) {
    setUser(next)
    setAuthOpen(false)
    setAuthPrompt(null)
    setOnline(true)
    setSurface('app')
    void refresh()
  }

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1b1b1a] font-mono text-[14px] text-text-muted">
        Checking session…
      </div>
    )
  }

  return (
    <>
      {surface === 'landing' ? (
        <LandingPage
          onExplore={() => setSurface('app')}
          onOpenAuth={(mode = 'signup') => openAuth(mode)}
        />
      ) : (
        <MainLayout
          online={online}
          onLogout={user ? handleLogout : undefined}
          profileUser={user}
          onOpenAuth={(mode = 'login') => openAuth(mode)}
          onRequireAuth={(reason) =>
            requireAuth((reason as keyof typeof AUTH_PROMPTS) ?? 'default')
          }
          onGoHome={() => setSurface('landing')}
          feed={{
            handle: user?.handle ?? 'Guest',
            tweets,
            currentUserId: user?.id ?? '',
            loading,
            posting,
            busyId,
            feedError,
            composerError,
            onPost: handlePost,
            onReact: handleReact,
            onLike: handleLike,
            onComment: handleComment,
            onRepost: handleRepost,
            onDelete: handleDelete,
          }}
        />
      )}
      {authOpen ? (
        <AuthModal
          mode={authMode}
          prompt={authPrompt}
          onClose={() => {
            setAuthOpen(false)
            setAuthPrompt(null)
          }}
          onAuthenticated={handleAuthenticated}
        />
      ) : null}
    </>
  )
}
