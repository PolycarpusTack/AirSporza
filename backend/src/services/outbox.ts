import { Prisma } from '@prisma/client'
import { v4 as uuid } from 'uuid'
import { getCorrelationId } from '../utils/requestContext.js'

/**
 * D-1: when a correlation id is present in the current request context,
 * stamp it into the payload under an additive `_meta` key so it survives
 * the outbox round-trip. Payload is returned untouched when there is no
 * correlation id or when it is not a plain object (non-breaking).
 */
function withCorrelationMeta(payload: unknown): unknown {
  const correlationId = getCorrelationId()
  if (!correlationId || typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return payload
  }
  const obj = payload as Record<string, unknown>
  const existingMeta =
    typeof obj._meta === 'object' && obj._meta !== null && !Array.isArray(obj._meta)
      ? (obj._meta as Record<string, unknown>)
      : {}
  return { ...obj, _meta: { ...existingMeta, correlationId } }
}

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
      payload: withCorrelationMeta(params.payload) as Prisma.JsonObject,
      priority: params.priority ?? 'NORMAL',
      idempotencyKey:
        params.idempotencyKey ??
        `${params.eventType}:${params.aggregateId}:${uuid()}`,
    },
  })
}

/**
 * TD-13 (ADR-008): write an outbox event with a DETERMINISTIC idempotency
 * key inside an existing transaction. `OutboxEvent.idempotencyKey` is a
 * globally-unique column, so a deterministic key needs conflict-tolerant
 * insertion: `createMany` + `skipDuplicates` maps to
 * `INSERT ... ON CONFLICT DO NOTHING`. A duplicate (e.g. a retried worker
 * job re-emitting the same key) is silently skipped WITHOUT aborting the
 * surrounding transaction — a plain `create` hitting the unique constraint
 * would poison the whole tx (Postgres aborts on constraint violation, so
 * the error cannot be caught-and-continued in-tx).
 *
 * Returns a BatchPayload (unlike writeOutboxEvent, which returns the created
 * record): `count` is the only written-vs-deduped signal (1 = written,
 * 0 = key already existed).
 */
export async function writeOutboxEventDeduped(
  tx: Prisma.TransactionClient,
  params: WriteOutboxParams & { idempotencyKey: string }
) {
  return tx.outboxEvent.createMany({
    data: [
      {
        tenantId: params.tenantId,
        eventType: params.eventType,
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        payload: withCorrelationMeta(params.payload) as Prisma.JsonObject,
        priority: params.priority ?? 'NORMAL',
        idempotencyKey: params.idempotencyKey,
      },
    ],
    skipDuplicates: true,
  })
}
