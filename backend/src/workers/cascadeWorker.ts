import { createWorker, socketioQueue } from '../services/queue.js'
import { prisma } from '../db/prisma.js'
import { runCascade, type CascadeResult } from '../services/cascade/engine.js'
import { writeOutboxEvent } from '../services/outbox.js'
import { logger } from '../utils/logger.js'
import { setTenantRLS } from '../utils/setTenantRLS.js'

/**
 * Narrow sportMetadata to the fields the cascade worker reads. Mirrors
 * engine.ts's local helper; inlined here to avoid exporting what should
 * stay engine-internal.
 */
type CourtMeta = { court_id?: number | string; [key: string]: unknown }
function courtIdFromMeta(value: unknown): number | null {
  const meta = (value && typeof value === 'object' ? value : {}) as CourtMeta
  const raw = meta.court_id
  if (raw == null) return null
  const n = typeof raw === 'string' ? Number(raw) : raw
  return Number.isFinite(n) ? Number(n) : null
}

/** Key used to dedupe court+date pairs affected by a schedule publish. */
function courtDateKey(courtId: number, date: Date): string {
  return `${courtId}:${date.toISOString().slice(0, 10)}`
}

/**
 * Fan-out broadcast to clients + downstream subsystems after a cascade run.
 * Mirrors alertWorker's pattern — outbox for canonical reactions, direct
 * socketio for live client push.
 */
async function emitCascadeOutputs(
  tenantId: string,
  courtId: number,
  dateStr: string,
  estimates: CascadeResult[],
) {
  await prisma.$transaction(async (tx) => {
    await writeOutboxEvent(tx, {
      tenantId,
      eventType: 'cascade.recomputed',
      aggregateType: 'Court',
      aggregateId: String(courtId),
      payload: { courtId, date: dateStr, estimateCount: estimates.length },
    })
  })

  await socketioQueue.add('cascade:updated', {
    eventType: 'cascade:updated',
    payload: estimates,
    namespace: '/cascade',
    room: `tenant:${tenantId}:court:${courtId}`,
    _tenantId: tenantId,
  })
}

export const cascadeWorker = createWorker(
  'cascade',
  async (job) => {
    const { tenantId, eventId, versionId } = job.data as {
      tenantId: string
      eventId?: number
      /** Set when the job originates from schedule.(emergency_)published. */
      versionId?: string
    }
    if (tenantId) await setTenantRLS(tenantId)

    // ── Path A: single-event trigger (event.status_changed, slot.status_changed,
    //    match.score_updated, fixture.status_changed). Recompute the one court
    //    this event lives on, for its date.
    if (eventId) {
      const event = await prisma.event.findUnique({ where: { id: eventId } })
      if (!event) {
        logger.warn(`Cascade job: event ${eventId} not found — skipping`)
        return { skipped: true }
      }
      const courtId = courtIdFromMeta(event.sportMetadata)
      if (!courtId) {
        logger.warn(`Cascade job: event ${eventId} has no court_id — skipping`)
        return { skipped: true }
      }
      const date = event.startDateBE
      const dateStr = date.toISOString().slice(0, 10)
      logger.info(`Cascade recompute (event): court=${courtId}, date=${dateStr}`)
      const estimates = await runCascade(tenantId, courtId, new Date(date))
      await emitCascadeOutputs(tenantId, courtId, dateStr, estimates)
      return { estimateCount: estimates.length }
    }

    // ── Path B: schedule-publish fan-out. Enumerate the published version's
    //    slots, group by (court_id, date), then cascade each unique pair. A
    //    bulk publish can touch many courts; one cascade run per court is
    //    correct because runCascade's advisory lock is court+date-scoped.
    if (versionId) {
      const slots = await prisma.broadcastSlot.findMany({
        where: { scheduleVersionId: versionId, tenantId },
        include: {
          event: { select: { id: true, startDateBE: true, sportMetadata: true } },
        },
      })

      const byCourtDate = new Map<string, { courtId: number; date: Date }>()
      for (const slot of slots) {
        if (!slot.event) continue
        const courtId = courtIdFromMeta(slot.event.sportMetadata)
        if (!courtId) continue
        const key = courtDateKey(courtId, slot.event.startDateBE)
        if (!byCourtDate.has(key)) {
          byCourtDate.set(key, { courtId, date: slot.event.startDateBE })
        }
      }

      if (byCourtDate.size === 0) {
        logger.info(`Cascade fan-out (schedule ${versionId}): no court-scoped events, skipping`)
        return { skipped: true, courts: 0 }
      }

      logger.info(`Cascade fan-out (schedule ${versionId}): ${byCourtDate.size} court+date pairs`)
      let totalEstimates = 0
      for (const { courtId, date } of byCourtDate.values()) {
        const dateStr = date.toISOString().slice(0, 10)
        const estimates = await runCascade(tenantId, courtId, new Date(date))
        await emitCascadeOutputs(tenantId, courtId, dateStr, estimates)
        totalEstimates += estimates.length
      }
      return { estimateCount: totalEstimates, courts: byCourtDate.size }
    }

    logger.warn('Cascade job missing both eventId and versionId — skipping')
    return { skipped: true }
  },
  { concurrency: 3 }
)
