import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_DATA_DIR = path.resolve(__dirname, '../data')

export async function readJsonFile<T>(
  filePath: string,
  empty: T,
  parse: (raw: unknown) => T,
): Promise<T> {
  await mkdir(path.dirname(filePath), { recursive: true })
  try {
    const raw = await readFile(filePath, 'utf8')
    return parse(JSON.parse(raw))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await atomicWriteJson(filePath, empty)
      return empty
    }
    throw error
  }
}

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const payload = `${JSON.stringify(data, null, 2)}\n`
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, payload, 'utf8')
  await rename(tempPath, filePath)
}
