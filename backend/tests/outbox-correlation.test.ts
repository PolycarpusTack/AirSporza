import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'

vi.mock('../src/db/prisma.js', () => {
  const tx = {
    $queryRaw: vi.fn(),
    outboxEvent: { updateMany: vi.fn(), update: vi.fn() },
  }
  return {
    prisma: {
      $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
      $disconnect: vi.fn(),
      _tx: tx,
    },
  }
})

vi.mock('../src/services/queue.js', () => {
  const q = () => ({ add: vi.fn(), close: vi.fn() })
  return {
    createQueue: vi.fn(q),
    createWorker: vi.fn((_name: string, processor: unknown) => ({ processor })),
    cascadeQueue: q(),
    alertQueue: q(),
    standingsQueue: q(),
    bracketQueue: q(),
    socketioQueue: q(),
    webhookQueue: q(),
    integrationQueue: q(),
    closeQueues: vi.fn(),
  }
})

import { prisma } from '../src/db/prisma.js'
import { socketioQueue, webhookQueue } from '../src/services/queue.js'
import { writeOutboxEvent } from '../src/services/outbox.js'
import { consumeOutbox } from '../src/workers/outboxConsumer.js'
import { requestContext } from '../src/utils/requestContext.js'

type AnyFn = ReturnType<typeof vi.fn>
const tx = (prisma as unknown as {
  _tx: {
    $queryRaw: AnyFn
    outboxEvent: { updateMany: AnyFn; update: AnyFn }
  }
})._tx

beforeEach(() => {
  vi.clearAllMocks()
})

// ── writeOutboxEvent — correlation id stamped into payload._meta ─────────────

describe('writeOutboxEvent correlation id (D-1)', () => {
  const fakeTx = () =>
    ({ outboxEvent: { create: vi.fn(async (args: unknown) => args) } }) as unknown as
      Prisma.TransactionClient & { outboxEvent: { create: AnyFn } }

  const baseParams = {
    tenantId: 't-1',
    eventType: 'event.created',
    aggregateType: 'event',
    aggregateId: '1',
    payload: { eventId: 1, name: 'Final' },
  }

  it('adds payload._meta.correlationId when called inside a request context', async () => {
    const t = fakeTx()
    await requestContext.run({ correlationId: 'cid-outbox' }, async () => {
      await writeOutboxEvent(t, baseParams)
    })
    const arg = t.outboxEvent.create.mock.calls[0][0]
    expect(arg.data.payload).toEqual({
      eventId: 1,
      name: 'Final',
      _meta: { correlationId: 'cid-outbox' },
    })
  })

  it('leaves the payload untouched outside any request context (non-breaking)', async () => {
    const t = fakeTx()
    await writeOutboxEvent(t, baseParams)
    const arg = t.outboxEvent.create.mock.calls[0][0]
    expect(arg.data.payload).toEqual({ eventId: 1, name: 'Final' })
    expect(arg.data.payload._meta).toBeUndefined()
  })

  it('preserves caller-provided _meta keys while adding the correlation id', async () => {
    const t = fakeTx()
    await requestContext.run({ correlationId: 'cid-merge' }, async () => {
      await writeOutboxEvent(t, { ...baseParams, payload: { a: 1, _meta: { source: 'csv' } } })
    })
    const arg = t.outboxEvent.create.mock.calls[0][0]
    expect(arg.data.payload._meta).toEqual({ source: 'csv', correlationId: 'cid-merge' })
  })
})

// ── consumeOutbox — _meta lifted into job data as _correlationId ─────────────

describe('consumeOutbox correlation id propagation (D-1)', () => {
  const row = {
    id: 'ob-1',
    tenantId: 't-1',
    eventType: 'event.created',
    payload: { eventId: 7, _meta: { correlationId: 'cid-job' } },
    idempotencyKey: 'event.created:7:fixed',
    retryCount: 0,
    maxRetries: 5,
  }

  it('copies payload._meta.correlationId into BullMQ job data as _correlationId and strips _meta', async () => {
    tx.$queryRaw.mockResolvedValue([row])

    const processed = await consumeOutbox()
    expect(processed).toBe(1)

    const expectedData = {
      eventId: 7,
      eventType: 'event.created',
      _outboxEventId: 'ob-1',
      _tenantId: 't-1',
      _correlationId: 'cid-job',
    }
    expect(socketioQueue.add).toHaveBeenCalledWith(
      'event.created',
      expectedData,
      { jobId: 'event.created:7:fixed:socketio' }
    )
    expect(webhookQueue.add).toHaveBeenCalledWith(
      'event.created',
      expectedData,
      { jobId: 'event.created:7:fixed:webhook' }
    )
  })

  it('emits job data without _correlationId when the payload carries no _meta (legacy rows)', async () => {
    tx.$queryRaw.mockResolvedValue([{ ...row, payload: { eventId: 7 } }])

    await consumeOutbox()

    expect(webhookQueue.add).toHaveBeenCalledWith(
      'event.created',
      {
        eventId: 7,
        eventType: 'event.created',
        _outboxEventId: 'ob-1',
        _tenantId: 't-1',
      },
      { jobId: 'event.created:7:fixed:webhook' }
    )
  })
})
