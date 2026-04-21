import { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { heuristicEstimator, type CascadeEvent, type DurationEstimator } from './estimator.js'
import {
  CHANGEOVER_MIN,
  CONFIDENCE_DECAY,
  addMinutes,
  computeCascadeChain,
  type CascadeItem,
} from './compute.js'

// Re-export constants so callers that historically imported them from the
// engine keep working.
export { CHANGEOVER_MIN, CONFIDENCE_DECAY }

/**
 * Cascade-specific shape of Event.sportMetadata. The JSON field is untyped in
 * Prisma, so we narrow at the extraction sites instead of leaking `any`.
 * Unknown keys pass through — this is only what the cascade engine reads.
 */
type CascadeMeta = {
  order_on_court?: number
  court_id?: number | string
  not_before_utc?: string
  [key: string]: unknown
}

function asCascadeMeta(value: unknown): CascadeMeta {
  return (value && typeof value === 'object' ? value : {}) as CascadeMeta
}

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

  return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`

    // Find all events on this court for this date, ordered by court position
    const events = await tx.event.findMany({
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
      const orderA = asCascadeMeta(a.sportMetadata).order_on_court ?? 999
      const orderB = asCascadeMeta(b.sportMetadata).order_on_court ?? 999
      return orderA - orderB
    })

    if (events.length === 0) return []

    // Pre-load actual times from BroadcastSlots for completed events
    const completedEventIds = events
      .filter(e => e.status === 'completed' || e.status === 'live')
      .map(e => e.id)
    const actualSlots = completedEventIds.length > 0
      ? await tx.broadcastSlot.findMany({
          where: { tenantId, eventId: { in: completedEventIds } },
          select: { eventId: true, actualStartUtc: true, actualEndUtc: true },
        })
      : []
    const actualTimesByEvent = new Map(
      actualSlots.filter(s => s.eventId != null).map(s => [s.eventId!, s])
    )

    // Adapt Event rows to the pure CascadeItem shape, then run the shared
    // chain algorithm. Keeps engine + preview-cascade from drifting.
    const items: CascadeItem[] = events.map(event => {
      const meta = asCascadeMeta(event.sportMetadata)
      const actuals = actualTimesByEvent.get(event.id)
      const castEvent = event as unknown as CascadeEvent
      const status: CascadeItem['status'] =
        event.status === 'completed' ? 'completed' :
        event.status === 'live' ? 'live' :
        event.status === 'approved' || event.status === 'published' ? 'scheduled' : 'draft'
      return {
        id: event.id,
        startMs: new Date(event.startDateBE).getTime(),
        status,
        notBeforeMs: meta.not_before_utc ? new Date(meta.not_before_utc).getTime() : null,
        actualStartMs: actuals?.actualStartUtc ? new Date(actuals.actualStartUtc).getTime() : null,
        actualEndMs: actuals?.actualEndUtc ? new Date(actuals.actualEndUtc).getTime() : null,
        shortMin: estimator.shortDuration(castEvent),
        longMin: estimator.longDuration(castEvent),
      }
    })

    const chain = computeCascadeChain(items)

    const computedAt = new Date()
    const results: CascadeResult[] = chain.map(c => ({
      eventId: c.id as number,
      estimatedStartUtc: new Date(c.estimatedStartMs),
      earliestStartUtc: new Date(c.earliestStartMs),
      latestStartUtc: new Date(c.latestStartMs),
      estDurationShortMin: c.estDurationShortMin,
      estDurationLongMin: c.estDurationLongMin,
      confidenceScore: c.confidenceScore,
      computedAt,
    }))

    // ── Batch write: replace 2N per-event round-trips with 2 bulk statements.
    if (results.length > 0) {
      const eventIds = results.map(r => r.eventId)

      // 1. Upsert CascadeEstimate rows. Inside the advisory lock, delete+insert
      //    is equivalent to upsert and maps to createMany's bulk insert path.
      await tx.cascadeEstimate.deleteMany({
        where: { tenantId, eventId: { in: eventIds } },
      })
      await tx.cascadeEstimate.createMany({
        data: results.map(r => ({
          tenantId,
          eventId: r.eventId,
          estimatedStartUtc: r.estimatedStartUtc,
          earliestStartUtc: r.earliestStartUtc,
          latestStartUtc: r.latestStartUtc,
          estDurationShortMin: r.estDurationShortMin,
          estDurationLongMin: r.estDurationLongMin,
          confidenceScore: r.confidenceScore,
          inputsUsed: {},
          computedAt: r.computedAt,
        })),
      })

      // 2. Update linked BroadcastSlot estimated fields in a single statement
      //    via UPDATE ... FROM (VALUES ...). Each row carries its event id
      //    and four timestamps; Postgres joins on eventId.
      const valueRows = results.map(r =>
        Prisma.sql`(${r.eventId}::int, ${r.estimatedStartUtc}::timestamptz, ${addMinutes(r.estimatedStartUtc, r.estDurationLongMin || 0)}::timestamptz, ${r.earliestStartUtc}::timestamptz, ${r.latestStartUtc}::timestamptz)`
      )
      await tx.$executeRaw(Prisma.sql`
        UPDATE "BroadcastSlot" AS bs
        SET "estimatedStartUtc" = v.est_start,
            "estimatedEndUtc"   = v.est_end,
            "earliestStartUtc"  = v.earliest,
            "latestStartUtc"    = v.latest
        FROM (VALUES ${Prisma.join(valueRows)}) AS v(event_id, est_start, est_end, earliest, latest)
        WHERE bs."tenantId" = ${tenantId}::uuid AND bs."eventId" = v.event_id
      `)
    }

    return results
  })
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
