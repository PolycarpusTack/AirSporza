import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    webhookEndpoint: { findMany: vi.fn() },
    webhookDelivery: { upsert: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('../src/services/queue.js', () => ({
  createQueue: vi.fn(() => ({ add: vi.fn(), close: vi.fn() })),
  // Capture the processor instead of constructing a real BullMQ worker.
  createWorker: vi.fn((_name: string, processor: unknown) => ({ processor })),
  closeQueues: vi.fn(),
}))

import { prisma } from '../src/db/prisma.js'
import { startWebhookWorker } from '../src/workers/webhookWorker.js'

type AnyFn = ReturnType<typeof vi.fn>
const mp = prisma as unknown as {
  webhookEndpoint: { findMany: AnyFn }
  webhookDelivery: { upsert: AnyFn; update: AnyFn }
}

const fetchMock = vi.fn()

const processor = (startWebhookWorker() as unknown as {
  processor: (job: { data: unknown }) => Promise<unknown>
}).processor

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({ ok: true, status: 200 })
  mp.webhookEndpoint.findMany.mockResolvedValue([
    { id: 'wh-1', tenantId: 't-1', url: 'https://example.com/hook', secret: 'shh', events: ['event.created'], isActive: true },
  ])
  mp.webhookDelivery.upsert.mockResolvedValue({ id: 'd-1' })
  mp.webhookDelivery.update.mockResolvedValue({})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('webhookWorker correlation header (D-1)', () => {
  const baseJob = {
    eventType: 'event.created',
    _tenantId: 't-1',
    _outboxEventId: 'ob-1',
    eventId: 7,
  }

  it('sends X-Correlation-Id when the job carries a _correlationId', async () => {
    const result = await processor({ data: { ...baseJob, _correlationId: 'cid-hook' } })
    expect(result).toEqual({ delivered: 1, total: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.com/hook')
    expect(init.headers['X-Correlation-Id']).toBe('cid-hook')
  })

  it('keeps _correlationId out of the delivered envelope payload', async () => {
    await processor({ data: { ...baseJob, _correlationId: 'cid-hook' } })

    const [, init] = fetchMock.mock.calls[0]
    const envelope = JSON.parse(init.body)
    expect(envelope.event).toBe('event.created')
    expect(envelope.data).toEqual({ eventId: 7 })
  })

  it('omits the header when no correlation id is present', async () => {
    await processor({ data: { ...baseJob } })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-Correlation-Id']).toBeUndefined()
    // Existing headers unchanged.
    expect(init.headers['X-Planza-Event']).toBe('event.created')
    expect(init.headers['Content-Type']).toBe('application/json')
  })
})
