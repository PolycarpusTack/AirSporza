import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'

export class DailyRateLimitExceededError extends Error {
  retryAt: Date

  constructor(sourceCode: string, retryAt: Date) {
    super(`Configured daily rate limit exceeded for '${sourceCode}'. Retry after ${retryAt.toISOString()}.`)
    this.name = 'DailyRateLimitExceededError'
    this.retryAt = retryAt
  }
}

type SourceRateConfig = {
  id: string
  code: string
  rateLimitPerMinute: number | null
  rateLimitPerDay: number | null
}

type AdapterRateConfig = {
  requestsPerMinute: number
  requestsPerDay: number
  burstLimit?: number
}

type AcquireResult =
  | { action: 'acquired' }
  | { action: 'wait'; waitMs: number }
  | { action: 'daily_exceeded'; retryAt: Date }

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getEffectiveLimits(source: SourceRateConfig, adapter: AdapterRateConfig) {
  return {
    requestsPerMinute: source.rateLimitPerMinute ?? adapter.requestsPerMinute ?? null,
    requestsPerDay: source.rateLimitPerDay ?? adapter.requestsPerDay ?? null,
  }
}

export async function acquireRateLimitSlot(
  source: SourceRateConfig,
  adapter: AdapterRateConfig
) {
  const limits = getEffectiveLimits(source, adapter)

  if (!limits.requestsPerMinute && !limits.requestsPerDay) {
    return
  }

  while (true) {
    const result = await prisma.$transaction(async tx => {
      const now = new Date()
      const state = await tx.importRateLimit.upsert({
        where: { sourceId: source.id },
        create: {
          sourceId: source.id,
          requestsThisMinute: 0,
          requestsThisDay: 0,
          minuteWindowStart: now,
          dayWindowStart: now,
          lastRequestAt: null,
        },
        update: {},
      })

      const minuteExpired = now.getTime() - state.minuteWindowStart.getTime() >= MINUTE_MS
      const dayExpired = now.getTime() - state.dayWindowStart.getTime() >= DAY_MS

      const minuteWindowStart = minuteExpired ? now : state.minuteWindowStart
      const dayWindowStart = dayExpired ? now : state.dayWindowStart
      const requestsThisMinute = minuteExpired ? 0 : state.requestsThisMinute
      const requestsThisDay = dayExpired ? 0 : state.requestsThisDay

      if (limits.requestsPerDay && requestsThisDay >= limits.requestsPerDay) {
        await tx.importRateLimit.update({
          where: { sourceId: source.id },
          data: {
            requestsThisMinute,
            requestsThisDay,
            minuteWindowStart,
            dayWindowStart,
          }
        })

        return {
          action: 'daily_exceeded' as const,
          retryAt: new Date(dayWindowStart.getTime() + DAY_MS),
        }
      }

      if (limits.requestsPerMinute && requestsThisMinute >= limits.requestsPerMinute) {
        await tx.importRateLimit.update({
          where: { sourceId: source.id },
          data: {
            requestsThisMinute,
            requestsThisDay,
            minuteWindowStart,
            dayWindowStart,
          }
        })

        return {
          action: 'wait' as const,
          waitMs: Math.max(minuteWindowStart.getTime() + MINUTE_MS - now.getTime(), 250),
        }
      }

      await tx.importRateLimit.update({
        where: { sourceId: source.id },
        data: {
          requestsThisMinute: requestsThisMinute + 1,
          requestsThisDay: requestsThisDay + 1,
          minuteWindowStart,
          dayWindowStart,
          lastRequestAt: now,
        }
      })

      return { action: 'acquired' as const }
    })

    if (result.action === 'acquired') {
      return
    }

    if (result.action === 'daily_exceeded') {
      throw new DailyRateLimitExceededError(source.code, result.retryAt)
    }

    logger.debug('Waiting for import source rate limit window', {
      sourceCode: source.code,
      waitMs: result.waitMs,
    })

    await sleep(result.waitMs)
  }
}
