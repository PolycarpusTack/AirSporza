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
 */
export function startWebhookWorker() {
  return createWorker('webhook', async (job) => {
    const { eventType, payload, _tenantId: tenantId } = job.data

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

      // Upsert delivery record to avoid duplicates on BullMQ retry
      const existingDelivery = await prisma.webhookDelivery.findFirst({
        where: {
          webhookId: webhook.id,
          eventType,
          payload: { path: ['data'], equals: payload as any },
        },
        orderBy: { createdAt: 'desc' },
      })

      const delivery = existingDelivery
        ? existingDelivery
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
