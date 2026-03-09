import { Prisma } from '@prisma/client'
import { v4 as uuid } from 'uuid'

interface WriteOutboxParams {
  tenantId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  payload: unknown
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  idempotencyKey?: string
}

/**
 * Write an outbox event within an existing Prisma transaction.
 * The outbox consumer will pick it up and dispatch to BullMQ queues.
 */
export async function writeOutboxEvent(
  tx: Prisma.TransactionClient,
  params: WriteOutboxParams
) {
  return tx.outboxEvent.create({
    data: {
      tenantId: params.tenantId,
      eventType: params.eventType,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      payload: params.payload as Prisma.JsonObject,
      priority: params.priority ?? 'NORMAL',
      idempotencyKey:
        params.idempotencyKey ??
        `${params.eventType}:${params.aggregateId}:${uuid()}`,
    },
  })
}
