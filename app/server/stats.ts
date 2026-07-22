import { countFollowEdges } from './follows.ts'
import { countMessageThreads } from './messages.ts'
import { readTweets } from './store.ts'
import { countUsers } from './users.ts'

export type PlatformStats = {
  users: number
  livePosts: number
  messageThreads: number
  follows: number
}

/** Live platform totals from on-disk stores — no placeholder values. */
export async function getPlatformStats(): Promise<PlatformStats> {
  const [users, tweets, messageThreads, follows] = await Promise.all([
    countUsers(),
    readTweets(),
    countMessageThreads(),
    countFollowEdges(),
  ])

  return {
    users,
    livePosts: tweets.length,
    messageThreads,
    follows,
  }
}
