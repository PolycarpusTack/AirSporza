import { createHmac } from 'crypto'
import { ContractStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { writeOutboxEvent } from './outbox.js'
import { logger } from '../utils/logger.js'

type WebhookEndpoint = {
  id: string
  url: string
  secret: string
  events: string[]
  isActive: boolean
  createdAt: Date
  createdById: string | null
  tenantId: string
}

type WebhookDelivery = {
  id: string
  webhookId: string
  eventType: string
  payload: unknown
  statusCode: number | null
  attempts: number
  deliveredAt: Date | null
  error: string | null
  createdAt: Date
}

export type PublishEventType =
  | 'event.created'
  | 'event.updated'
  | 'event.deleted'
  | 'event.live.started'
  | 'event.live.ended'
  | 'techPlan.created'
  | 'techPlan.updated'
  | 'techPlan.deleted'
  | 'contract.expiring'

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

async function attemptDelivery(
  webhook: WebhookEndpoint,
  delivery: WebhookDelivery,
  payload: object
): Promise<void> {
  const body = JSON.stringify(payload)
  const signature = sign(webhook.secret, body)

  let statusCode: number | null = null
  let error: string | null = null

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Planza-Signature': signature,
        'X-Planza-Event': (payload as Record<string, string>).event,
        'User-Agent': 'SportzaPlanner/1.0',
      },
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    })
    statusCode = response.status
    if (!response.ok) {
      error = `HTTP ${statusCode}`
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Network error'
    statusCode = null
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
    logger.info('Webhook delivered', { webhookId: webhook.id, deliveryId: delivery.id, statusCode })
  } else {
    throw new Error(error ?? `HTTP ${statusCode}`)
  }
}

/**
 * Manually retry a specific failed delivery.
 * Accepts the Prisma query result (with included webhook) cast to unknown to avoid JsonValue issues.
 */
async function retryDelivery(delivery: unknown): Promise<void> {
  const d = delivery as WebhookDelivery & { webhook: WebhookEndpoint }
  const payload = d.payload as object
  await attemptDelivery(d.webhook, d, payload)
}

/**
 * Check for contracts expiring in N days and dispatch contract.expiring events.
 * Call this from a daily cron/interval.
 */
async function checkExpiringContracts(): Promise<void> {
  const thresholds = [30, 7, 1]

  for (const days of thresholds) {
    try {
      const targetDate = new Date()
      targetDate.setDate(targetDate.getDate() + days)
      const dayStart = new Date(targetDate)
      dayStart.setUTCHours(0, 0, 0, 0)
      const dayEnd = new Date(targetDate)
      dayEnd.setUTCHours(23, 59, 59, 999)

      const contracts = await prisma.contract.findMany({
        where: {
          validUntil: { gte: dayStart, lte: dayEnd },
          status: { in: [ContractStatus.valid, ContractStatus.expiring] }
        },
        include: { competition: { include: { sport: true } } },
      })

      for (const contract of contracts) {
        await prisma.$transaction(async (tx) => {
          await writeOutboxEvent(tx, {
            tenantId: contract.tenantId,
            eventType: 'contract.expiring',
            aggregateType: 'contract',
            aggregateId: String(contract.id),
            payload: {
              contractId: contract.id,
              competition: contract.competition,
              validUntil: contract.validUntil,
              daysRemaining: days,
            },
          })
        })
      }
    } catch (err) {
      logger.error('Contract expiry check failed for threshold', { days, err })
    }
  }
}

async function resumeFailedDeliveries(): Promise<void> {
  let failed: (WebhookDelivery & { webhook: WebhookEndpoint })[]
  try {
    failed = await prisma.webhookDelivery.findMany({
      where: { deliveredAt: null, attempts: { lt: 3 } },
      include: { webhook: true },
    }) as (WebhookDelivery & { webhook: WebhookEndpoint })[]
  } catch (err) {
    logger.error('Failed to query undelivered webhooks on startup', { err })
    return
  }

  if (failed.length === 0) return

  logger.info(`Resuming ${failed.length} undelivered webhook retries on startup`)

  for (const delivery of failed) {
    const payload = delivery.payload as object
    attemptDelivery(delivery.webhook, delivery, payload).catch(err => {
      logger.warn('Failed to resume delivery', { deliveryId: delivery.id, err })
    })
  }
}

export const publishService = { retryDelivery, checkExpiringContracts, resumeFailedDeliveries }
