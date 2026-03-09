import { prisma } from '../../db/prisma.js'
import { heuristicEstimator, type CascadeEvent, type DurationEstimator } from './estimator.js'
import { logger } from '../../utils/logger.js'

const CHANGEOVER_MIN = 15
const CONFIDENCE_DECAY = 0.85

export interface CascadeResult {
  eventId: number
  estimatedStartUtc: Date
  earliestStartUtc: Date
  latestStartUtc: Date
  estDurationShortMin: number
  estDurationLongMin: number
  confidenceScore: number
  computedAt: Date
}

/**
 * Recompute cascade estimates for all events on a given court+date.
 * Uses advisory lock per court+date to prevent concurrent recomputation.
 */
export async function runCascade(
  tenantId: string,
  courtId: number,
  date: Date,
  estimator: DurationEstimator = heuristicEstimator
): Promise<CascadeResult[]> {
  const dateStr = date.toISOString().slice(0, 10)

  // Acquire advisory lock for this court+date to prevent concurrent cascade runs
  const lockKey = hashCode(`cascade:${courtId}:${dateStr}`)
  await prisma.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`)

  // Find all events on this court for this date, ordered by court position
  const events = await prisma.event.findMany({
    where: {
      tenantId,
      startDateBE: new Date(dateStr),
      sportMetadata: {
        path: ['court_id'],
        equals: courtId,
      },
    },
    include: { sport: true },
    orderBy: { id: 'asc' }, // fallback ordering; sportMetadata.order_on_court is in JSONB
  })

  // Sort by order_on_court from sportMetadata
  events.sort((a, b) => {
    const orderA = (a.sportMetadata as any)?.order_on_court ?? 999
    const orderB = (b.sportMetadata as any)?.order_on_court ?? 999
    return orderA - orderB
  })

  // Pre-load actual times from BroadcastSlots for completed events
  const completedEventIds = events
    .filter(e => e.status === 'completed' || e.status === 'live')
    .map(e => e.id)
  const actualSlots = completedEventIds.length > 0
    ? await prisma.broadcastSlot.findMany({
        where: { tenantId, eventId: { in: completedEventIds } },
        select: { eventId: true, actualStartUtc: true, actualEndUtc: true },
      })
    : []
  const actualTimesByEvent = new Map(
    actualSlots.filter(s => s.eventId != null).map(s => [s.eventId!, s])
  )

  const results: CascadeResult[] = []
  let prevEnd: { earliest: Date | null; estimated: Date | null; latest: Date | null } = {
    earliest: null,
    estimated: null,
    latest: null,
  }
  let prevConfidence = 1.0

  for (const event of events) {
    const castEvent = event as unknown as CascadeEvent
    const meta = (event.sportMetadata as any) || {}
    const status = event.status

    if (status === 'completed' || status === 'live') {
      // Use actual BroadcastSlot times if available, fall back to event start date
      const actuals = actualTimesByEvent.get(event.id)
      const startTime = actuals?.actualStartUtc
        ? new Date(actuals.actualStartUtc)
        : new Date(event.startDateBE)

      const shortMin = estimator.shortDuration(castEvent)
      const est: CascadeResult = {
        eventId: event.id,
        estimatedStartUtc: startTime,
        earliestStartUtc: startTime,
        latestStartUtc: startTime,
        estDurationShortMin: 0,
        estDurationLongMin: 0,
        confidenceScore: 1.0,
        computedAt: new Date(),
      }

      // Use actual end time if completed, otherwise estimate
      if (status === 'completed' && actuals?.actualEndUtc) {
        const actualEnd = new Date(actuals.actualEndUtc)
        prevEnd = { earliest: actualEnd, estimated: actualEnd, latest: actualEnd }
      } else {
        prevEnd = {
          earliest: addMinutes(startTime, shortMin),
          estimated: addMinutes(startTime, shortMin),
          latest: addMinutes(startTime, shortMin),
        }
      }
      prevConfidence = 1.0
      results.push(est)
      continue
    }

    const shortMin = estimator.shortDuration(castEvent)
    const longMin = estimator.longDuration(castEvent)
    const midMin = (shortMin + longMin) / 2
    const confidence = prevConfidence * CONFIDENCE_DECAY

    const notBefore = meta.not_before_utc ? new Date(meta.not_before_utc) : null

    let earliest: Date
    let estimated: Date
    let latest: Date

    if (!prevEnd.earliest) {
      // First match — use event start time
      const courtOpen = new Date(event.startDateBE)
      earliest = notBefore ? maxDate(courtOpen, notBefore) : courtOpen
      estimated = earliest
      latest = earliest
    } else {
      const changeover = CHANGEOVER_MIN * 60 * 1000
      earliest = maxDate(
        new Date(prevEnd.earliest.getTime() + changeover),
        notBefore || new Date(0)
      )
      estimated = maxDate(
        new Date(prevEnd.estimated!.getTime() + changeover),
        notBefore || new Date(0)
      )
      latest = maxDate(
        new Date(prevEnd.latest!.getTime() + changeover),
        notBefore || new Date(0)
      )
    }

    const est: CascadeResult = {
      eventId: event.id,
      estimatedStartUtc: estimated,
      earliestStartUtc: earliest,
      latestStartUtc: latest,
      estDurationShortMin: shortMin,
      estDurationLongMin: longMin,
      confidenceScore: Math.round(confidence * 100) / 100,
      computedAt: new Date(),
    }

    prevEnd = {
      earliest: addMinutes(earliest, shortMin),
      estimated: addMinutes(estimated, midMin),
      latest: addMinutes(latest, longMin),
    }
    prevConfidence = confidence
    results.push(est)
  }

  // Batch all DB writes in a single transaction
  await prisma.$transaction(async (tx) => {
    for (const est of results) {
      await tx.cascadeEstimate.upsert({
        where: { tenantId_eventId: { tenantId, eventId: est.eventId } },
        create: { tenantId, ...est, inputsUsed: {} },
        update: { ...est, inputsUsed: {} },
      })

      // Update linked BroadcastSlot estimated times
      await tx.broadcastSlot.updateMany({
        where: { tenantId, eventId: est.eventId },
        data: {
          estimatedStartUtc: est.estimatedStartUtc,
          estimatedEndUtc: addMinutes(est.estimatedStartUtc, est.estDurationLongMin || 0),
          earliestStartUtc: est.earliestStartUtc,
          latestStartUtc: est.latestStartUtc,
        },
      })
    }
  })

  return results
}

function addMinutes(date: Date, min: number): Date {
  return new Date(date.getTime() + min * 60 * 1000)
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0 // Convert to 32bit integer
  }
  return Math.abs(hash)
}
