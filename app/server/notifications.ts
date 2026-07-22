import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { atomicWriteJson, DEFAULT_DATA_DIR, readJsonFile } from './jsonStore.ts'

export const notificationTypeSchema = z.enum([
  'like',
  'comment',
  'repost',
  'reaction',
  'follow',
])

export const notificationSchema = z.object({
  id: z.string().uuid(),
  recipientId: z.string().uuid(),
  type: notificationTypeSchema,
  actorId: z.string().uuid(),
  actorHandle: z.string().min(2).max(33),
  tweetId: z.string().uuid().nullish(),
  body: z.string().max(280).nullish(),
  createdAt: z.string().datetime(),
  read: z.boolean().default(false),
})

const notificationStoreSchema = z.object({
  notifications: z.array(notificationSchema),
})

export type AppNotification = z.infer<typeof notificationSchema>
type NotificationStore = z.infer<typeof notificationStoreSchema>

function storePath(): string {
  return (
    process.env.NOTIFICATIONS_STORE_PATH ??
    path.join(DEFAULT_DATA_DIR, 'notifications.json')
  )
}

const emptyStore = (): NotificationStore => ({ notifications: [] })

async function readStore(): Promise<NotificationStore> {
  return readJsonFile(storePath(), emptyStore(), (raw) => {
    const parsed = notificationStoreSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error('Notifications store is corrupt or invalid.')
    }
    return parsed.data
  })
}

async function writeStore(store: NotificationStore): Promise<void> {
  await atomicWriteJson(storePath(), store)
}

export async function pushNotification(input: {
  recipientId: string
  type: AppNotification['type']
  actorId: string
  actorHandle: string
  tweetId?: string | null
  body?: string | null
}): Promise<AppNotification | null> {
  if (input.recipientId === input.actorId) return null

  const store = await readStore()
  const notification: AppNotification = {
    id: randomUUID(),
    recipientId: input.recipientId,
    type: input.type,
    actorId: input.actorId,
    actorHandle: input.actorHandle,
    tweetId: input.tweetId ?? null,
    body: input.body ?? null,
    createdAt: new Date().toISOString(),
    read: false,
  }

  const next = [notification, ...store.notifications].slice(0, 200)
  await writeStore({ notifications: next })
  return notification
}

export async function listNotificationsForUser(
  userId: string,
): Promise<AppNotification[]> {
  const store = await readStore()
  return store.notifications
    .filter((item) => item.recipientId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 60)
}

export async function markNotificationsRead(userId: string): Promise<void> {
  const store = await readStore()
  let changed = false
  const notifications = store.notifications.map((item) => {
    if (item.recipientId === userId && !item.read) {
      changed = true
      return { ...item, read: true }
    }
    return item
  })
  if (changed) await writeStore({ notifications })
}
