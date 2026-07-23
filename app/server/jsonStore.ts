import { randomUUID } from 'node:crypto'
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_DATA_DIR = path.resolve(__dirname, '../data')

const locks = new Map<string, Promise<unknown>>()

export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(filePath) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const next = prev.then(() => gate)
  locks.set(filePath, next)
  await prev
  try {
    return await fn()
  } finally {
    release()
    if (locks.get(filePath) === next) locks.delete(filePath)
  }
}

async function readUnlocked<T>(
  filePath: string,
  empty: T,
  parse: (raw: unknown) => T,
): Promise<T> {
  await mkdir(path.dirname(filePath), { recursive: true })
  try {
    const raw = await readFile(filePath, 'utf8')
    try {
      return parse(JSON.parse(raw))
    } catch (parseError) {
      try {
        const bakRaw = await readFile(`${filePath}.bak`, 'utf8')
        console.error(
          `[store] Corrupt ${filePath}; restored from .bak`,
          parseError,
        )
        return parse(JSON.parse(bakRaw))
      } catch {
        console.error(
          `[store] Corrupt ${filePath}; returning empty store`,
          parseError,
        )
        return empty
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return empty
    }
    throw error
  }
}

async function writeUnlocked(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  try {
    await copyFile(filePath, `${filePath}.bak`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const payload = `${JSON.stringify(data, null, 2)}\n`
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(tempPath, payload, 'utf8')
  await rename(tempPath, filePath)
}

export async function readJsonFile<T>(
  filePath: string,
  empty: T,
  parse: (raw: unknown) => T,
): Promise<T> {
  return withFileLock(filePath, async () => {
    const data = await readUnlocked(filePath, empty, parse)
    try {
      await readFile(filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await writeUnlocked(filePath, empty)
      }
    }
    return data
  })
}

export async function atomicWriteJson(
  filePath: string,
  data: unknown,
): Promise<void> {
  return withFileLock(filePath, () => writeUnlocked(filePath, data))
}

/**
 * Locked read → mutate → write helper for read-modify-write paths.
 * Set `dirty: false` to skip the write when nothing changed.
 */
export async function mutateJsonFile<T, R>(
  filePath: string,
  empty: T,
  parse: (raw: unknown) => T,
  mutate: (
    current: T,
  ) =>
    | { store: T; result: R; dirty?: boolean }
    | Promise<{ store: T; result: R; dirty?: boolean }>,
): Promise<R> {
  return withFileLock(filePath, async () => {
    const current = await readUnlocked(filePath, empty, parse)
    const { store, result, dirty = true } = await mutate(current)
    if (dirty) await writeUnlocked(filePath, store)
    return result
  })
}

/** Remove leftover `*.tmp` files from crashed writes. */
export async function cleanupStaleTempFiles(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true })
  let entries: string[]
  try {
    entries = await readdir(dataDir)
  } catch {
    return
  }
  await Promise.all(
    entries
      .filter((name) => name.endsWith('.tmp'))
      .map((name) =>
        unlink(path.join(dataDir, name)).catch(() => {
          /* ignore */
        }),
      ),
  )
}
