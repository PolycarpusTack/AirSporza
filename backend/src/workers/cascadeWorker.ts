import { createWorker, socketioQueue } from '../services/queue.js'
import { prisma } from '../db/prisma.js'
import { runCascade } from '../services/cascade/engine.js'
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

export const cascadeWorker = createWorker(
  'cascade',
  async (job) => {
    const { tenantId, eventId } = job.data as { tenantId: string; eventId: number }
    if (tenantId) await setTenantRLS(tenantId)
    if (!eventId) {
      logger.warn('Cascade job missing eventId — skipping')
      return { skipped: true }
    }

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
    logger.info(`Cascade recompute: court=${courtId}, date=${dateStr}`)

    const estimates = await runCascade(tenantId, courtId, new Date(date))
    logger.info(`Cascade complete: ${estimates.length} estimates updated`)

    // ── Fan-out ──────────────────────────────────────────────────────────
    // Two separate paths, mirroring alertWorker's pattern:
    //
    // 1. Outbox `cascade.recomputed` → alertWorker (which reads courtId from
    //    the payload to scope its broadcast-slot query). This is the
    //    canonical event-sourced trail; any future consumer that wants to
    //    react to cascade completions (metrics, audit, standings refresh)
    //    plugs in via EVENT_ROUTING.
    //
    // 2. Direct socketio enqueue → `/cascade` namespace, `cascade:updated`
    //    event on the court room. Bypasses the outbox so the emit event
    //    name (cascade:updated, consumed by useCascade.ts) stays separate
    //    from the canonical outbox event name (cascade.recomputed) without
    //    cross-wiring the routing map.
    await prisma.$transaction(async (tx) => {
      await writeOutboxEvent(tx, {
        tenantId,
        eventType: 'cascade.recomputed',
        aggregateType: 'Court',
        aggregateId: String(courtId),
        payload: {
          courtId,
          date: dateStr,
          estimateCount: estimates.length,
        },
      })
    })

    await socketioQueue.add('cascade:updated', {
      eventType: 'cascade:updated',
      payload: estimates,
      namespace: '/cascade',
      room: `tenant:${tenantId}:court:${courtId}`,
      _tenantId: tenantId,
    })

    return { estimateCount: estimates.length }
  },
  { concurrency: 3 }
)
