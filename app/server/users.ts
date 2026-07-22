import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  userStoreSchema,
  type PublicUser,
  type UserRecord,
  type UserStore,
} from '../shared/schemas.ts'
import { hashSecret, verifySecret } from './crypto.ts'
import { atomicWriteJson, DEFAULT_DATA_DIR, readJsonFile } from './jsonStore.ts'

function usersPath(): string {
  return process.env.USERS_STORE_PATH ?? path.join(DEFAULT_DATA_DIR, 'users.json')
}

const emptyStore = (): UserStore => ({ users: [] })

async function readStore(): Promise<UserStore> {
  return readJsonFile(usersPath(), emptyStore(), (raw) => {
    const parsed = userStoreSchema.safeParse(raw)
    if (!parsed.success) throw new Error('User store is corrupt or invalid.')
    return parsed.data
  })
}

function toPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    handle: user.handle,
    createdAt: user.createdAt,
  }
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const store = await readStore()
  return store.users.find((user) => user.email === email.toLowerCase()) ?? null
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const store = await readStore()
  return store.users.find((user) => user.id === id) ?? null
}

export async function findUserByHandle(handle: string): Promise<UserRecord | null> {
  const normalized = handle.startsWith('@') ? handle : `@${handle}`
  const store = await readStore()
  return (
    store.users.find(
      (user) => user.handle.toLowerCase() === normalized.toLowerCase(),
    ) ?? null
  )
}

export async function createUser(input: {
  email: string
  handle: string
  password: string
}): Promise<PublicUser> {
  const store = await readStore()
  const email = input.email.toLowerCase()

  if (store.users.some((user) => user.email === email)) {
    const error = new Error('An account with this email already exists.')
    ;(error as Error & { status: number; code: string }).status = 409
    ;(error as Error & { status: number; code: string }).code = 'EMAIL_TAKEN'
    throw error
  }

  if (
    store.users.some(
      (user) => user.handle.toLowerCase() === input.handle.toLowerCase(),
    )
  ) {
    const error = new Error('Handle is already taken.')
    ;(error as Error & { status: number; code: string }).status = 409
    ;(error as Error & { status: number; code: string }).code = 'HANDLE_TAKEN'
    throw error
  }

  const user: UserRecord = {
    id: randomUUID(),
    email,
    handle: input.handle,
    passwordHash: await hashSecret(input.password),
    createdAt: new Date().toISOString(),
  }

  await atomicWriteJson(usersPath(), { users: [...store.users, user] })
  return toPublic(user)
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = await findUserByEmail(email)
  if (!user) return null
  const ok = await verifySecret(password, user.passwordHash)
  return ok ? toPublic(user) : null
}

export async function getPublicUser(id: string): Promise<PublicUser | null> {
  const user = await findUserById(id)
  return user ? toPublic(user) : null
}

export async function listPublicUsers(
  excludeUserId?: string,
  limit = 5,
): Promise<PublicUser[]> {
  const store = await readStore()
  return store.users
    .filter((user) => !excludeUserId || user.id !== excludeUserId)
    .slice(0, limit)
    .map(toPublic)
}

/** Total registered operators. */
export async function countUsers(): Promise<number> {
  const store = await readStore()
  return store.users.length
}

export async function searchUsers(
  query: string,
  excludeUserId?: string,
  limit = 20,
): Promise<PublicUser[]> {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
  const store = await readStore()
  return store.users
    .filter((user) => !excludeUserId || user.id !== excludeUserId)
    .filter((user) => {
      if (!q) return true
      return (
        user.handle.toLowerCase().includes(q) ||
        user.handle.toLowerCase().replace(/^@/, '').includes(q) ||
        user.email.toLowerCase().includes(q)
      )
    })
    .slice(0, limit)
    .map(toPublic)
}
