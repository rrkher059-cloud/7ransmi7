import path from 'node:path'
import { z } from 'zod'
import { atomicWriteJson, DEFAULT_DATA_DIR, readJsonFile } from './jsonStore.ts'
import { getPublicUser } from './users.ts'
import type { PublicUser } from '../shared/schemas.ts'

const followEdgeSchema = z.object({
  followerId: z.string().uuid(),
  followingId: z.string().uuid(),
  createdAt: z.string().datetime(),
})

const followStoreSchema = z.object({
  follows: z.array(followEdgeSchema),
})

type FollowEdge = z.infer<typeof followEdgeSchema>
type FollowStore = z.infer<typeof followStoreSchema>

export type FollowStats = {
  followers: number
  following: number
  isFollowing: boolean
}

function followsPath(): string {
  return (
    process.env.FOLLOWS_STORE_PATH ?? path.join(DEFAULT_DATA_DIR, 'follows.json')
  )
}

const emptyStore = (): FollowStore => ({ follows: [] })

async function readStore(): Promise<FollowStore> {
  return readJsonFile(followsPath(), emptyStore(), (raw) => {
    const parsed = followStoreSchema.safeParse(raw)
    if (!parsed.success) throw new Error('Follows store is corrupt or invalid.')
    return parsed.data
  })
}

export async function getFollowStats(
  profileUserId: string,
  viewerUserId?: string,
): Promise<FollowStats> {
  const store = await readStore()
  const followers = store.follows.filter(
    (edge) => edge.followingId === profileUserId,
  ).length
  const following = store.follows.filter(
    (edge) => edge.followerId === profileUserId,
  ).length
  const isFollowing = viewerUserId
    ? store.follows.some(
        (edge) =>
          edge.followerId === viewerUserId &&
          edge.followingId === profileUserId,
      )
    : false
  return { followers, following, isFollowing }
}

export async function listFollowers(
  profileUserId: string,
): Promise<PublicUser[]> {
  const store = await readStore()
  const ids = store.follows
    .filter((edge) => edge.followingId === profileUserId)
    .map((edge) => edge.followerId)
  const users: PublicUser[] = []
  for (const id of ids) {
    const user = await getPublicUser(id)
    if (user) users.push(user)
  }
  return users
}

export async function listFollowing(
  profileUserId: string,
): Promise<PublicUser[]> {
  const ids = await listFollowingIds(profileUserId)
  const users: PublicUser[] = []
  for (const id of ids) {
    const user = await getPublicUser(id)
    if (user) users.push(user)
  }
  return users
}

/** IDs the given user follows (for feed visibility checks). */
export async function listFollowingIds(
  profileUserId: string,
): Promise<Set<string>> {
  const store = await readStore()
  return new Set(
    store.follows
      .filter((edge) => edge.followerId === profileUserId)
      .map((edge) => edge.followingId),
  )
}

/** Total follow edges on the platform. */
export async function countFollowEdges(): Promise<number> {
  const store = await readStore()
  return store.follows.length
}

/** Toggle follow. Returns next isFollowing state. */
export async function toggleFollow(
  followerId: string,
  followingId: string,
): Promise<{ isFollowing: boolean; stats: FollowStats }> {
  if (followerId === followingId) {
    const error = new Error('Cannot follow yourself.')
    ;(error as Error & { status: number; code: string }).status = 400
    ;(error as Error & { status: number; code: string }).code = 'INVALID_FOLLOW'
    throw error
  }

  const target = await getPublicUser(followingId)
  if (!target) {
    const error = new Error('User not found.')
    ;(error as Error & { status: number; code: string }).status = 404
    ;(error as Error & { status: number; code: string }).code = 'USER_NOT_FOUND'
    throw error
  }

  const store = await readStore()
  const existingIndex = store.follows.findIndex(
    (edge) =>
      edge.followerId === followerId && edge.followingId === followingId,
  )

  let nextFollows: FollowEdge[]
  let isFollowing: boolean
  if (existingIndex >= 0) {
    nextFollows = store.follows.filter((_, index) => index !== existingIndex)
    isFollowing = false
  } else {
    nextFollows = [
      ...store.follows,
      {
        followerId,
        followingId,
        createdAt: new Date().toISOString(),
      },
    ]
    isFollowing = true
  }

  await atomicWriteJson(followsPath(), { follows: nextFollows })
  const stats = await getFollowStats(followingId, followerId)
  return { isFollowing, stats }
}
