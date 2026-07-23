import type { Tweet } from '../../shared/schemas'

export type ProfileSubTab =
  | 'posts'
  | 'reposts'
  | 'replies'
  | 'highlights'
  | 'likes'

const REPLY_PATTERN = /^@[\w]+/u

function isReply(tweet: Tweet): boolean {
  return (
    Boolean(tweet.replyToId) ||
    REPLY_PATTERN.test((tweet.body ?? '').trim())
  )
}

/** Pure filter used by ProfileView — covered by QA unit tests. */
export function filterProfileTweets(
  tweets: Tweet[],
  userId: string,
  tab: ProfileSubTab,
): Tweet[] {
  const mine = tweets.filter((tweet) => tweet.userId === userId)

  switch (tab) {
    case 'posts':
      // Originals only (reposts have their own tab).
      return mine.filter((tweet) => !tweet.repostOfId && !isReply(tweet))
    case 'reposts':
      return mine.filter((tweet) => Boolean(tweet.repostOfId))
    case 'replies':
      return mine.filter((tweet) => isReply(tweet) && !tweet.repostOfId)
    case 'highlights':
      return mine.filter(
        (tweet) => (tweet.reactions?.length ?? 0) > 0 || tweet.likes > 0,
      )
    case 'likes':
      return tweets.filter((tweet) => {
        if (Array.isArray(tweet.likedBy)) {
          return tweet.likedBy.includes(userId)
        }
        // Legacy viewer flag when likedBy is absent (self timeline).
        return Boolean(tweet.liked)
      })
    default:
      return mine
  }
}
