/**
 * CHARACTERIZATION (golden-master) tests for the cascade engine orchestration
 * (TASK B-2-T1).
 *
 * These tests pin CURRENT behavior — including behavior that looks wrong.
 * Do NOT change an expectation here to something "more correct" without an
 * ADR-008 justification (that is task B-2-T2). Suspicious behaviors pinned
 * below are recorded in the B-2-T1 findings list.
 *
 * Scope: the full cascade orchestration chain —
 *   1. engine.ts  runCascade()         — advisory lock, query, estimate, persist
 *   2. cascadeWorker.ts processor      — RLS, engine call, outbox write, socket push
 *   3. outboxConsumer.ts consumeOutbox — 'cascade.recomputed' → alerts queue routing
 *
 * NOTE: engine.ts itself emits NO alerts and writes NO outbox events. Those
 * happen in cascadeWorker (outbox) and, indirectly, alertWorker via the
 * outbox consumer's EVENT_ROUTING. That separation is itself pinned here.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// ── Module mocks (hoisted) ──────────────────────────────────────────────────

vi.mock('../src/db/prisma.js', () => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    event: { findMany: vi.fn() },
    broadcastSlot: { findMany: vi.fn() },
    cascadeEstimate: { deleteMany: vi.fn(), createMany: vi.fn() },
    outboxEvent: { create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  }
  return {
    prisma: {
      __tx: tx,
      $transaction: vi.fn(),
      $executeRaw: vi.fn(),
      $disconnect: vi.fn(),
      event: { findUnique: vi.fn() },
      broadcastSlot: { findMany: vi.fn() },
    },
  }
})

vi.mock('../src/services/queue.js', () => {
  const q = () => ({ add: vi.fn(), close: vi.fn() })
  return {
    createQueue: vi.fn(q),
    // Capture the processor instead of constructing a real BullMQ worker.
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

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { prisma } from '../src/db/prisma.js'
import { socketioQueue, alertQueue, webhookQueue, cascadeQueue } from '../src/services/queue.js'
import {
  runCascade,
  CHANGEOVER_MIN,
  CONFIDENCE_DECAY,
} from '../src/services/cascade/engine.js'
import type { DurationEstimator } from '../src/services/cascade/estimator.js'
import { cascadeWorker } from '../src/workers/cascadeWorker.js'
import { consumeOutbox } from '../src/workers/outboxConsumer.js'

// ── Mock plumbing ────────────────────────────────────────────────────────────

type AnyFn = ReturnType<typeof vi.fn>
const mp = prisma as unknown as {
  __tx: {
    $executeRaw: AnyFn
    $queryRaw: AnyFn
    event: { findMany: AnyFn }
    broadcastSlot: { findMany: AnyFn }
    cascadeEstimate: { deleteMany: AnyFn; createMany: AnyFn }
    outboxEvent: { create: AnyFn; updateMany: AnyFn; update: AnyFn }
  }
  $transaction: AnyFn
  $executeRaw: AnyFn
  event: { findUnique: AnyFn }
  broadcastSlot: { findMany: AnyFn }
}
const tx = mp.__tx

/** Worker processor captured by the createWorker mock. */
const processCascadeJob = (cascadeWorker as unknown as { processor: (job: unknown) => Promise<unknown> }).processor

/** Ordered trace of orchestration steps, rebuilt per test. */
let callOrder: string[] = []

/**
 * Label a $executeRaw invocation. Tagged-template calls arrive as
 * (TemplateStringsArray, ...values); Prisma.sql calls arrive as (Sql).
 */
function rawLabel(args: unknown[]): string {
  const first = args[0] as { sql?: string } | string[]
  if (Array.isArray(first)) {
    const text = first.join('?')
    if (text.includes('pg_advisory_xact_lock')) return 'advisoryLock'
    if (text.includes('set_tenant_context')) return 'setTenantRLS'
    return 'raw'
  }
  if (String(first?.sql ?? '').includes('UPDATE "BroadcastSlot"')) return 'broadcastSlotBulkUpdate'
  return 'sql'
}

const TENANT = '00000000-0000-4000-8000-0000000000aa'
const DATE = new Date('2026-04-21')
// hashCode('cascade:7:2026-04-21') with engine.ts's djb2-variant + Math.abs.
const LOCK_KEY_COURT7 = 1623390278

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: TENANT,
    status: 'approved',
    startDateBE: new Date('2026-04-21'),
    startTimeBE: '20:00', // engine NEVER reads this — see finding on midnight anchoring
    durationMin: 100, // deterministic estimator: shortMin 90, longMin 120
    sportMetadata: { court_id: 7, order_on_court: 1 },
    sport: null,
    phase: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  callOrder = []

  mp.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => {
    callOrder.push('$transaction')
    return fn(tx)
  })
  mp.$executeRaw.mockImplementation(async (...args: unknown[]) => {
    callOrder.push(rawLabel(args))
    return 1
  })
  tx.$executeRaw.mockImplementation(async (...args: unknown[]) => {
    callOrder.push(rawLabel(args))
    return 1
  })
  tx.$queryRaw.mockResolvedValue([])
  tx.event.findMany.mockImplementation(async () => {
    callOrder.push('tx.event.findMany')
    return []
  })
  tx.broadcastSlot.findMany.mockImplementation(async () => {
    callOrder.push('tx.broadcastSlot.findMany')
    return []
  })
  tx.cascadeEstimate.deleteMany.mockImplementation(async () => {
    callOrder.push('tx.cascadeEstimate.deleteMany')
    return { count: 0 }
  })
  tx.cascadeEstimate.createMany.mockImplementation(async () => {
    callOrder.push('tx.cascadeEstimate.createMany')
    return { count: 0 }
  })
  tx.outboxEvent.create.mockImplementation(async (args: { data: unknown }) => {
    callOrder.push('tx.outboxEvent.create')
    return args.data
  })
  tx.outboxEvent.updateMany.mockResolvedValue({ count: 0 })
  tx.outboxEvent.update.mockResolvedValue({})
  mp.event.findUnique.mockResolvedValue(null)
  mp.broadcastSlot.findMany.mockResolvedValue([])
  ;(socketioQueue.add as Mock).mockImplementation(async () => {
    callOrder.push('socketioQueue.add')
  })
  ;(alertQueue.add as Mock).mockImplementation(async () => {
    callOrder.push('alertQueue.add')
  })
})

afterEach(() => {
  vi.useRealTimers()
})

// ── 1. engine.ts runCascade ─────────────────────────────────────────────────

describe('runCascade — happy path orchestration', () => {
  it('re-exports the shared cascade constants', () => {
    expect(CHANGEOVER_MIN).toBe(15)
    expect(CONFIDENCE_DECAY).toBe(0.85)
  })

  it('runs lock → event query → delete → createMany → bulk slot UPDATE, in that exact order, inside one transaction', async () => {
    const e1 = makeEvent({ id: 1, sportMetadata: { court_id: 7, order_on_court: 1 } })
    const e2 = makeEvent({ id: 2, status: 'published', sportMetadata: { court_id: 7, order_on_court: 2 } })
    tx.event.findMany.mockImplementation(async () => {
      callOrder.push('tx.event.findMany')
      return [e1, e2]
    })

    const results = await runCascade(TENANT, 7, DATE)

    // Pinned orchestration order. Note broadcastSlot.findMany is NOT called
    // when no event is completed/live.
    expect(callOrder).toEqual([
      '$transaction',
      'advisoryLock',
      'tx.event.findMany',
      'tx.cascadeEstimate.deleteMany',
      'tx.cascadeEstimate.createMany',
      'broadcastSlotBulkUpdate',
    ])

    // Event query shape: JSONB path filter on court_id, date-only equality.
    expect(tx.event.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        startDateBE: new Date('2026-04-21'),
        sportMetadata: { path: ['court_id'], equals: 7 },
      },
      include: { sport: true },
      orderBy: { id: 'asc' },
    })

    // PINNED (suspicious): the first scheduled event is anchored at
    // startDateBE — midnight UTC — not at any time-of-day (startTimeBE is
    // never read). Confidence decays on the FIRST uncertain item too
    // (0.85, not 1.0) — this is the documented engine-vs-preview divergence.
    expect(results).toEqual([
      {
        eventId: 1,
        estimatedStartUtc: new Date('2026-04-21T00:00:00.000Z'),
        earliestStartUtc: new Date('2026-04-21T00:00:00.000Z'),
        latestStartUtc: new Date('2026-04-21T00:00:00.000Z'),
        estDurationShortMin: 90,
        estDurationLongMin: 120,
        confidenceScore: 0.85,
        inputsUsed: { source: 'override:durationMin', durationMin: 100 },
        computedAt: expect.any(Date),
      },
      {
        eventId: 2,
        // prev estimated end = 00:00 + mid(105) → 01:45, + changeover 15 → 02:00
        estimatedStartUtc: new Date('2026-04-21T02:00:00.000Z'),
        earliestStartUtc: new Date('2026-04-21T01:45:00.000Z'),
        latestStartUtc: new Date('2026-04-21T02:15:00.000Z'),
        estDurationShortMin: 90,
        estDurationLongMin: 120,
        confidenceScore: 0.72, // 0.85² = 0.7225, rounded to 2dp
        inputsUsed: { source: 'override:durationMin', durationMin: 100 },
        computedAt: expect.any(Date),
      },
    ])

    // Persistence is delete-then-createMany (bulk upsert under the lock).
    expect(tx.cascadeEstimate.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, eventId: { in: [1, 2] } },
    })
    const createArg = tx.cascadeEstimate.createMany.mock.calls[0][0]
    expect(createArg.data).toHaveLength(2)
    expect(createArg.data[0]).toMatchObject({
      tenantId: TENANT,
      eventId: 1,
      confidenceScore: 0.85,
      inputsUsed: { source: 'override:durationMin', durationMin: 100 },
    })

    // The BroadcastSlot bulk UPDATE carries, per event: id, est start,
    // est end (= est start + longMin), earliest, latest — then tenantId.
    const updateCall = tx.$executeRaw.mock.calls.find(
      (c: unknown[]) => rawLabel(c) === 'broadcastSlotBulkUpdate'
    )!
    const sqlArg = updateCall[0] as { sql: string; values: unknown[] }
    expect(sqlArg.sql).toContain('UPDATE "BroadcastSlot"')
    expect(sqlArg.values).toEqual([
      1,
      new Date('2026-04-21T00:00:00.000Z'),
      new Date('2026-04-21T02:00:00.000Z'),
      new Date('2026-04-21T00:00:00.000Z'),
      new Date('2026-04-21T00:00:00.000Z'),
      2,
      new Date('2026-04-21T02:00:00.000Z'),
      new Date('2026-04-21T04:00:00.000Z'),
      new Date('2026-04-21T01:45:00.000Z'),
      new Date('2026-04-21T02:15:00.000Z'),
      TENANT,
    ])
  })

  it('acquires the advisory lock and returns [] with zero writes when the court has no events', async () => {
    const results = await runCascade(TENANT, 7, DATE)
    expect(results).toEqual([])
    expect(callOrder).toEqual(['$transaction', 'advisoryLock', 'tx.event.findMany'])
    expect(tx.cascadeEstimate.deleteMany).not.toHaveBeenCalled()
    expect(tx.cascadeEstimate.createMany).not.toHaveBeenCalled()
  })
})

describe('runCascade — advisory lock (court+date)', () => {
  it('locks on a 32-bit hash of `cascade:<courtId>:<YYYY-MM-DD>`', async () => {
    await runCascade(TENANT, 7, DATE)
    const lockCall = tx.$executeRaw.mock.calls[0]
    expect((lockCall[0] as string[]).join('?')).toContain('pg_advisory_xact_lock')
    expect(lockCall[1]).toBe(LOCK_KEY_COURT7)
  })

  it('PINNED (suspicious): the lock key excludes tenantId — different tenants on the same court+date contend on one lock', async () => {
    await runCascade(TENANT, 7, DATE)
    await runCascade('11111111-1111-4111-8111-111111111111', 7, DATE)
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(LOCK_KEY_COURT7)
    expect(tx.$executeRaw.mock.calls[1][1]).toBe(LOCK_KEY_COURT7)
  })

  it('normalizes a datetime argument to its UTC date for both the lock key and the event query', async () => {
    await runCascade(TENANT, 7, new Date('2026-04-21T18:45:00Z'))
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(LOCK_KEY_COURT7)
    expect(tx.event.findMany.mock.calls[0][0].where.startDateBE).toEqual(new Date('2026-04-21'))
  })
})

describe('runCascade — ordering and status mapping', () => {
  it('PINNED (suspicious): missing order_on_court defaults to 999 — an unordered event sorts BEFORE an explicit order of 1000', async () => {
    const eNoOrder = makeEvent({ id: 1, sportMetadata: { court_id: 7 } })
    const e1000 = makeEvent({ id: 2, sportMetadata: { court_id: 7, order_on_court: 1000 } })
    const eFirst = makeEvent({ id: 3, sportMetadata: { court_id: 7, order_on_court: 1 } })
    tx.event.findMany.mockResolvedValue([eNoOrder, e1000, eFirst])

    const results = await runCascade(TENANT, 7, DATE)
    expect(results.map(r => r.eventId)).toEqual([3, 1, 2])
  })

  it('PINNED (suspicious): a cancelled event maps to "draft" — it still receives an estimate and pushes downstream events later', async () => {
    const eDone = makeEvent({ id: 1, status: 'completed', sportMetadata: { court_id: 7, order_on_court: 1 } })
    const eCancelled = makeEvent({ id: 2, status: 'cancelled', sportMetadata: { court_id: 7, order_on_court: 2 } })
    const eNext = makeEvent({ id: 3, status: 'approved', sportMetadata: { court_id: 7, order_on_court: 3 } })
    tx.event.findMany.mockResolvedValue([eDone, eCancelled, eNext])
    tx.broadcastSlot.findMany.mockResolvedValue([
      {
        eventId: 1,
        actualStartUtc: new Date('2026-04-21T12:00:00Z'),
        actualEndUtc: new Date('2026-04-21T13:30:00Z'),
      },
    ])

    const results = await runCascade(TENANT, 7, DATE)

    // Actuals lookup is scoped to completed/live event ids only.
    expect(tx.broadcastSlot.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, eventId: { in: [1] } },
      select: { eventId: true, actualStartUtc: true, actualEndUtc: true },
    })

    // Completed: pinned to actuals, zero remaining duration, confidence 1.
    expect(results[0]).toMatchObject({
      eventId: 1,
      estimatedStartUtc: new Date('2026-04-21T12:00:00.000Z'),
      estDurationShortMin: 0,
      estDurationLongMin: 0,
      confidenceScore: 1,
    })
    // Cancelled event is estimated as if it will still play (13:30 + 15min).
    expect(results[1]).toMatchObject({
      eventId: 2,
      estimatedStartUtc: new Date('2026-04-21T13:45:00.000Z'),
      estDurationShortMin: 90,
      estDurationLongMin: 120,
      confidenceScore: 0.85,
    })
    // ...and the following real event is pushed behind the cancelled one.
    expect(results[2]).toMatchObject({
      eventId: 3,
      estimatedStartUtc: new Date('2026-04-21T15:45:00.000Z'),
      earliestStartUtc: new Date('2026-04-21T15:30:00.000Z'),
      latestStartUtc: new Date('2026-04-21T16:00:00.000Z'),
      confidenceScore: 0.72,
    })
  })

  it('PINNED (suspicious): a completed event with NO BroadcastSlot actuals anchors at startDateBE midnight with full (non-zero) durations and confidence 1', async () => {
    const eDone = makeEvent({ id: 1, status: 'completed', sportMetadata: { court_id: 7, order_on_court: 1 } })
    const eNext = makeEvent({ id: 2, sportMetadata: { court_id: 7, order_on_court: 2 } })
    tx.event.findMany.mockResolvedValue([eDone, eNext])
    tx.broadcastSlot.findMany.mockResolvedValue([]) // no actuals recorded

    const results = await runCascade(TENANT, 7, DATE)
    expect(results[0]).toMatchObject({
      eventId: 1,
      estimatedStartUtc: new Date('2026-04-21T00:00:00.000Z'),
      estDurationShortMin: 90,
      estDurationLongMin: 120,
      confidenceScore: 1,
    })
    // Next event anchors off midnight + shortMin(90) + changeover(15).
    expect(results[1].estimatedStartUtc).toEqual(new Date('2026-04-21T01:45:00.000Z'))
  })

  it('estimates REMAINING duration for a live event using Date.now() minus actualStartUtc', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T12:30:00Z'))

    const eLive = makeEvent({ id: 1, status: 'live', sportMetadata: { court_id: 7, order_on_court: 1 } })
    const eNext = makeEvent({ id: 2, sportMetadata: { court_id: 7, order_on_court: 2 } })
    tx.event.findMany.mockResolvedValue([eLive, eNext])
    tx.broadcastSlot.findMany.mockResolvedValue([
      { eventId: 1, actualStartUtc: new Date('2026-04-21T12:00:00Z'), actualEndUtc: null },
    ])

    const results = await runCascade(TENANT, 7, DATE)

    // 30 elapsed of durationMin=100 → remaining short 60 (90-30), long 90 (120-30).
    expect(results[0]).toMatchObject({
      eventId: 1,
      estimatedStartUtc: new Date('2026-04-21T12:00:00.000Z'),
      estDurationShortMin: 60,
      estDurationLongMin: 90,
      confidenceScore: 1,
      inputsUsed: {
        source: 'override:durationMin',
        durationMin: 100,
        live_remaining: true,
        elapsed_min: 30,
      },
    })
    // Live anchor uses remaining SHORT duration: 12:00 + 60 + 15 → 13:15.
    expect(results[1].estimatedStartUtc).toEqual(new Date('2026-04-21T13:15:00.000Z'))
    expect(results[0].computedAt).toEqual(new Date('2026-04-21T12:30:00Z'))
  })
})

describe('runCascade — failure propagation', () => {
  const throwingEstimator: DurationEstimator = {
    shortDuration: () => 0,
    longDuration: () => 0,
    estimate: () => {
      throw new Error('estimator boom')
    },
  }

  it('compute failure (estimator throws): error propagates out of the transaction; no persistence calls were made', async () => {
    tx.event.findMany.mockImplementation(async () => {
      callOrder.push('tx.event.findMany')
      return [makeEvent({ id: 1 })]
    })

    await expect(runCascade(TENANT, 7, DATE, throwingEstimator)).rejects.toThrow('estimator boom')

    // Lock was acquired and events were read; nothing was written. Lock
    // release is delegated to pg_advisory_xact_lock semantics (tx end).
    expect(callOrder).toEqual(['$transaction', 'advisoryLock', 'tx.event.findMany'])
    expect(tx.cascadeEstimate.deleteMany).not.toHaveBeenCalled()
    expect(tx.cascadeEstimate.createMany).not.toHaveBeenCalled()
  })

  it('event query failure propagates after lock acquisition', async () => {
    tx.event.findMany.mockImplementation(async () => {
      callOrder.push('tx.event.findMany')
      throw new Error('query boom')
    })
    await expect(runCascade(TENANT, 7, DATE)).rejects.toThrow('query boom')
    expect(callOrder).toEqual(['$transaction', 'advisoryLock', 'tx.event.findMany'])
  })

  it('partial-application: createMany failure propagates AFTER deleteMany was issued; slot UPDATE is skipped (rollback is delegated to Prisma)', async () => {
    tx.event.findMany.mockResolvedValue([makeEvent({ id: 1 })])
    tx.cascadeEstimate.createMany.mockImplementation(async () => {
      callOrder.push('tx.cascadeEstimate.createMany')
      throw new Error('createMany boom')
    })

    await expect(runCascade(TENANT, 7, DATE)).rejects.toThrow('createMany boom')

    expect(tx.cascadeEstimate.deleteMany).toHaveBeenCalledTimes(1)
    expect(callOrder).not.toContain('broadcastSlotBulkUpdate')
  })

  it('partial-application: BroadcastSlot bulk-UPDATE failure propagates after estimates were created', async () => {
    tx.event.findMany.mockResolvedValue([makeEvent({ id: 1 })])
    tx.$executeRaw.mockImplementation(async (...args: unknown[]) => {
      const label = rawLabel(args)
      callOrder.push(label)
      if (label === 'broadcastSlotBulkUpdate') throw new Error('update boom')
      return 1
    })

    await expect(runCascade(TENANT, 7, DATE)).rejects.toThrow('update boom')
    expect(tx.cascadeEstimate.createMany).toHaveBeenCalledTimes(1)
  })
})

// ── 2. cascadeWorker — outbox interaction + client push ─────────────────────

describe('cascadeWorker processor — outbox + socket emission', () => {
  function primeSingleEventCourt7() {
    const event = makeEvent({ id: 1, sportMetadata: { court_id: 7, order_on_court: 1 } })
    mp.event.findUnique.mockResolvedValue(event)
    tx.event.findMany.mockImplementation(async () => {
      callOrder.push('tx.event.findMany')
      return [event]
    })
    return event
  }

  it('path A happy: RLS → engine transaction → SEPARATE outbox transaction → socketio push', async () => {
    primeSingleEventCourt7()

    const result = await processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })
    expect(result).toEqual({ estimateCount: 1 })

    expect(callOrder).toEqual([
      'setTenantRLS',
      '$transaction', // engine: estimates persisted + committed here…
      'advisoryLock',
      'tx.event.findMany',
      'tx.cascadeEstimate.deleteMany',
      'tx.cascadeEstimate.createMany',
      'broadcastSlotBulkUpdate',
      '$transaction', // …then the outbox write happens in a NEW transaction
      'tx.outboxEvent.create',
      'socketioQueue.add', // and the socket push outside any transaction
    ])

    // Outbox row shape, including the auto-generated idempotency key:
    // `<eventType>:<aggregateId>:<uuid>` and default NORMAL priority.
    const outboxArg = tx.outboxEvent.create.mock.calls[0][0]
    expect(outboxArg.data).toMatchObject({
      tenantId: TENANT,
      eventType: 'cascade.recomputed',
      aggregateType: 'Court',
      aggregateId: '7',
      payload: { courtId: 7, date: '2026-04-21', estimateCount: 1 },
      priority: 'NORMAL',
    })
    expect(outboxArg.data.idempotencyKey).toMatch(
      /^cascade\.recomputed:7:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )

    // Socket push: estimates payload to the court room on the /cascade namespace.
    const [jobName, jobPayload] = (socketioQueue.add as Mock).mock.calls[0]
    expect(jobName).toBe('cascade:updated')
    expect(jobPayload).toMatchObject({
      eventType: 'cascade:updated',
      namespace: '/cascade',
      room: `tenant:${TENANT}:court:7`,
      _tenantId: TENANT,
    })
    expect(jobPayload.payload).toHaveLength(1)
    expect(jobPayload.payload[0].eventId).toBe(1)
  })

  it('PINNED (suspicious): outbox idempotency key embeds a fresh uuid per run — a retried job writes a DUPLICATE outbox event', async () => {
    primeSingleEventCourt7()

    await processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })
    await processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })

    const key1 = tx.outboxEvent.create.mock.calls[0][0].data.idempotencyKey
    const key2 = tx.outboxEvent.create.mock.calls[1][0].data.idempotencyKey
    expect(key1).not.toBe(key2) // identical inputs → different keys → no dedup
  })

  it('PINNED (suspicious): outbox write failure AFTER estimates committed — partial application: estimates persist, no outbox row, no socket push, job fails (retry recomputes + duplicates)', async () => {
    primeSingleEventCourt7()
    tx.outboxEvent.create.mockImplementation(async () => {
      callOrder.push('tx.outboxEvent.create')
      throw new Error('outbox boom')
    })

    await expect(processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })).rejects.toThrow('outbox boom')

    // The engine transaction already ran to completion before the outbox tx.
    expect(tx.cascadeEstimate.createMany).toHaveBeenCalledTimes(1)
    expect(socketioQueue.add).not.toHaveBeenCalled()
  })

  it('skips (no engine run) when the event is missing, has no court_id, or the job has neither eventId nor versionId', async () => {
    mp.event.findUnique.mockResolvedValue(null)
    expect(await processCascadeJob({ data: { tenantId: TENANT, eventId: 99 } })).toEqual({ skipped: true })

    mp.event.findUnique.mockResolvedValue(makeEvent({ id: 1, sportMetadata: {} }))
    expect(await processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })).toEqual({ skipped: true })

    expect(await processCascadeJob({ data: { tenantId: TENANT } })).toEqual({ skipped: true })

    expect(mp.$transaction).not.toHaveBeenCalled()
    expect(tx.outboxEvent.create).not.toHaveBeenCalled()
  })

  it('PINNED: a string court_id ("7") is coerced to number by the worker, but the engine queries JSONB with the NUMBER 7', async () => {
    const event = makeEvent({ id: 1, sportMetadata: { court_id: '7', order_on_court: 1 } })
    mp.event.findUnique.mockResolvedValue(event)
    tx.event.findMany.mockResolvedValue([])

    await processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })

    // The engine's JSONB equality is strict on type: an event whose
    // metadata stores court_id as the STRING "7" triggers the worker but
    // will not match this numeric query in Postgres.
    expect(tx.event.findMany.mock.calls[0][0].where.sportMetadata).toEqual({
      path: ['court_id'],
      equals: 7,
    })
  })

  it('path B (versionId): dedupes slots to unique court+date pairs — one cascade + one outbox event per pair', async () => {
    const eventA = { id: 1, startDateBE: new Date('2026-04-21'), sportMetadata: { court_id: 7 } }
    const eventB = { id: 2, startDateBE: new Date('2026-04-21'), sportMetadata: { court_id: 7 } }
    mp.broadcastSlot.findMany.mockResolvedValue([
      { event: eventA },
      { event: eventB },
      { event: null }, // slot without event is skipped
    ])
    tx.event.findMany.mockResolvedValue([makeEvent({ id: 1 })])

    const result = await processCascadeJob({ data: { tenantId: TENANT, versionId: 'v1' } })

    expect(result).toEqual({ estimateCount: 1, courts: 1 })
    expect(tx.event.findMany).toHaveBeenCalledTimes(1) // one runCascade, not two
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1)
    expect(socketioQueue.add).toHaveBeenCalledTimes(1)
  })

  it('path B with no court-scoped events skips without cascading', async () => {
    mp.broadcastSlot.findMany.mockResolvedValue([{ event: { id: 1, startDateBE: DATE, sportMetadata: {} } }])
    expect(await processCascadeJob({ data: { tenantId: TENANT, versionId: 'v1' } })).toEqual({
      skipped: true,
      courts: 0,
    })
    expect(mp.$transaction).not.toHaveBeenCalled()
  })
})

// ── 3. outboxConsumer — alert emission path for cascade.recomputed ───────────

describe('consumeOutbox — cascade.recomputed routing (alert emission)', () => {
  const row = {
    id: 'ob-1',
    tenantId: TENANT,
    eventType: 'cascade.recomputed',
    payload: { courtId: 7, date: '2026-04-21', estimateCount: 2 },
    idempotencyKey: 'cascade.recomputed:7:fixed-key',
    retryCount: 0,
    maxRetries: 3,
  }

  it('routes cascade.recomputed ONLY to the alerts queue, with BullMQ jobId = `<idempotencyKey>:alerts`, then marks processed', async () => {
    tx.$queryRaw.mockResolvedValue([row])

    const processed = await consumeOutbox()
    expect(processed).toBe(1)

    expect(alertQueue.add).toHaveBeenCalledTimes(1)
    expect(alertQueue.add).toHaveBeenCalledWith(
      'cascade.recomputed',
      {
        courtId: 7,
        date: '2026-04-21',
        estimateCount: 2,
        eventType: 'cascade.recomputed',
        _outboxEventId: 'ob-1',
        _tenantId: TENANT,
      },
      { jobId: 'cascade.recomputed:7:fixed-key:alerts' }
    )
    // No direct socket/webhook/cascade fan-out for this event type.
    expect(socketioQueue.add).not.toHaveBeenCalled()
    expect(webhookQueue.add).not.toHaveBeenCalled()
    expect(cascadeQueue.add).not.toHaveBeenCalled()

    expect(tx.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ob-1'] } },
      data: { processedAt: expect.any(Date) },
    })
  })

  it('on enqueue failure: increments retryCount (failedAt) and dead-letters once nextRetry reaches maxRetries', async () => {
    const rowNearDeath = { ...row, id: 'ob-2', retryCount: 2 }
    tx.$queryRaw.mockResolvedValue([row, rowNearDeath])
    ;(alertQueue.add as Mock).mockRejectedValue(new Error('redis down'))

    const processed = await consumeOutbox()
    expect(processed).toBe(2) // returns batch size, not success count

    expect(tx.outboxEvent.updateMany).not.toHaveBeenCalled()
    expect(tx.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'ob-1' },
      data: { retryCount: 1, failedAt: expect.any(Date) },
    })
    expect(tx.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'ob-2' },
      data: { deadLetteredAt: expect.any(Date), retryCount: 3 },
    })
  })
})
