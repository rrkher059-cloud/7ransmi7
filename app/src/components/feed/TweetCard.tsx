import { useId, useMemo, useState, type FormEvent } from 'react'
import BorderGlow from '@/components/effects/BorderGlow'
import { LikeBurst } from '@/components/effects/LikeBurst'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { Button } from '@/components/ui/Button'
import { MicroLabel } from '@/components/ui/MicroLabel'
import {
  aggregateReactions,
  formatExpiresIn,
  formatTimestamp,
} from '@/lib/format'
import { REACTION_EMOJIS, TWEET_MAX_CHARS, type Tweet } from '@/lib/api'

export type ProfilePeek = {
  id: string
  handle: string
}

type TweetCardProps = {
  tweet: Tweet
  currentUserId: string
  busy?: boolean
  onReact: (tweetId: string, emoji: string) => void
  onLike: (tweetId: string) => void
  onComment: (tweetId: string, body: string) => Promise<void> | void
  onRepost: (tweetId: string) => void
  onDelete: (tweetId: string) => void
  onOpenProfile?: (profile: ProfilePeek) => void
}

export function TweetCard({
  tweet,
  currentUserId,
  busy = false,
  onReact,
  onLike,
  onComment,
  onRepost,
  onDelete,
  onOpenProfile,
}: TweetCardProps) {
  const commentId = useId()
  const [showComments, setShowComments] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [burstKey, setBurstKey] = useState(0)

  const isOwner = tweet.userId === currentUserId
  const comments = tweet.comments ?? []
  const isRepost = Boolean(tweet.repostOfId)
  const alreadyReposted = Boolean(tweet.reposted)
  // Only lock after this viewer already reposted — own posts are allowed to
  // re-share so the control stays usable in single-operator feeds.
  const repostDisabled = busy || alreadyReposted

  const grouped = useMemo(
    () => aggregateReactions(tweet.reactions, currentUserId),
    [tweet.reactions, currentUserId],
  )
  const counts = useMemo(() => {
    const map = new Map(grouped.map((item) => [item.emoji, item]))
    return map
  }, [grouped])

  function openAuthor() {
    if (!tweet.userId) return
    onOpenProfile?.({ id: tweet.userId, handle: tweet.handle })
  }

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = commentBody.trim()
    if (!body || commentBusy || busy) return
    setCommentBusy(true)
    try {
      await onComment(tweet.id, body)
      setCommentBody('')
      setShowComments(true)
    } finally {
      setCommentBusy(false)
    }
  }

  return (
    <article className="flex flex-col gap-3 border border-[#4a4744] bg-[#1b1b1a] p-4">
      {isRepost ? (
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
          Reposted from{' '}
          <span className="text-[#ff9142]">
            {tweet.repostOfHandle ?? 'unknown'}
          </span>
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <UserAvatar
            userId={tweet.userId ?? tweet.id}
            handle={tweet.handle}
            size={44}
            onClick={tweet.userId && onOpenProfile ? openAuthor : undefined}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <MicroLabel>Handle</MicroLabel>
            <button
              type="button"
              onClick={onOpenProfile ? openAuthor : undefined}
              className={`truncate text-left text-[14px] text-[#ff9142] ${
                onOpenProfile
                  ? 'cursor-pointer hover:underline'
                  : 'cursor-default'
              }`}
              style={{ borderRadius: 0 }}
            >
              {tweet.handle}
            </button>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <MicroLabel>Stamp</MicroLabel>
          <time
            dateTime={tweet.createdAt}
            className="text-[12px] uppercase tracking-[0.12em] text-text-muted"
          >
            {formatTimestamp(tweet.createdAt)}
          </time>
          <p className="text-[11px] uppercase tracking-[0.12em] text-accent">
            {formatExpiresIn(tweet.createdAt)}
          </p>
        </div>
      </div>

      {tweet.body.trim() ? (
        <div className="flex flex-col gap-2">
          <MicroLabel>Payload</MicroLabel>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.4] text-text-primary">
            {tweet.body}
          </p>
        </div>
      ) : null}

      {tweet.tags && tweet.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tweet.tags.map((tag) => (
            <span
              key={tag}
              className="border border-[#4a4744] bg-[#262421] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-text-muted"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      {tweet.imageUrl ? (
        <div className="border border-[#4a4744] bg-[#262421]">
          <img
            src={tweet.imageUrl}
            alt="Post attachment"
            className="max-h-96 w-full object-contain"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[#4a4744] pt-3">
        <MicroLabel>Engage</MicroLabel>
        <div className="flex flex-wrap gap-2">
          <BorderGlow
            className={`border-glow-button ${busy ? 'is-disabled' : ''}`}
            borderRadius={0}
            backgroundColor={tweet.liked ? '#ff9142' : '#262421'}
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
              disabled={busy}
              onClick={() => {
                if (!tweet.liked) setBurstKey((key) => key + 1)
                onLike(tweet.id)
              }}
              aria-pressed={tweet.liked}
              aria-label={tweet.liked ? 'Unlike post' : 'Like post'}
              className={`relative inline-flex min-w-[3.5rem] items-center justify-center gap-1 overflow-visible px-3 py-2 text-[12px] uppercase tracking-[0.12em] transition-colors duration-150 ease-in-out disabled:cursor-not-allowed ${
                tweet.liked ? 'text-[#1b1b1a]' : 'text-text-primary'
              }`}
            >
              <LikeBurst burstKey={burstKey} />
              <span aria-hidden>{tweet.liked ? '♥' : '♡'}</span>
              <span>{tweet.likes}</span>
            </button>
          </BorderGlow>

          <BorderGlow
            className={`border-glow-button ${busy ? 'is-disabled' : ''}`}
            borderRadius={0}
            backgroundColor={showComments ? '#ff9142' : '#262421'}
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
              disabled={busy}
              onClick={() => setShowComments((open) => !open)}
              aria-expanded={showComments}
              aria-label="Toggle comments"
              className={`inline-flex min-w-[3.5rem] items-center justify-center gap-1 px-3 py-2 text-[12px] uppercase tracking-[0.12em] transition-colors duration-150 ease-in-out disabled:cursor-not-allowed ${
                showComments ? 'text-[#1b1b1a]' : 'text-text-primary'
              }`}
            >
              <span aria-hidden>💬</span>
              <span>{comments.length}</span>
            </button>
          </BorderGlow>

          <BorderGlow
            className={`border-glow-button ${repostDisabled ? 'is-disabled' : ''}`}
            borderRadius={0}
            backgroundColor={alreadyReposted ? '#ff9142' : '#262421'}
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
              disabled={repostDisabled}
              onClick={() =>
                onRepost(
                  isRepost && tweet.repostOfId ? tweet.repostOfId : tweet.id,
                )
              }
              aria-pressed={alreadyReposted}
              aria-label={alreadyReposted ? 'Already reposted' : 'Repost'}
              className={`inline-flex min-w-[3.5rem] items-center justify-center gap-1 px-3 py-2 text-[12px] uppercase tracking-[0.12em] transition-colors duration-150 ease-in-out disabled:cursor-not-allowed ${
                alreadyReposted ? 'text-[#1b1b1a]' : 'text-text-primary'
              }`}
            >
              <span aria-hidden>↻</span>
              <span>{tweet.repostCount ?? 0}</span>
            </button>
          </BorderGlow>

          {REACTION_EMOJIS.map((emoji) => {
            const stats = counts.get(emoji)
            const mine = stats?.mine ?? false
            const count = stats?.count ?? 0
            return (
              <BorderGlow
                key={emoji}
                className={`border-glow-button ${busy ? 'is-disabled' : ''}`}
                borderRadius={0}
                backgroundColor={mine ? '#ff9142' : '#262421'}
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
                  disabled={busy}
                  onClick={() => onReact(tweet.id, emoji)}
                  aria-pressed={mine}
                  aria-label={`React with ${emoji}`}
                  className={`inline-flex min-w-[2.75rem] items-center justify-center gap-1 px-2 py-2 text-[18px] leading-none transition-colors duration-150 ease-in-out disabled:cursor-not-allowed ${
                    mine ? 'text-[#1b1b1a]' : 'text-text-primary'
                  }`}
                >
                  <span aria-hidden>{emoji}</span>
                  {count > 0 ? (
                    <span
                      className={`text-[11px] uppercase tracking-[0.12em] ${
                        mine ? 'text-[#1b1b1a]/90' : 'text-text-muted'
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              </BorderGlow>
            )
          })}
        </div>
      </div>

      {showComments ? (
        <div className="flex flex-col gap-3 border-t border-[#4a4744] pt-3">
          <MicroLabel>Comments</MicroLabel>
          {comments.length === 0 ? (
            <p className="text-[13px] text-text-muted">No comments yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {comments.map((comment) => (
                <li
                  key={comment.id}
                  className="border border-[#4a4744] bg-[#262421] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] text-[#ff9142]">{comment.handle}</p>
                    <time className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                      {formatTimestamp(comment.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-text-primary">
                    {comment.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <form className="flex flex-col gap-2" onSubmit={handleCommentSubmit}>
            <label htmlFor={commentId} className="sr-only">
              Add comment
            </label>
            <textarea
              id={commentId}
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              rows={2}
              maxLength={TWEET_MAX_CHARS}
              disabled={busy || commentBusy}
              placeholder="Add a comment…"
              className="w-full resize-y border border-[#4a4744] bg-[#262421] px-3 py-2 text-[13px] text-text-primary outline-none focus:border-[#ff9142]"
              style={{ borderRadius: 0 }}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="accent"
                disabled={
                  busy || commentBusy || commentBody.trim().length === 0
                }
              >
                {commentBusy ? 'Sending' : 'Comment'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {isOwner ? (
        <div className="flex items-center justify-between gap-3 border-t border-[#4a4744] pt-3">
          <MicroLabel>Owner</MicroLabel>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onDelete(tweet.id)}
          >
            Delete
          </Button>
        </div>
      ) : null}
    </article>
  )
}
