import { prisma } from '../db/prisma.js'
import {
  cascadeQueue,
  alertQueue,
  standingsQueue,
  bracketQueue,
  socketioQueue,
  webhookQueue,
} from '../services/queue.js'
import { logger } from '../utils/logger.js'

const EVENT_ROUTING: Record<string, string[]> = {
  // Event lifecycle — notify clients + external systems
  'event.created':              ['socketio', 'webhook'],
  'event.updated':              ['socketio', 'webhook'],
  'event.deleted':              ['socketio', 'webhook'],
  'event.status_changed':       ['socketio', 'webhook', 'cascade', 'standings', 'bracket'],
  // Fixture lifecycle — cascade + standings
  'fixture.status_changed':     ['cascade', 'standings', 'bracket'],
  'fixture.completed':          ['standings', 'bracket'],
  'match.score_updated':        ['cascade'],
  // Cascade results
  'cascade.recomputed':         ['alerts'],
  // Schedule lifecycle
  'schedule.published':         ['webhook'],
  'schedule.emergency_published': ['webhook'],
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
}

const QUEUE_MAP: Record<string, typeof cascadeQueue> = {
  cascade: cascadeQueue,
  alerts: alertQueue,
  standings: standingsQueue,
  bracket: bracketQueue,
  socketio: socketioQueue,
  webhook: webhookQueue,
}

/**
 * Poll unprocessed outbox events, route them to BullMQ queues,
 * and mark them as processed (or dead-letter on max retries).
 */
export async function consumeOutbox(): Promise<number> {
  const events = await prisma.$queryRaw<any[]>`
    SELECT * FROM "OutboxEvent"
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

  for (const event of events) {
    try {
      const queues = EVENT_ROUTING[event.eventType] || []
      for (const queueName of queues) {
        const queue = QUEUE_MAP[queueName]
        if (queue) {
          await queue.add(
            event.eventType,
            {
              ...event.payload,
              eventType: event.eventType,
              _outboxEventId: event.id,
              _tenantId: event.tenantId,
            },
            {
              jobId: `${event.idempotencyKey}:${queueName}`,
            }
          )
        }
      }
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      })
    } catch (err) {
      logger.error(`Outbox processing failed for ${event.id}:`, err)
      const retryCount = (event.retryCount || 0) + 1
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data:
          retryCount >= event.maxRetries
            ? { deadLetteredAt: new Date(), retryCount }
            : { retryCount, failedAt: new Date() },
      })
    }
  }

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
