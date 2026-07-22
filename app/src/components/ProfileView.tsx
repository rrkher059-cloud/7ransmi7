import { useEffect, useMemo, useRef, useState } from 'react'
import BorderGlow from '@/components/effects/BorderGlow'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { formatTimestamp } from '@/lib/format'
import {
  filterProfileTweets,
  type ProfileSubTab,
} from '@/lib/profileFilters'
import {
  loadProfileMedia,
  readImageAsDataUrl,
  saveProfileMedia,
} from '@/lib/profileMedia'
import {
  ApiClientError,
  fetchFollowers,
  fetchFollowing,
  fetchFollowStats,
  fetchUserTweets,
  toggleFollowUser,
  type PublicUser,
  type Tweet,
} from '@/lib/api'

const SUB_TABS: { id: ProfileSubTab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'reposts', label: 'Reposts' },
  { id: 'replies', label: 'Replies' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'likes', label: 'Likes' },
]

type ProfileViewProps = {
  user: PublicUser
  tweets: Tweet[]
  isSelf?: boolean
  onMessage?: () => void
  onOpenProfile?: (profile: { id: string; handle: string }) => void
  onRequireAuth?: () => boolean
}

export function ProfileView({
  user,
  tweets,
  isSelf = true,
  onMessage,
  onOpenProfile,
  onRequireAuth,
}: ProfileViewProps) {
  const [subTab, setSubTab] = useState<ProfileSubTab>('posts')
  const [editing, setEditing] = useState(false)
  const [bio, setBio] = useState(
    'Operator on the Kuiper relay. Logging mission bursts and #signalops chatter.',
  )
  const [draftBio, setDraftBio] = useState(bio)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [listKind, setListKind] = useState<'followers' | 'following' | null>(
    null,
  )
  const [listUsers, setListUsers] = useState<PublicUser[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [timeline, setTimeline] = useState<Tweet[]>(tweets)
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    () => loadProfileMedia(user.id).avatarUrl,
  )
  const [bannerUrl, setBannerUrl] = useState<string | null>(
    () => loadProfileMedia(user.id).bannerUrl,
  )
  const mediaReady = useRef(false)

  const bannerInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const stored = loadProfileMedia(user.id)
    setAvatarUrl(stored.avatarUrl)
    setBannerUrl(stored.bannerUrl)
    mediaReady.current = false
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    setTimelineLoading(true)
    void fetchUserTweets(user.id)
      .then((next) => {
        if (cancelled) return
        setTimeline(next)
      })
      .catch(() => {
        if (cancelled) return
        // Fall back to the home-feed buffer if the profile endpoint fails.
        setTimeline(tweets.filter((tweet) => tweet.userId === user.id))
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user.id, tweets])

  useEffect(() => {
    let cancelled = false
    void fetchFollowStats(user.id)
      .then((stats) => {
        if (cancelled) return
        setFollowers(stats.followers)
        setFollowing(stats.following)
        setIsFollowing(stats.isFollowing)
      })
      .catch(() => {
        if (cancelled) return
        setFollowers(0)
        setFollowing(0)
        setIsFollowing(false)
      })
    return () => {
      cancelled = true
    }
  }, [user.id])

  useEffect(() => {
    if (!mediaReady.current) {
      mediaReady.current = true
      return
    }
    if (avatarUrl?.startsWith('blob:') || bannerUrl?.startsWith('blob:')) {
      return
    }
    saveProfileMedia(user.id, { avatarUrl, bannerUrl })
  }, [user.id, avatarUrl, bannerUrl])

  async function handleFollowToggle() {
    if (isSelf || followBusy) return
    if (onRequireAuth && !onRequireAuth()) return
    setFollowBusy(true)
    try {
      const result = await toggleFollowUser(user.id)
      setIsFollowing(result.isFollowing)
      setFollowers(result.stats.followers)
      setFollowing(result.stats.following)
    } catch (error) {
      console.error(error instanceof ApiClientError ? error.message : error)
    } finally {
      setFollowBusy(false)
    }
  }

  async function openList(kind: 'followers' | 'following') {
    setListKind(kind)
    setListLoading(true)
    try {
      const users =
        kind === 'followers'
          ? await fetchFollowers(user.id)
          : await fetchFollowing(user.id)
      setListUsers(users)
    } catch {
      setListUsers([])
    } finally {
      setListLoading(false)
    }
  }

  const filtered = useMemo(
    () => filterProfileTweets(timeline, user.id, subTab),
    [timeline, user.id, subTab],
  )

  const initial = user.handle.replace('@', '').slice(0, 1).toUpperCase() || 'X'

  function saveProfile() {
    setBio(draftBio.trim() || bio)
    setEditing(false)
  }

  async function handleImagePick(
    file: File | undefined,
    kind: 'avatar' | 'banner',
  ) {
    if (!file) return
    // Instant preview via object URL, then persist as data URL.
    const objectUrl = URL.createObjectURL(file)
    if (kind === 'avatar') setAvatarUrl(objectUrl)
    else setBannerUrl(objectUrl)

    try {
      const dataUrl = await readImageAsDataUrl(file)
      if (kind === 'avatar') {
        setAvatarUrl(dataUrl)
      } else {
        setBannerUrl(dataUrl)
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  return (
    <div className="flex flex-col gap-0 font-mono text-text-primary">
      {isSelf ? (
        <>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload banner image"
            onChange={(event) => {
              void handleImagePick(event.target.files?.[0], 'banner')
              event.target.value = ''
            }}
          />
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload avatar image"
            onChange={(event) => {
              void handleImagePick(event.target.files?.[0], 'avatar')
              event.target.value = ''
            }}
          />
        </>
      ) : null}

      {/* Banner + avatar */}
      <div className="relative">
        <div
          className="relative h-36 w-full overflow-hidden border border-[#4a4744] bg-[#262421]"
          style={{
            borderRadius: 0,
            backgroundImage: bannerUrl
              ? `url(${bannerUrl})`
              : 'linear-gradient(135deg, #262421 0%, #1b1b1a 45%, #ff914233 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {isSelf ? (
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              className="absolute inset-0 z-0 cursor-pointer"
              aria-label="Change banner image"
            />
          ) : null}
          {isSelf ? (
            <span className="pointer-events-none absolute right-3 top-3 z-10 border border-[#4a4744] bg-[#1b1b1a]/90 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-[#ff9142]">
              Change banner
            </span>
          ) : null}
        </div>

        {isSelf ? (
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="absolute bottom-0 left-4 z-20 flex h-20 w-20 -translate-y-1/2 items-center justify-center overflow-hidden border border-[#4a4744] bg-[#1b1b1a] text-[28px] text-[#ff9142]"
            style={{ borderRadius: 0 }}
            aria-label="Change avatar image"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </button>
        ) : (
          <div
            className="absolute bottom-0 left-4 z-20 flex h-20 w-20 -translate-y-1/2 items-center justify-center overflow-hidden border border-[#4a4744] bg-[#1b1b1a] text-[28px] text-[#ff9142]"
            style={{ borderRadius: 0 }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </div>
        )}
      </div>

      <div className="relative z-0 border border-t-0 border-[#4a4744] bg-[#262421] px-4 pb-4 pt-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <MicroLabel>Operator</MicroLabel>
            <h1 className="text-[22px] uppercase tracking-[0.12em] text-text-primary">
              {user.handle}
            </h1>
          </div>
          {isSelf ? (
            <BorderGlow
              className="border-glow-button"
              borderRadius={0}
              backgroundColor="#1b1b1a"
              glowColor="24 100 63"
              glowRadius={24}
              glowIntensity={1.15}
              edgeSensitivity={22}
              coneSpread={28}
              fillOpacity={0.4}
              colors={['#ff9142', '#ffb06b', '#eae7e1']}
              animated={false}
            >
              <button
                type="button"
                onClick={() => {
                  setDraftBio(bio)
                  setEditing((value) => !value)
                }}
                className="inline-flex items-center justify-center border border-[#ff9142] px-4 py-2 text-[12px] uppercase tracking-[0.15em] text-[#ff9142] transition-colors duration-150 ease-in-out hover:bg-[#ff9142] hover:text-[#1b1b1a]"
                style={{ borderRadius: 0 }}
              >
                {editing ? 'Cancel' : 'Edit Profile'}
              </button>
            </BorderGlow>
          ) : (
            <div className="flex flex-wrap gap-2">
              <BorderGlow
                className="border-glow-button"
                borderRadius={0}
                backgroundColor={isFollowing ? '#1b1b1a' : '#ff9142'}
                glowColor={isFollowing ? '24 100 63' : '205 28 78'}
                glowRadius={24}
                glowIntensity={1.35}
                edgeSensitivity={22}
                coneSpread={28}
                fillOpacity={0.4}
                colors={
                  isFollowing
                    ? ['#ff9142', '#ffb06b', '#eae7e1']
                    : ['#d7e4ef', '#eae7e1', '#8fadc4']
                }
                animated={false}
              >
                <button
                  type="button"
                  disabled={followBusy}
                  onClick={() => {
                    void handleFollowToggle()
                  }}
                  className={`inline-flex items-center justify-center border border-[#ff9142] px-4 py-2 text-[12px] uppercase tracking-[0.15em] disabled:opacity-50 ${
                    isFollowing ? 'text-[#ff9142]' : 'text-[#1b1b1a]'
                  }`}
                  style={{ borderRadius: 0 }}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              </BorderGlow>
              {onMessage ? (
                <BorderGlow
                  className="border-glow-button"
                  borderRadius={0}
                  backgroundColor="#ff9142"
                  glowColor="205 28 78"
                  glowRadius={24}
                  glowIntensity={1.35}
                  edgeSensitivity={22}
                  coneSpread={28}
                  fillOpacity={0.4}
                  colors={['#d7e4ef', '#eae7e1', '#8fadc4']}
                  animated={false}
                >
                  <button
                    type="button"
                    onClick={onMessage}
                    className="inline-flex items-center justify-center px-4 py-2 text-[12px] uppercase tracking-[0.15em] text-[#1b1b1a]"
                    style={{ borderRadius: 0 }}
                  >
                    Message
                  </button>
                </BorderGlow>
              ) : null}
            </div>
          )}
        </div>

        {isSelf && editing ? (
          <div className="mt-4 flex flex-col gap-2">
            <MicroLabel>Bio</MicroLabel>
            <textarea
              value={draftBio}
              onChange={(event) => setDraftBio(event.target.value)}
              rows={3}
              maxLength={160}
              className="w-full border border-[#4a4744] bg-[#1b1b1a] px-3 py-2 text-[14px] text-text-primary outline-none focus:border-[#ff9142]"
              style={{ borderRadius: 0 }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="border border-[#4a4744] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-[#c4c4c4] hover:border-[#ff9142] hover:text-[#ff9142]"
                style={{ borderRadius: 0 }}
              >
                Upload avatar
              </button>
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="border border-[#4a4744] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-[#c4c4c4] hover:border-[#ff9142] hover:text-[#ff9142]"
                style={{ borderRadius: 0 }}
              >
                Upload banner
              </button>
              <BorderGlow
                className="border-glow-button"
                borderRadius={0}
                backgroundColor="#ff9142"
                glowColor="205 28 78"
                glowRadius={24}
                glowIntensity={1.4}
                edgeSensitivity={20}
                coneSpread={30}
                fillOpacity={0.45}
                colors={['#d7e4ef', '#eae7e1', '#8fadc4']}
                animated={false}
              >
                <button
                  type="button"
                  onClick={saveProfile}
                  className="inline-flex items-center justify-center px-4 py-2 text-[12px] uppercase tracking-[0.15em] text-[#1b1b1a]"
                  style={{ borderRadius: 0 }}
                >
                  Save
                </button>
              </BorderGlow>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-[14px] leading-[1.4] text-text-primary">{bio}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-4 text-[12px] uppercase tracking-[0.12em]">
          <div>
            <MicroLabel>Joined</MicroLabel>
            <p className="text-text-muted">{formatTimestamp(user.createdAt)}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void openList('followers')
            }}
            className="text-left transition-colors hover:text-[#ff9142]"
          >
            <MicroLabel>Followers</MicroLabel>
            <p className="text-[#ff9142]">{followers}</p>
          </button>
          <button
            type="button"
            onClick={() => {
              void openList('following')
            }}
            className="text-left transition-colors hover:text-[#ff9142]"
          >
            <MicroLabel>Following</MicroLabel>
            <p className="text-[#ff9142]">{following}</p>
          </button>
        </div>
      </div>

      {listKind ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={listKind}
          onClick={() => setListKind(null)}
        >
          <div
            className="max-h-[70vh] w-full max-w-md overflow-hidden border border-[#4a4744] bg-[#262421]"
            style={{ borderRadius: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b border-[#4a4744] px-4 py-3"
            >
              <MicroLabel>
                {listKind === 'followers' ? 'Followers' : 'Following'}
              </MicroLabel>
              <button
                type="button"
                onClick={() => setListKind(null)}
                className="text-[11px] uppercase tracking-[0.12em] text-[#ff9142]"
              >
                Close
              </button>
            </div>
            <ul className="max-h-[55vh] overflow-y-auto p-3">
              {listLoading ? (
                <li className="px-2 py-3 text-[13px] text-text-muted">
                  Loading…
                </li>
              ) : listUsers.length === 0 ? (
                <li className="px-2 py-3 text-[13px] text-text-muted">
                  No operators in this list yet.
                </li>
              ) : (
                listUsers.map((entry) => (
                  <li key={entry.id} className="border-b border-[#4a4744] py-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-1 text-left hover:bg-[#1b1b1a]"
                      onClick={() => {
                        setListKind(null)
                        onOpenProfile?.({
                          id: entry.id,
                          handle: entry.handle,
                        })
                      }}
                    >
                      <UserAvatar
                        userId={entry.id}
                        handle={entry.handle}
                        size={36}
                      />
                      <span className="text-[14px] text-[#ff9142]">
                        {entry.handle}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      <div
        className="flex gap-0 overflow-x-auto border border-t-0 border-[#4a4744] bg-[#1b1b1a]"
        style={{ borderBottom: '1px solid #4a4744' }}
        role="tablist"
        aria-label="Profile sections"
      >
        {SUB_TABS.map((tab) => {
          const active = subTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(tab.id)}
              className={`shrink-0 border-b-2 px-4 py-3 text-[12px] uppercase tracking-[0.15em] transition-colors duration-150 ease-in-out ${
                active
                  ? 'border-[#ff9142] text-[#ff9142]'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
              style={{ borderRadius: 0 }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="border border-t-0 border-[#4a4744] bg-[#262421] p-4">
        <MicroLabel>
          {`${subTab} // ${String(filtered.length).padStart(2, '0')} items`}
        </MicroLabel>
        {timelineLoading ? (
          <p className="mt-3 text-[14px] text-text-muted">Loading timeline…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-3 text-[14px] text-text-muted">
            No {subTab} in this buffer yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {filtered.map((tweet) => (
              <li
                key={tweet.id}
                className="border border-[#4a4744] bg-[#1b1b1a] px-3 py-3"
                style={{ borderRadius: 0 }}
              >
                {tweet.repostOfId ? (
                  <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-text-muted">
                    Reposted from{' '}
                    <span className="text-[#ff9142]">
                      {tweet.repostOfHandle ?? 'unknown'}
                    </span>
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] text-[#ff9142]">{tweet.handle}</p>
                  <time className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                    {formatTimestamp(tweet.createdAt)}
                  </time>
                </div>
                {tweet.body.trim() ? (
                  <p className="mt-2 whitespace-pre-wrap text-[14px] leading-[1.4] text-text-primary">
                    {tweet.body}
                  </p>
                ) : null}
                {tweet.imageUrl ? (
                  <img
                    src={tweet.imageUrl}
                    alt="Post attachment"
                    className="mt-2 max-h-64 w-full border border-[#4a4744] object-contain"
                  />
                ) : null}
                {(tweet.comments?.length ?? 0) > 0 ? (
                  <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-text-muted">
                    {tweet.comments?.length} comment
                    {(tweet.comments?.length ?? 0) === 1 ? '' : 's'}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
