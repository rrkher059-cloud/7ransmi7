import { useEffect, useState } from 'react'
import { loadProfileMedia } from '@/lib/profileMedia'

const MEDIA_EVENT = 'transmit-profile-media'

type UserAvatarProps = {
  userId: string
  handle: string
  size?: number
  onClick?: () => void
  className?: string
}

/** Avatar from local profile media, or handle initial fallback. */
export function UserAvatar({
  userId,
  handle,
  size = 40,
  onClick,
  className = '',
}: UserAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    () => loadProfileMedia(userId).avatarUrl,
  )

  useEffect(() => {
    function refresh(event?: Event) {
      const detail = (event as CustomEvent<{ userId?: string }> | undefined)
        ?.detail
      if (detail?.userId && detail.userId !== userId) return
      setAvatarUrl(loadProfileMedia(userId).avatarUrl)
    }
    refresh()
    window.addEventListener(MEDIA_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(MEDIA_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [userId])

  const initial =
    (handle ?? '').replace('@', '').slice(0, 1).toUpperCase() || '?'

  const inner = avatarUrl ? (
    <img
      src={avatarUrl}
      alt=""
      className="h-full w-full object-cover"
      draggable={false}
    />
  ) : (
    <span className="text-[14px] uppercase tracking-[0.08em] text-[#ff9142]">
      {initial}
    </span>
  )

  const sharedClass = `flex shrink-0 items-center justify-center overflow-hidden border border-[#4a4744] bg-[#1b1b1a] ${className}`
  const sharedStyle = {
    width: size,
    height: size,
    borderRadius: 0,
  } as const

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${sharedClass} cursor-pointer transition-colors duration-150 hover:border-[#ff9142]`}
        style={sharedStyle}
        aria-label={`Open profile ${handle}`}
      >
        {inner}
      </button>
    )
  }

  return (
    <div className={sharedClass} style={sharedStyle} aria-hidden>
      {inner}
    </div>
  )
}
