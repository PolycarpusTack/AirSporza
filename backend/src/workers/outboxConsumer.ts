import { prisma } from '../db/prisma.js'
import {
  cascadeQueue,
  alertQueue,
  standingsQueue,
  bracketQueue,
  socketioQueue,
  webhookQueue,
  integrationQueue,
} from '../services/queue.js'
import { logger } from '../utils/logger.js'

const EVENT_ROUTING: Record<string, string[]> = {
  // Event lifecycle — notify clients + external systems
  'event.created':              ['socketio', 'webhook'],
  'event.updated':              ['socketio', 'webhook'],
  'event.deleted':              ['socketio', 'webhook'],
  'event.status_changed':       ['socketio', 'webhook', 'cascade', 'standings', 'bracket', 'integration'],
  // Fixture lifecycle — cascade + standings
  'fixture.status_changed':     ['cascade', 'standings', 'bracket'],
  'fixture.completed':          ['standings', 'bracket'],
  'match.score_updated':        ['cascade'],
  // Cascade results
  'cascade.recomputed':         ['alerts'],
  // Schedule lifecycle — publishing can shift many events at once, so also
  // trigger a cascade fan-out (cascadeWorker handles the scheduleVersionId
  // path by enumerating affected courts).
  'schedule.published':         ['webhook', 'integration', 'cascade'],
  'schedule.emergency_published': ['webhook', 'cascade'],
  // Channel switches
  'channel_switch.confirmed':   ['socketio', 'webhook'],
  'channel_switch.created':     ['socketio'],
  // BroadcastSlot lifecycle
  'slot.created':               ['socketio'],
  'slot.updated':               ['socketio'],
  'slot.status_changed':        ['socketio', 'cascade'],
  // TechPlan lifecycle
  'techPlan.created':           ['socketio', 'webhook'],
  'techPlan.updated':           ['socketio', 'webhook'],
  'techPlan.deleted':           ['socketio', 'webhook'],
  // Contract lifecycle — notify clients + external systems (rights affect scheduling)
  'contract.created':           ['socketio', 'webhook'],
  'contract.updated':           ['socketio', 'webhook'],
  // Settings lifecycle — notify other admin sessions (internal only, no webhook)
  'setting.updated':            ['socketio'],
}

const QUEUE_MAP: Record<string, typeof cascadeQueue> = {
  cascade: cascadeQueue,
  alerts: alertQueue,
  standings: standingsQueue,
  bracket: bracketQueue,
  socketio: socketioQueue,
  webhook: webhookQueue,
  integration: integrationQueue,
}

interface OutboxRow {
  id: string
  tenantId: string
  eventType: string
  payload: Record<string, unknown>
  idempotencyKey: string
  retryCount: number
  maxRetries: number
}

/**
 * Poll unprocessed outbox events, route them to BullMQ queues,
 * and mark them as processed (or dead-letter on max retries).
 *
 * The Redis enqueue runs OUTSIDE the PG transaction that selected the rows.
 * We rely on BullMQ's jobId idempotency (`${idempotencyKey}:${queueName}`)
 * to guard against a concurrent consumer re-picking up a row in the window
 * between the select-commit and the mark-processed update. Holding a PG
 * lock across Redis I/O caused tail latency to bloat when queues were
 * backpressured; this split caps each lock to two short statements.
 */
export async function consumeOutbox(): Promise<number> {
  // Phase 1 — reserve a batch. `FOR UPDATE SKIP LOCKED` inside a short
  // transaction means other consumer replicas skip these rows; the lock
  // is released on commit, after which BullMQ's jobId dedup protects us.
  const events = await prisma.$transaction(async (tx) => {
    return await tx.$queryRaw<OutboxRow[]>`
      SELECT id, "tenantId", "eventType", payload, "idempotencyKey", "retryCount", "maxRetries"
      FROM "OutboxEvent"
      WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL
      ORDER BY
        CASE priority
          WHEN 'URGENT' THEN 0
          WHEN 'HIGH' THEN 1
          WHEN 'NORMAL' THEN 2
          WHEN 'LOW' THEN 3
        END,
        "createdAt" ASC
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    `
  })

  if (events.length === 0) return 0

  // Phase 2 — enqueue to BullMQ outside any PG transaction. Per-event
  // parallelization keeps Redis latency off the critical path.
  const succeededIds: string[] = []
  const failures: { id: string; nextRetry: number; maxRetries: number }[] = []

  await Promise.all(
    events.map(async (event) => {
      try {
        const queueNames = EVENT_ROUTING[event.eventType] || []
        await Promise.all(
          queueNames.map(async (queueName) => {
            const queue = QUEUE_MAP[queueName]
            if (!queue) return
            await queue.add(
              event.eventType,
              {
                ...event.payload,
                eventType: event.eventType,
                _outboxEventId: event.id,
                _tenantId: event.tenantId,
              },
              { jobId: `${event.idempotencyKey}:${queueName}` }
            )
          })
        )
        succeededIds.push(event.id)
      } catch (err) {
        logger.error(`Outbox processing failed for ${event.id}:`, err)
        failures.push({
          id: event.id,
          nextRetry: (event.retryCount || 0) + 1,
          maxRetries: event.maxRetries,
        })
      }
    })
  )

  // Phase 3 — mark processed / failed in a final short transaction.
  await prisma.$transaction(async (tx) => {
    if (succeededIds.length > 0) {
      await tx.outboxEvent.updateMany({
        where: { id: { in: succeededIds } },
        data: { processedAt: new Date() },
      })
    }
    for (const f of failures) {
      await tx.outboxEvent.update({
        where: { id: f.id },
        data:
          f.nextRetry >= f.maxRetries
            ? { deadLetteredAt: new Date(), retryCount: f.nextRetry }
            : { retryCount: f.nextRetry, failedAt: new Date() },
      })
    }
  })

  return events.length
}

/**
 * Start the outbox consumer polling loop.
 * Returns the interval handle for cleanup.
 */
export function startOutboxConsumer(intervalMs = 1000): NodeJS.Timeout {
  logger.info(`Outbox consumer started (polling every ${intervalMs}ms)`)
  return setInterval(async () => {
    try {
      await consumeOutbox()
    } catch (err) {
      logger.error('Outbox consumer error:', err)
    }
  }, intervalMs)
}
