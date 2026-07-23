import { useState, type ReactNode } from 'react'
import { AiCompanionPanel } from '@/components/ai/AiCompanionPanel'
import type { AuthMode } from '@/components/auth/AuthPanel'
import DotField from '@/components/effects/DotField'
import { ExploreView } from '@/components/ExploreView'
import { HomeFeed } from '@/components/HomeFeed'
import { MessagesView } from '@/components/MessagesView'
import { NotificationsView } from '@/components/NotificationsView'
import { ProfileView } from '@/components/ProfileView'
import type { ProfilePeek } from '@/components/feed/TweetCard'
import { NAV_ITEMS, Sidebar } from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { Panel } from '@/components/ui/Panel'
import type { PrivateUser, PublicUser, Tweet } from '@/lib/api'

type HomeFeedHandlers = {
  handle: string
  tweets: Tweet[]
  currentUserId: string
  loading: boolean
  posting: boolean
  busyId: string | null
  feedError: string | null
  composerError: string | null
  onPost: (input: { body: string; imageUrl?: string }) => Promise<void>
  onReact: (tweetId: string, emoji: string) => Promise<void>
  onLike: (tweetId: string) => Promise<void>
  onComment: (tweetId: string, body: string) => Promise<void>
  onRepost: (tweetId: string) => Promise<void>
  onDelete: (tweetId: string) => Promise<void>
}

type MainLayoutProps = {
  online?: boolean
  onLogout?: () => void
  feed: HomeFeedHandlers
  profileUser?: PrivateUser | null
  onOpenAuth?: (mode?: AuthMode, reason?: string) => void
  onRequireAuth?: (reason?: string) => boolean
  onGoHome?: () => void
}

export function MainLayout({
  online = true,
  onLogout,
  feed,
  profileUser = null,
  onOpenAuth,
  onRequireAuth,
  onGoHome,
}: MainLayoutProps) {
  const [activeTab, setActiveTab] = useState(0)
  const [viewingProfile, setViewingProfile] = useState<ProfilePeek | null>(null)
  const [messageTarget, setMessageTarget] = useState<ProfilePeek | null>(null)
  const [companionOpen, setCompanionOpen] = useState(false)

  const isGuest = !profileUser
  const activeLabel = NAV_ITEMS[activeTab] ?? 'Home'

  function handlePrimaryAction() {
    if (isGuest) {
      onRequireAuth?.('post')
      return
    }
    setActiveTab(0)
    window.requestAnimationFrame(() => {
      document.getElementById('composer-uplink')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function handleTabChange(index: number, _label: string) {
    if (index < 0 || index >= NAV_ITEMS.length) return

    // Guests can browse Home + Explore; other tabs need a session.
    if (isGuest && (index === 2 || index === 3 || index === 4)) {
      const reason =
        index === 2 ? 'notifications' : index === 3 ? 'messages' : 'profile'
      onRequireAuth?.(reason)
      return
    }

    setActiveTab(index)
    if (index === 4) setViewingProfile(null)
  }

  function openProfile(profile: ProfilePeek) {
    if (isGuest && profile.id === feed.currentUserId) {
      onRequireAuth?.('profile')
      return
    }
    setViewingProfile(profile)
    setActiveTab(4)
  }

  function openMessages(profile: ProfilePeek) {
    if (isGuest) {
      onRequireAuth?.('messages')
      return
    }
    setMessageTarget(profile)
    setActiveTab(3)
  }

  const profileSubject: PublicUser | PrivateUser | null =
    viewingProfile != null
      ? profileUser?.id === viewingProfile.id
        ? profileUser
        : {
            id: viewingProfile.id,
            handle: viewingProfile.handle,
            createdAt:
              feed.tweets.find((t) => t.userId === viewingProfile.id)
                ?.createdAt ?? new Date().toISOString(),
          }
      : profileUser

  let content: ReactNode
  switch (activeTab) {
    case 1:
      content = (
        <ExploreView
          localTweets={feed.tweets}
          onOpenProfile={openProfile}
          onMessageUser={openMessages}
          onRequireAuth={() => onRequireAuth?.('follow') ?? false}
        />
      )
      break
    case 2:
      content = <NotificationsView onOpenProfile={openProfile} />
      break
    case 3:
      content = profileUser ? (
        <MessagesView
          selfHandle={feed.handle}
          selfUserId={feed.currentUserId}
          startWith={messageTarget}
          onStartConsumed={() => setMessageTarget(null)}
        />
      ) : null
      break
    case 4:
      content = profileSubject ? (
        <ProfileView
          user={profileSubject}
          tweets={feed.tweets}
          isSelf={profileSubject.id === feed.currentUserId}
          onOpenProfile={openProfile}
          onMessage={
            profileSubject.id === feed.currentUserId
              ? undefined
              : () =>
                  openMessages({
                    id: profileSubject.id,
                    handle: profileSubject.handle,
                  })
          }
          onRequireAuth={() => onRequireAuth?.('follow') ?? false}
        />
      ) : (
        <Panel label="Profile // Operator" elevated>
          <MicroLabel>Handle</MicroLabel>
          <p className="mt-1 text-[18px] text-accent">{feed.handle}</p>
          {onLogout ? (
            <div className="mt-6">
              <Button type="button" variant="primary" onClick={onLogout}>
                Log out
              </Button>
            </div>
          ) : null}
        </Panel>
      )
      break
    case 0:
    default:
      content = (
        <HomeFeed
          handle={feed.handle}
          tweets={feed.tweets}
          currentUserId={feed.currentUserId}
          loading={feed.loading}
          posting={feed.posting}
          busyId={feed.busyId}
          feedError={feed.feedError}
          composerError={feed.composerError}
          profileUser={profileUser}
          onPost={feed.onPost}
          onReact={feed.onReact}
          onLike={feed.onLike}
          onComment={feed.onComment}
          onRepost={feed.onRepost}
          onDelete={feed.onDelete}
          onOpenProfile={openProfile}
        />
      )
  }

  return (
    <div className="relative min-h-screen bg-[#1b1b1a] font-mono text-text-primary">
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

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl gap-0 md:gap-4 md:px-4 md:py-4">
        <div className="relative z-20 hidden w-56 shrink-0 overflow-visible md:block lg:w-64">
          <div className="sticky top-4 h-[calc(100vh-2rem)] overflow-visible">
            <Sidebar
              activeTab={activeTab}
              onTabChange={handleTabChange}
              onPrimaryAction={handlePrimaryAction}
              onBrandClick={onGoHome}
              handle={isGuest ? null : feed.handle}
            />
          </div>
        </div>

        <div
          className="flex min-w-0 flex-1 flex-col bg-[#262421]/95 md:border"
          style={{ border: '1px solid #4a4744' }}
        >
          <header
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ borderBottom: '1px solid #4a4744' }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onGoHome}
                className="shrink-0 text-[14px] uppercase tracking-[0.12em] text-text-primary transition-colors hover:text-[#ff9142]"
                style={{ borderRadius: 0 }}
                aria-label="7RANSMI7 home"
              >
                <span className="bg-[#ff9142] px-1 text-[#1b1b1a]">X</span>
                <span className="ml-2 hidden sm:inline">7RANSMI7</span>
              </button>
              <div className="min-w-0">
                <MicroLabel>Active tab</MicroLabel>
                <p className="truncate text-[14px] uppercase tracking-[0.15em] text-text-primary">
                  {activeLabel}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <p
                className={`text-[11px] uppercase tracking-[0.15em] ${online ? 'text-accent' : 'text-text-muted'}`}
              >
                {online ? 'Online' : 'Offline'}
              </p>
              {isGuest ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onOpenAuth?.('login')}
                  >
                    Log in
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    onClick={() => onOpenAuth?.('signup')}
                  >
                    Sign up
                  </Button>
                </>
              ) : onLogout ? (
                <Button type="button" variant="ghost" onClick={onLogout}>
                  Log out
                </Button>
              ) : null}
            </div>
          </header>

          <div
            className="flex gap-1 overflow-x-auto p-2 md:hidden"
            style={{ borderBottom: '1px solid #4a4744' }}
          >
            {NAV_ITEMS.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => handleTabChange(index, label)}
                className={`shrink-0 border px-3 py-2 text-[10px] uppercase tracking-[0.12em] transition-colors duration-150 ease-in-out ${
                  activeTab === index
                    ? 'border-[#ff9142] text-[#ff9142]'
                    : 'border-[#4a4744] text-text-muted'
                }`}
                style={{ borderRadius: 0 }}
              >
                {label}
              </button>
            ))}
          </div>

          <main className="flex flex-1 flex-col gap-6 overflow-y-auto bg-[#1b1b1a]/80 px-4 py-6">
            {content}
          </main>
        </div>

        <div className="relative z-20 hidden shrink-0 lg:block">
          <div className="sticky top-4 h-[calc(100vh-2rem)]">
            <AiCompanionPanel
              open={companionOpen}
              onToggle={() => setCompanionOpen((current) => !current)}
              signedIn={!isGuest}
              onRequireAuth={() => onRequireAuth?.('default')}
            />
          </div>
        </div>
      </div>

      {/* Mobile companion toggle — bottom sheet substitute */}
      <div className="fixed bottom-4 right-4 z-40 lg:hidden">
        {companionOpen ? (
          <div className="mb-2 max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-hidden border border-[#4a4744] bg-[#262421] shadow-none">
            <AiCompanionPanel
              open
              onToggle={() => setCompanionOpen(false)}
              signedIn={!isGuest}
              onRequireAuth={() => onRequireAuth?.('default')}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCompanionOpen(true)}
            className="border border-[#ff9142] bg-[#1b1b1a] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-[#ff9142]"
            style={{ borderRadius: 0 }}
            aria-label="Open AI companion"
          >
            ✦ AI
          </button>
        )}
      </div>
    </div>
  )
}
