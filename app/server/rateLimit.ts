/** Simple in-memory sliding-window rate limiter (per key). */

type Bucket = {
  timestamps: number[]
}

const buckets = new Map<string, Bucket>()

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { timestamps: [] }
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs)

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now
    buckets.set(key, bucket)
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, windowMs - (now - oldest)),
    }
  }

  bucket.timestamps.push(now)
  buckets.set(key, bucket)
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.timestamps.length),
    retryAfterMs: 0,
  }
}

/** Trim idle buckets occasionally so the map does not grow forever. */
export function pruneRateLimitBuckets(maxAgeMs = 60 * 60 * 1000) {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < maxAgeMs)
    if (bucket.timestamps.length === 0) buckets.delete(key)
  }
}
