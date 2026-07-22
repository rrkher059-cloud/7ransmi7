import path from 'node:path'
import { OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../shared/constants.ts'
import {
  otpStoreSchema,
  type OtpRecord,
  type OtpStore,
} from '../shared/schemas.ts'
import { hashSecret, verifySecret } from './crypto.ts'
import { atomicWriteJson, DEFAULT_DATA_DIR, readJsonFile } from './jsonStore.ts'

function otpsPath(): string {
  return process.env.OTPS_STORE_PATH ?? path.join(DEFAULT_DATA_DIR, 'otps.json')
}

const emptyStore = (): OtpStore => ({ otps: [] })

async function readStore(): Promise<OtpStore> {
  return readJsonFile(otpsPath(), emptyStore(), (raw) => {
    const parsed = otpStoreSchema.safeParse(raw)
    if (!parsed.success) throw new Error('OTP store is corrupt or invalid.')
    return parsed.data
  })
}

async function writeStore(store: OtpStore): Promise<void> {
  await atomicWriteJson(otpsPath(), store)
}

export async function upsertOtp(email: string, code: string): Promise<void> {
  const store = await readStore()
  const normalized = email.toLowerCase()
  const record: OtpRecord = {
    email: normalized,
    codeHash: await hashSecret(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    attempts: 0,
  }
  const otps = store.otps.filter((item) => item.email !== normalized)
  otps.push(record)
  await writeStore({ otps })
}

export async function consumeOtp(
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const store = await readStore()
  const normalized = email.toLowerCase()
  const index = store.otps.findIndex((item) => item.email === normalized)

  if (index === -1) {
    return { ok: false, reason: 'No verification code found. Request a new one.' }
  }

  const record = store.otps[index]

  if (Date.now() > Date.parse(record.expiresAt)) {
    const otps = store.otps.filter((_, i) => i !== index)
    await writeStore({ otps })
    return { ok: false, reason: 'Verification code expired. Request a new one.' }
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    const otps = store.otps.filter((_, i) => i !== index)
    await writeStore({ otps })
    return { ok: false, reason: 'Too many attempts. Request a new code.' }
  }

  const valid = await verifySecret(code, record.codeHash)
  if (!valid) {
    const updated = {
      ...record,
      attempts: record.attempts + 1,
    }
    const otps = [...store.otps]
    otps[index] = updated
    await writeStore({ otps })
    return { ok: false, reason: 'Invalid verification code.' }
  }

  const otps = store.otps.filter((_, i) => i !== index)
  await writeStore({ otps })
  return { ok: true }
}
