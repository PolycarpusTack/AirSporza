import { logger } from '../utils/logger.js'

interface RateLimitEntry {
  minute: number[]
  day: number[]
}

const counters = new Map<string, RateLimitEntry>()

/**
 * Check and record a rate limit hit for an integration.
 * Returns true if the request is allowed, false if rate-limited.
 * Uses in-memory sliding window counters.
 */
export function checkRateLimit(
  integrationId: string,
  perMinute: number | null,
  perDay: number | null
): boolean {
  const now = Date.now()
  const entry = counters.get(integrationId) ?? { minute: [], day: [] }

  // Sliding window: remove expired entries
  entry.minute = entry.minute.filter(t => now - t < 60_000)
  entry.day = entry.day.filter(t => now - t < 86_400_000)

  if (perMinute && entry.minute.length >= perMinute) {
    logger.debug('Integration rate-limited (per-minute)', { integrationId, count: entry.minute.length, limit: perMinute })
    return false
  }
  if (perDay && entry.day.length >= perDay) {
    logger.debug('Integration rate-limited (per-day)', { integrationId, count: entry.day.length, limit: perDay })
    return false
  }

  entry.minute.push(now)
  entry.day.push(now)
  counters.set(integrationId, entry)
  return true
}

/**
 * Remove rate limit tracking for a deleted integration.
 */
export function clearRateLimit(integrationId: string): void {
  counters.delete(integrationId)
}
