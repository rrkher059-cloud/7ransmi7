import { TWEET_TTL_MS } from '../../shared/constants'

/** Format ISO timestamps for the HUD feed (uppercase, dense). */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'UNKNOWN'

  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ] as const

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = months[date.getUTCMonth()]
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')

  return `${day} ${month} ${hours}:${minutes}Z`
}

export function formatCharCount(current: number, max: number): string {
  return `CHAR ${String(current).padStart(3, '0')} / ${max}`
}

/** Remaining lifetime before auto-delete (24h TTL). */
export function formatExpiresIn(iso: string, now = Date.now()): string {
  const created = Date.parse(iso)
  if (Number.isNaN(created)) return 'EXPIRED'
  const remaining = created + TWEET_TTL_MS - now
  if (remaining <= 0) return 'EXPIRED'
  const mins = Math.ceil(remaining / 60_000)
  if (mins >= 60) {
    const hours = Math.ceil(remaining / 3_600_000)
    return `TTL ${String(hours).padStart(2, '0')}H`
  }
  return `TTL ${String(mins).padStart(2, '0')}M`
}

export function aggregateReactions(
  reactions: { emoji: string; userId: string }[] | undefined,
  currentUserId?: string,
): { emoji: string; count: number; mine: boolean }[] {
  const map = new Map<string, { count: number; mine: boolean }>()
  for (const reaction of reactions ?? []) {
    const entry = map.get(reaction.emoji) ?? { count: 0, mine: false }
    entry.count += 1
    if (currentUserId && reaction.userId === currentUserId) entry.mine = true
    map.set(reaction.emoji, entry)
  }
  return [...map.entries()].map(([emoji, value]) => ({
    emoji,
    count: value.count,
    mine: value.mine,
  }))
}
