import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  userStoreSchema,
  type PrivateUser,
  type PublicUser,
  type UserRecord,
  type UserStore,
} from '../shared/schemas.ts'
import { DUMMY_PASSWORD_HASH, hashSecret, verifySecret } from './crypto.ts'
import {
  DEFAULT_DATA_DIR,
  mutateJsonFile,
  readJsonFile,
} from './jsonStore.ts'

function usersPath(): string {
  return process.env.USERS_STORE_PATH ?? path.join(DEFAULT_DATA_DIR, 'users.json')
}

const emptyStore = (): UserStore => ({ users: [] })

function parseStore(raw: unknown): UserStore {
  const parsed = userStoreSchema.safeParse(raw)
  if (!parsed.success) throw new Error('User store is corrupt or invalid.')
  return parsed.data
}

async function readStore(): Promise<UserStore> {
  return readJsonFile(usersPath(), emptyStore(), parseStore)
}

function toPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    handle: user.handle,
    createdAt: user.createdAt,
  }
}

function toPrivate(user: UserRecord): PrivateUser {
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
}): Promise<PrivateUser> {
  const passwordHash = await hashSecret(input.password)
  return mutateJsonFile(usersPath(), emptyStore(), parseStore, (store) => {
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
      passwordHash,
      createdAt: new Date().toISOString(),
    }

    return {
      store: { users: [...store.users, user] },
      result: toPrivate(user),
    }
  })
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<PrivateUser | null> {
  const user = await findUserByEmail(email)
  const ok = await verifySecret(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  )
  if (!user || !ok) return null
  return toPrivate(user)
}

export async function updatePassword(
  email: string,
  password: string,
): Promise<PrivateUser | null> {
  const passwordHash = await hashSecret(password)
  return mutateJsonFile(usersPath(), emptyStore(), parseStore, (store) => {
    const normalized = email.toLowerCase()
    const index = store.users.findIndex((user) => user.email === normalized)
    if (index < 0) {
      return { store, result: null, dirty: false }
    }
    const current = store.users[index]
    const updated: UserRecord = { ...current, passwordHash }
    const users = store.users.map((user, i) => (i === index ? updated : user))
    return {
      store: { users },
      result: toPrivate(updated),
    }
  })
}

export async function getPublicUser(id: string): Promise<PublicUser | null> {
  const user = await findUserById(id)
  return user ? toPublic(user) : null
}

export async function getPrivateUser(id: string): Promise<PrivateUser | null> {
  const user = await findUserById(id)
  return user ? toPrivate(user) : null
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
      const handle = user.handle.toLowerCase()
      return handle.includes(q) || handle.replace(/^@/, '').includes(q)
    })
    .slice(0, limit)
    .map(toPublic)
}
