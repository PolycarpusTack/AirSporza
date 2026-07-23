import { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { env } from '../../config/env.js'
import { beClockToUtc } from '../../utils/beClock.js'
import { writeOutboxEventDeduped } from '../outbox.js'
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
  inputsUsed: Record<string, unknown>
  computedAt: Date
}

export interface CascadeEngineOptions {
  /** Duration estimator override (tests inject; defaults to heuristicEstimator). */
  estimator?: DurationEstimator
  /**
   * TD-12 parity with the schedule preview — semantics in ADR-008 Decision 1.
   * Defaults to `env.CASCADE_PREVIEW_PARITY` (house flag pattern, cf.
   * rightsChecker): direct callers get the deployed flag value unless they
   * explicitly override.
   */
  previewParity?: boolean
}

const TIME_HH_MM = /^\d{2}:\d{2}$/

/**
 * TD-12a: chain anchor for an event. With previewParity ON, combine
 * startDateBE + startTimeBE via the shared {@link beClockToUtc}
 * derivation. A missing, blank, or malformed (non-`HH:MM`) startTimeBE
 * falls back EXPLICITLY to the date-only midnight anchor — same as
 * flag-off — rather than producing an Invalid Date (legacy rows predating
 * the `timeString` zod schema may carry arbitrary strings).
 */
function eventAnchorMs(
  startDateBE: Date,
  startTimeBE: string | null | undefined,
  previewParity: boolean
): number {
  if (previewParity && startTimeBE && TIME_HH_MM.test(startTimeBE)) {
    return beClockToUtc(startDateBE, startTimeBE).getTime()
  }
  return new Date(startDateBE).getTime()
}

/** Bucket granularity for the deterministic cascade outbox key (TD-13). */
export const CASCADE_OUTBOX_BUCKET_MIN = 5

const MS_PER_MIN = 60_000
/** `YYYY-MM-DDTHH:MM` — ISO-8601 truncated to minute precision (the bucket label). */
const ISO_MINUTE_LENGTH = 'YYYY-MM-DDTHH:MM'.length

/**
 * TD-13 (ADR-008 Decision 2): deterministic idempotency key for the
 * `cascade.recomputed` outbox event —
 * `cascade.recomputed:<tenantId>:<courtId>:<dateStr>:<computedAtBucket>`.
 *
 * Bucket = computedAt floored to 5 minutes (`YYYY-MM-DDTHH:MM`). Rationale:
 * worker retries (immediate / short-backoff) land in the same bucket and
 * dedupe via ON CONFLICT DO NOTHING + the outbox consumer's BullMQ jobId;
 * genuinely distinct recompute waves ≥5 min apart emit fresh events. A
 * retry that crosses a bucket boundary degrades to today's at-least-once
 * duplicate fan-out — never a lost event.
 *
 * tenantId is part of the key (a deliberate widening of the ADR-008 key
 * sketch): `idempotencyKey` is a GLOBAL unique column and court ids are
 * per-tenant JSONB values, so without the tenant a second tenant's event
 * for the same court+date+bucket would be silently dropped.
 */
export function cascadeRecomputedKey(
  tenantId: string,
  courtId: number,
  dateStr: string,
  at: Date
): string {
  const bucketMs = CASCADE_OUTBOX_BUCKET_MIN * MS_PER_MIN
  const bucket = new Date(Math.floor(at.getTime() / bucketMs) * bucketMs)
    .toISOString()
    .slice(0, ISO_MINUTE_LENGTH)
  return `cascade.recomputed:${tenantId}:${courtId}:${dateStr}:${bucket}`
}

/**
 * Contract (TD-14, ADR-001): every cascade run — including an empty court
 * (estimateCount 0) — emits exactly one `cascade.recomputed` record, written
 * INSIDE the engine transaction so estimates and their fan-out trigger commit
 * or roll back together.
 */
async function writeCascadeRecomputedOutbox(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; courtId: number; dateStr: string; estimateCount: number; at: Date },
) {
  const { tenantId, courtId, dateStr, estimateCount, at } = params
  await writeOutboxEventDeduped(tx, {
    tenantId,
    eventType: 'cascade.recomputed',
    aggregateType: 'Court',
    aggregateId: String(courtId),
    payload: { courtId, date: dateStr, estimateCount },
    idempotencyKey: cascadeRecomputedKey(tenantId, courtId, dateStr, at),
  })
}

/**
 * Recompute cascade estimates for all events on a given court+date.
 * Uses advisory lock per court+date to prevent concurrent recomputation.
 */
export async function runCascade(
  tenantId: string,
  courtId: number,
  date: Date,
  opts: CascadeEngineOptions = {}
): Promise<CascadeResult[]> {
  const estimator = opts.estimator ?? heuristicEstimator
  const previewParity = opts.previewParity ?? env.CASCADE_PREVIEW_PARITY
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

    if (events.length === 0) {
      // Contract: one cascade.recomputed record per run, empty court included
      // (see writeCascadeRecomputedOutbox).
      await writeCascadeRecomputedOutbox(tx, { tenantId, courtId, dateStr, estimateCount: 0, at: new Date() })
      return []
    }

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
    const nowMs = Date.now()
    const inputsByEvent = new Map<number, Record<string, unknown>>()
    const items: CascadeItem[] = events.map(event => {
      const meta = asCascadeMeta(event.sportMetadata)
      const actuals = actualTimesByEvent.get(event.id)
      const castEvent = event as unknown as CascadeEvent
      const status: CascadeItem['status'] =
        event.status === 'completed' ? 'completed' :
        event.status === 'live' ? 'live' :
        event.status === 'approved' || event.status === 'published' ? 'scheduled' : 'draft'

      // For a live match, elapsed = now - actualStartUtc. estimate() returns
      // REMAINING duration when elapsed > 0, so the cascade chain correctly
      // anchors the next event off "time left in this match" instead of
      // treating it as if it just kicked off.
      const actualStartMs = actuals?.actualStartUtc ? new Date(actuals.actualStartUtc).getTime() : null
      const elapsedMin = status === 'live' && actualStartMs != null
        ? Math.max(0, (nowMs - actualStartMs) / 60000)
        : 0
      const est = estimator.estimate(castEvent, elapsedMin > 0 ? { elapsedMin } : undefined)
      inputsByEvent.set(event.id, est.inputsUsed)

      return {
        id: event.id,
        // TD-12a: flag ON anchors at startDateBE + startTimeBE; flag OFF
        // keeps the characterized date-only (midnight UTC) anchor.
        startMs: eventAnchorMs(event.startDateBE, event.startTimeBE, previewParity),
        status,
        notBeforeMs: meta.not_before_utc ? new Date(meta.not_before_utc).getTime() : null,
        actualStartMs,
        actualEndMs: actuals?.actualEndUtc ? new Date(actuals.actualEndUtc).getTime() : null,
        shortMin: est.shortMin,
        longMin: est.longMin,
      }
    })

    const chain = computeCascadeChain(items, { previewParity })

    const computedAt = new Date()
    const results: CascadeResult[] = chain.map(c => ({
      eventId: c.id as number,
      estimatedStartUtc: new Date(c.estimatedStartMs),
      earliestStartUtc: new Date(c.earliestStartMs),
      latestStartUtc: new Date(c.latestStartMs),
      estDurationShortMin: c.estDurationShortMin,
      estDurationLongMin: c.estDurationLongMin,
      confidenceScore: c.confidenceScore,
      inputsUsed: inputsByEvent.get(c.id as number) ?? {},
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
          inputsUsed: r.inputsUsed as Prisma.InputJsonValue,
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

    // TD-14 (ADR-001): canonical fan-out record commits WITH the estimates.
    await writeCascadeRecomputedOutbox(tx, { tenantId, courtId, dateStr, estimateCount: results.length, at: computedAt })

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
