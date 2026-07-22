import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { atomicWriteJson, DEFAULT_DATA_DIR, readJsonFile } from './jsonStore.ts'
import { getPublicUser } from './users.ts'
import type { PublicUser } from '../shared/schemas.ts'

const dmMessageSchema = z.object({
  id: z.string().uuid(),
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  body: z.string().min(1).max(280),
  createdAt: z.string().datetime(),
})

const dmStoreSchema = z.object({
  messages: z.array(dmMessageSchema),
})

export type DmMessage = z.infer<typeof dmMessageSchema>
type DmStore = z.infer<typeof dmStoreSchema>

export type DmConversation = {
  peer: PublicUser
  preview: string
  updatedAt: string
  messages: DmMessage[]
}

function messagesPath(): string {
  return (
    process.env.MESSAGES_STORE_PATH ??
    path.join(DEFAULT_DATA_DIR, 'messages.json')
  )
}

const emptyStore = (): DmStore => ({ messages: [] })

async function readStore(): Promise<DmStore> {
  return readJsonFile(messagesPath(), emptyStore(), (raw) => {
    const parsed = dmStoreSchema.safeParse(raw)
    if (!parsed.success) throw new Error('Messages store is corrupt or invalid.')
    return parsed.data
  })
}

function isParticipant(message: DmMessage, userId: string): boolean {
  return message.fromUserId === userId || message.toUserId === userId
}

function peerIdOf(message: DmMessage, userId: string): string {
  return message.fromUserId === userId ? message.toUserId : message.fromUserId
}

export async function listConversations(
  userId: string,
): Promise<DmConversation[]> {
  const store = await readStore()
  const mine = store.messages
    .filter((message) => isParticipant(message, userId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const byPeer = new Map<string, DmMessage[]>()
  for (const message of mine) {
    const peerId = peerIdOf(message, userId)
    const list = byPeer.get(peerId) ?? []
    list.push(message)
    byPeer.set(peerId, list)
  }

  const conversations: DmConversation[] = []
  for (const [peerId, messages] of byPeer) {
    const peer = await getPublicUser(peerId)
    if (!peer) continue
    const last = messages[messages.length - 1]
    conversations.push({
      peer,
      preview: last?.body ?? '',
      updatedAt: last?.createdAt ?? new Date(0).toISOString(),
      messages,
    })
  }

  conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return conversations
}

export async function getThread(
  userId: string,
  peerId: string,
): Promise<DmConversation | null> {
  const peer = await getPublicUser(peerId)
  if (!peer) return null

  const store = await readStore()
  const messages = store.messages
    .filter(
      (message) =>
        (message.fromUserId === userId && message.toUserId === peerId) ||
        (message.fromUserId === peerId && message.toUserId === userId),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const last = messages[messages.length - 1]
  return {
    peer,
    preview: last?.body ?? '',
    updatedAt: last?.createdAt ?? new Date(0).toISOString(),
    messages,
  }
}

/** Unique undirected DM threads across the whole store. */
export async function countMessageThreads(): Promise<number> {
  const store = await readStore()
  const pairs = new Set<string>()
  for (const message of store.messages) {
    const [a, b] =
      message.fromUserId < message.toUserId
        ? [message.fromUserId, message.toUserId]
        : [message.toUserId, message.fromUserId]
    pairs.add(`${a}:${b}`)
  }
  return pairs.size
}

export async function sendMessage(input: {
  fromUserId: string
  toUserId: string
  body: string
}): Promise<DmMessage> {
  if (input.fromUserId === input.toUserId) {
    const error = new Error('Cannot message yourself.')
    ;(error as Error & { status: number; code: string }).status = 400
    ;(error as Error & { status: number; code: string }).code = 'INVALID_PEER'
    throw error
  }

  const peer = await getPublicUser(input.toUserId)
  if (!peer) {
    const error = new Error('Recipient not found.')
    ;(error as Error & { status: number; code: string }).status = 404
    ;(error as Error & { status: number; code: string }).code = 'USER_NOT_FOUND'
    throw error
  }

  const store = await readStore()
  const message: DmMessage = {
    id: randomUUID(),
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    body: input.body.trim(),
    createdAt: new Date().toISOString(),
  }
  await atomicWriteJson(messagesPath(), {
    messages: [...store.messages, message],
  })
  return message
}
