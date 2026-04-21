import { createHmac } from 'crypto'
import { createWorker } from '../services/queue.js'
import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'

/**
 * Webhook Worker
 *
 * Processes outbox events routed to the 'webhook' queue.
 * Finds matching webhook endpoints, creates delivery records,
 * and attempts HTTP delivery. BullMQ handles retries natively.
 *
 * Idempotency: each delivery row is keyed by (webhookId, outboxEventId)
 * via a unique constraint, so retries of the same BullMQ job upsert
 * the same row rather than scanning the JSONB payload column.
 */
export function startWebhookWorker() {
  return createWorker('webhook', async (job) => {
    const { eventType, _tenantId: tenantId, _outboxEventId: outboxEventId, ...payload } = job.data as {
      eventType: string
      _tenantId: string
      _outboxEventId?: string
      [k: string]: unknown
    }

    const webhooks = await prisma.webhookEndpoint.findMany({
      where: {
        isActive: true,
        tenantId,
        OR: [
          { events: { has: eventType } },
          { events: { has: eventType.split('.')[0] + '.*' } },
        ],
      },
    })

    if (webhooks.length === 0) return { delivered: 0 }

    const envelope = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    }
    const body = JSON.stringify(envelope)

    let delivered = 0
    const errors: string[] = []

    for (const webhook of webhooks) {
      const signature = 'sha256=' + createHmac('sha256', webhook.secret).update(body, 'utf8').digest('hex')

      // Dedupe retries via (webhookId, outboxEventId) unique. For legacy
      // callers that don't supply _outboxEventId we fall back to create.
      const delivery = outboxEventId
        ? await prisma.webhookDelivery.upsert({
            where: {
              webhookId_outboxEventId: { webhookId: webhook.id, outboxEventId },
            },
            create: {
              tenantId: webhook.tenantId,
              webhookId: webhook.id,
              outboxEventId,
              eventType,
              payload: envelope as object,
              attempts: 0,
            },
            update: {}, // retries bump attempts via the update below
          })
        : await prisma.webhookDelivery.create({
            data: {
              tenantId: webhook.tenantId,
              webhookId: webhook.id,
              eventType,
              payload: envelope as object,
              attempts: 0,
            },
          })

      let statusCode: number | null = null
      let error: string | null = null

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Planza-Signature': signature,
            'X-Planza-Event': eventType,
            'User-Agent': 'Planza/1.0',
          },
          body,
          signal: AbortSignal.timeout(10_000),
        })
        statusCode = response.status
        if (!response.ok) error = `HTTP ${statusCode}`
      } catch (err) {
        error = err instanceof Error ? err.message : 'Network error'
      }

      const succeeded = statusCode !== null && statusCode >= 200 && statusCode < 300

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          statusCode,
          attempts: { increment: 1 },
          deliveredAt: succeeded ? new Date() : undefined,
          error: succeeded ? null : error,
        },
      })

      if (succeeded) {
        delivered++
      } else {
        const msg = `Webhook ${webhook.id} delivery failed: ${error}`
        logger.warn('Webhook delivery failed', { webhookId: webhook.id, deliveryId: delivery.id, error })
        errors.push(msg)
      }
    }

    // If any webhooks failed, throw so BullMQ retries
    if (errors.length > 0) {
      throw new Error(`${errors.length}/${webhooks.length} webhook(s) failed: ${errors.join('; ')}`)
    }

    return { delivered, total: webhooks.length }
  }, { concurrency: 3 })
}
