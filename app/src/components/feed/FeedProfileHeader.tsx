import { useEffect, useState } from 'react'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { loadProfileMedia } from '@/lib/profileMedia'
import type { PublicUser } from '@/lib/api'

type FeedProfileHeaderProps = {
  user: PublicUser
  onOpenProfile?: () => void
}

/** Compact self-profile strip pinned above the home feed. */
export function FeedProfileHeader({
  user,
  onOpenProfile,
}: FeedProfileHeaderProps) {
  const [bannerUrl, setBannerUrl] = useState<string | null>(
    () => loadProfileMedia(user.id).bannerUrl,
  )

  useEffect(() => {
    function refresh() {
      setBannerUrl(loadProfileMedia(user.id).bannerUrl)
    }
    refresh()
    window.addEventListener('transmit-profile-media', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('transmit-profile-media', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [user.id])

  return (
    <section
      className="overflow-hidden border border-[#4a4744] bg-[#262421]"
      style={{ borderRadius: 0 }}
      aria-label="Your profile"
    >
      <button
        type="button"
        onClick={onOpenProfile}
        className="block w-full text-left transition-colors hover:bg-[#1b1b1a]/40"
        style={{ borderRadius: 0 }}
      >
        <div
          className="relative h-20 w-full bg-[#1b1b1a]"
          style={{
            backgroundImage: bannerUrl ? `url(${bannerUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!bannerUrl ? (
            <div
              className="absolute inset-0 opacity-40"
              style={{
                background:
                  'linear-gradient(120deg, rgba(255,145,66,0.25), transparent 55%)',
              }}
            />
          ) : null}
        </div>

        <div className="relative px-4 pb-4 pt-0">
          <div className="-mt-8 flex items-end gap-3">
            <UserAvatar userId={user.id} handle={user.handle} size={64} />
            <div className="min-w-0 flex-1 pb-1">
              <MicroLabel>Operator</MicroLabel>
              <p className="truncate text-[18px] text-[#ff9142]">{user.handle}</p>
              <p className="mt-1 text-[12px] uppercase tracking-[0.12em] text-text-muted">
                Open profile
              </p>
            </div>
          </div>
        </div>
      </button>
    </section>
  )
}
