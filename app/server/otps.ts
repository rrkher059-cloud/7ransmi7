import path from 'node:path'
import { OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../shared/constants.ts'
import {
  otpStoreSchema,
  type OtpRecord,
  type OtpStore,
} from '../shared/schemas.ts'
import { hashSecret, verifySecret } from './crypto.ts'
import {
  DEFAULT_DATA_DIR,
  mutateJsonFile,
  readJsonFile,
} from './jsonStore.ts'

function otpsPath(): string {
  return process.env.OTPS_STORE_PATH ?? path.join(DEFAULT_DATA_DIR, 'otps.json')
}

const emptyStore = (): OtpStore => ({ otps: [] })

function parseStore(raw: unknown): OtpStore {
  const parsed = otpStoreSchema.safeParse(raw)
  if (!parsed.success) throw new Error('OTP store is corrupt or invalid.')
  return parsed.data
}

async function readStore(): Promise<OtpStore> {
  return readJsonFile(otpsPath(), emptyStore(), parseStore)
}

export async function upsertOtp(email: string, code: string): Promise<void> {
  const codeHash = await hashSecret(code)
  await mutateJsonFile(otpsPath(), emptyStore(), parseStore, (store) => {
    const normalized = email.toLowerCase()
    const record: OtpRecord = {
      email: normalized,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      attempts: 0,
    }
    const otps = store.otps.filter((item) => item.email !== normalized)
    otps.push(record)
    return { store: { otps }, result: undefined }
  })
}

export async function consumeOtp(
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Read outside lock only to short-circuit missing; mutation is locked.
  const preview = await readStore()
  const normalized = email.toLowerCase()
  const previewIndex = preview.otps.findIndex((item) => item.email === normalized)
  if (previewIndex === -1) {
    return { ok: false, reason: 'No verification code found. Request a new one.' }
  }

  return mutateJsonFile(otpsPath(), emptyStore(), parseStore, async (store) => {
    const index = store.otps.findIndex((item) => item.email === normalized)

    if (index === -1) {
      return {
        store,
        result: {
          ok: false as const,
          reason: 'No verification code found. Request a new one.',
        },
      }
    }

    const record = store.otps[index]

    if (Date.now() > Date.parse(record.expiresAt)) {
      const otps = store.otps.filter((_, i) => i !== index)
      return {
        store: { otps },
        result: {
          ok: false as const,
          reason: 'Verification code expired. Request a new one.',
        },
      }
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      const otps = store.otps.filter((_, i) => i !== index)
      return {
        store: { otps },
        result: {
          ok: false as const,
          reason: 'Too many attempts. Request a new code.',
        },
      }
    }

    const valid = await verifySecret(code, record.codeHash)
    if (!valid) {
      const updated = {
        ...record,
        attempts: record.attempts + 1,
      }
      const otps = [...store.otps]
      otps[index] = updated
      return {
        store: { otps },
        result: { ok: false as const, reason: 'Invalid verification code.' },
      }
    }

    const otps = store.otps.filter((_, i) => i !== index)
    return { store: { otps }, result: { ok: true as const } }
  })
}
