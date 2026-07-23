/**
 * DESIRED-SEMANTICS tests for the CASCADE_PREVIEW_PARITY story (AS-8:
 * TD-12 + TD-13 + TD-14), per ADR-008.
 *
 * Complements the B-2-T1 characterization suite (`cascade-engine.test.ts`):
 * that suite pins flag-OFF behavior; THIS suite specifies the new behavior.
 *
 *  - TD-12 (flag-gated, `CASCADE_PREVIEW_PARITY`): the engine anchors the
 *    first chain event at startDateBE + startTimeBE (shared `beClockToUtc`
 *    derivation) and adopts the preview's confidence convention — the
 *    anchored first item is CERTAIN (1.0); decay applies only to items
 *    chaining off an uncertain predecessor. Expected values below are
 *    DERIVED FROM THE PREVIEW CODE (the preview-cascade handler in
 *    `routes/schedules.ts` — search "Preview semantics"): confidence starts
 *    at 1.0; a chained slot gets prevEnd + CHANGEOVER and
 *    confidence *= CONFIDENCE_DECAY; the first (anchored) slot keeps
 *    plannedStart with NO decay; result rounded to 2dp.
 *    → chain of three: 1.0, 0.85, 0.72 (0.85² = 0.7225 → 2dp).
 *  - TD-13 (flag-independent): deterministic outbox idempotency key
 *    `cascade.recomputed:<tenantId>:<courtId>:<dateStr>:<bucket>` with a
 *    5-minute computedAt bucket, so worker retries dedupe.
 *  - TD-14 (flag-independent): the outbox write happens INSIDE the engine's
 *    transaction (ADR-001 pattern); the socket push stays post-commit.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// ── Module mocks (hoisted) ──────────────────────────────────────────────────

/** Mutable flag holder so individual tests can flip CASCADE_PREVIEW_PARITY. */
const flagState = { previewParity: false }

vi.mock('../src/config/env.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/config/env.js')>()
  return {
    ...mod,
    env: new Proxy(mod.env, {
      get(target, prop, receiver) {
        if (prop === 'CASCADE_PREVIEW_PARITY') return flagState.previewParity
        return Reflect.get(target, prop, receiver)
      },
    }),
  }
})

vi.mock('../src/db/prisma.js', () => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    event: { findMany: vi.fn() },
    broadcastSlot: { findMany: vi.fn() },
    cascadeEstimate: { deleteMany: vi.fn(), createMany: vi.fn() },
    outboxEvent: { create: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
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
import { socketioQueue } from '../src/services/queue.js'
import { computeCascadeChain, type CascadeItem } from '../src/services/cascade/compute.js'
import { runCascade, cascadeRecomputedKey } from '../src/services/cascade/engine.js'
import { cascadeWorker } from '../src/workers/cascadeWorker.js'

// ── Mock plumbing (mirrors cascade-engine.test.ts) ──────────────────────────

type AnyFn = ReturnType<typeof vi.fn>
const mp = prisma as unknown as {
  __tx: {
    $executeRaw: AnyFn
    $queryRaw: AnyFn
    event: { findMany: AnyFn }
    broadcastSlot: { findMany: AnyFn }
    cascadeEstimate: { deleteMany: AnyFn; createMany: AnyFn }
    outboxEvent: { create: AnyFn; createMany: AnyFn; updateMany: AnyFn; update: AnyFn }
  }
  $transaction: AnyFn
  $executeRaw: AnyFn
  event: { findUnique: AnyFn }
  broadcastSlot: { findMany: AnyFn }
}
const tx = mp.__tx

const processCascadeJob = (cascadeWorker as unknown as { processor: (job: unknown) => Promise<unknown> }).processor

let callOrder: string[] = []

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
const OTHER_TENANT = '11111111-1111-4111-8111-111111111111'
const DATE = new Date('2026-04-21')

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: TENANT,
    status: 'approved',
    startDateBE: new Date('2026-04-21'),
    startTimeBE: '20:00',
    durationMin: 100, // deterministic estimator: shortMin 90, longMin 120 (mid 105)
    sportMetadata: { court_id: 7, order_on_court: 1 },
    sport: null,
    phase: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  callOrder = []
  flagState.previewParity = false

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
  tx.outboxEvent.createMany.mockImplementation(async () => {
    callOrder.push('tx.outboxEvent.createMany')
    return { count: 1 }
  })
  tx.outboxEvent.updateMany.mockResolvedValue({ count: 0 })
  tx.outboxEvent.update.mockResolvedValue({})
  mp.event.findUnique.mockResolvedValue(null)
  mp.broadcastSlot.findMany.mockResolvedValue([])
  ;(socketioQueue.add as Mock).mockImplementation(async () => {
    callOrder.push('socketioQueue.add')
  })
})

afterEach(() => {
  vi.useRealTimers()
})

// ── TD-12: preview-parity confidence convention (pure chain) ────────────────

describe('computeCascadeChain — previewParity confidence convention (TD-12b, ADR-008 Decision 1)', () => {
  function scheduledItem(id: number, startMs: number): CascadeItem & { id: number } {
    return {
      id,
      startMs,
      status: 'scheduled',
      notBeforeMs: null,
      actualStartMs: null,
      actualEndMs: null,
      shortMin: 90,
      longMin: 120,
    }
  }
  const T20 = new Date('2026-04-21T20:00:00Z').getTime()

  it('parity ON: first anchored item is CERTAIN (1.0); chained items decay 0.85, 0.72 — matching the preview (schedules.ts:474-499)', () => {
    const results = computeCascadeChain(
      [scheduledItem(1, T20), scheduledItem(2, T20), scheduledItem(3, T20)],
      { previewParity: true }
    )
    // Preview-derived expectations: slot 1 anchored (no decay, :488-490),
    // slots 2..n chained (confidence *= 0.85, :487), 2dp rounding (:499).
    expect(results.map(r => r.confidenceScore)).toEqual([1.0, 0.85, 0.72])
    // Anchor + chain arithmetic unchanged: 20:00, +mid(105)+15 → 22:00, → 00:00.
    expect(results.map(r => new Date(r.estimatedStartMs).toISOString())).toEqual([
      '2026-04-21T20:00:00.000Z',
      '2026-04-21T22:00:00.000Z',
      '2026-04-22T00:00:00.000Z',
    ])
  })

  it('parity ON: an item chaining off a completed predecessor still decays (its start is chained/estimated, exactly like preview slot 2)', () => {
    const completed: CascadeItem & { id: number } = {
      id: 1,
      startMs: T20,
      status: 'completed',
      notBeforeMs: null,
      actualStartMs: new Date('2026-04-21T12:00:00Z').getTime(),
      actualEndMs: new Date('2026-04-21T13:30:00Z').getTime(),
      shortMin: 90,
      longMin: 120,
    }
    const results = computeCascadeChain([completed, scheduledItem(2, T20)], { previewParity: true })
    expect(results[0].confidenceScore).toBe(1.0)
    expect(results[1].confidenceScore).toBe(0.85)
  })

  it('parity OFF (default): unconditional decay preserved — 0.85, 0.72, 0.61 (characterized flag-off behavior)', () => {
    const results = computeCascadeChain([scheduledItem(1, T20), scheduledItem(2, T20), scheduledItem(3, T20)])
    expect(results.map(r => r.confidenceScore)).toEqual([0.85, 0.72, 0.61])
  })
})

// ── TD-12: startTimeBE anchoring in the engine ──────────────────────────────

describe('runCascade — previewParity anchoring (TD-12a) + confidence parity (TD-12b)', () => {
  it('parity ON: first chain event anchors at startDateBE + startTimeBE (beClockToUtc), confidence 1.0; second event chains with 0.85', async () => {
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00', sportMetadata: { court_id: 7, order_on_court: 1 } })
    const e2 = makeEvent({ id: 2, startTimeBE: '21:45', sportMetadata: { court_id: 7, order_on_court: 2 } })
    tx.event.findMany.mockResolvedValue([e1, e2])

    const results = await runCascade(TENANT, 7, DATE, { previewParity: true })

    expect(results[0]).toMatchObject({
      eventId: 1,
      estimatedStartUtc: new Date('2026-04-21T20:00:00.000Z'),
      earliestStartUtc: new Date('2026-04-21T20:00:00.000Z'),
      latestStartUtc: new Date('2026-04-21T20:00:00.000Z'),
      confidenceScore: 1.0,
    })
    // Chained: 20:00 + mid(105) + changeover(15) → 22:00; short/long bounds.
    expect(results[1]).toMatchObject({
      eventId: 2,
      estimatedStartUtc: new Date('2026-04-21T22:00:00.000Z'),
      earliestStartUtc: new Date('2026-04-21T21:45:00.000Z'),
      latestStartUtc: new Date('2026-04-21T22:15:00.000Z'),
      confidenceScore: 0.85,
    })
  })

  it('parity ON: blank startTimeBE falls back to the date-only midnight anchor (explicit, documented fallback) — confidence parity still applies', async () => {
    tx.event.findMany.mockResolvedValue([makeEvent({ id: 1, startTimeBE: '' })])
    const results = await runCascade(TENANT, 7, DATE, { previewParity: true })
    expect(results[0].estimatedStartUtc).toEqual(new Date('2026-04-21T00:00:00.000Z'))
    expect(results[0].confidenceScore).toBe(1.0)
  })

  it('parity ON: malformed startTimeBE (not HH:MM) falls back to the date-only anchor instead of producing Invalid Date', async () => {
    tx.event.findMany.mockResolvedValue([makeEvent({ id: 1, startTimeBE: '20h00' })])
    const results = await runCascade(TENANT, 7, DATE, { previewParity: true })
    expect(results[0].estimatedStartUtc).toEqual(new Date('2026-04-21T00:00:00.000Z'))
  })

  it('parity ON: a completed event with NO BroadcastSlot actuals anchors at startDateBE + startTimeBE (not midnight)', async () => {
    const eDone = makeEvent({ id: 1, status: 'completed', startTimeBE: '12:00', sportMetadata: { court_id: 7, order_on_court: 1 } })
    const eNext = makeEvent({ id: 2, sportMetadata: { court_id: 7, order_on_court: 2 } })
    tx.event.findMany.mockResolvedValue([eDone, eNext])
    tx.broadcastSlot.findMany.mockResolvedValue([]) // no actuals recorded

    const results = await runCascade(TENANT, 7, DATE, { previewParity: true })
    expect(results[0]).toMatchObject({
      eventId: 1,
      estimatedStartUtc: new Date('2026-04-21T12:00:00.000Z'),
      confidenceScore: 1,
    })
    // Next event: 12:00 + short(90) + changeover(15) → 13:45, chained decay.
    expect(results[1]).toMatchObject({
      estimatedStartUtc: new Date('2026-04-21T13:45:00.000Z'),
      confidenceScore: 0.85,
    })
  })

  it('parity OFF (default): anchor stays date-only midnight and first-item confidence stays 0.85 (characterized behavior untouched)', async () => {
    tx.event.findMany.mockResolvedValue([makeEvent({ id: 1, startTimeBE: '20:00' })])
    const results = await runCascade(TENANT, 7, DATE)
    expect(results[0].estimatedStartUtc).toEqual(new Date('2026-04-21T00:00:00.000Z'))
    expect(results[0].confidenceScore).toBe(0.85)
  })
})

// ── TD-13: deterministic outbox idempotency key ─────────────────────────────

describe('cascadeRecomputedKey — deterministic idempotency key (TD-13, ADR-008 Decision 2)', () => {
  it('is cascade.recomputed:<tenantId>:<courtId>:<dateStr>:<bucket> with computedAt floored to a 5-minute bucket', () => {
    expect(cascadeRecomputedKey(TENANT, 7, '2026-04-21', new Date('2026-04-21T12:32:10Z'))).toBe(
      `cascade.recomputed:${TENANT}:7:2026-04-21:2026-04-21T12:30`
    )
    // Same 5-minute bucket → same key (retry dedup)…
    expect(cascadeRecomputedKey(TENANT, 7, '2026-04-21', new Date('2026-04-21T12:34:59Z'))).toBe(
      cascadeRecomputedKey(TENANT, 7, '2026-04-21', new Date('2026-04-21T12:30:00Z'))
    )
    // …next bucket → new key (a later recompute wave is a distinct event).
    expect(cascadeRecomputedKey(TENANT, 7, '2026-04-21', new Date('2026-04-21T12:35:00Z'))).toBe(
      `cascade.recomputed:${TENANT}:7:2026-04-21:2026-04-21T12:35`
    )
  })

  it('includes tenantId: idempotencyKey is a GLOBAL unique column, so two tenants sharing court 7 must not dedupe each other', () => {
    const at = new Date('2026-04-21T12:30:00Z')
    expect(cascadeRecomputedKey(TENANT, 7, '2026-04-21', at)).not.toBe(
      cascadeRecomputedKey(OTHER_TENANT, 7, '2026-04-21', at)
    )
  })

  it('differs across courts and across dates (every key dimension distinguishes)', () => {
    const at = new Date('2026-04-21T12:30:00Z')
    expect(cascadeRecomputedKey(TENANT, 7, '2026-04-21', at)).not.toBe(
      cascadeRecomputedKey(TENANT, 8, '2026-04-21', at)
    )
    expect(cascadeRecomputedKey(TENANT, 7, '2026-04-21', at)).not.toBe(
      cascadeRecomputedKey(TENANT, 7, '2026-04-22', at)
    )
  })

  it('a retry crossing the 5-minute boundary degrades to a distinct key (at-least-once duplicate, never a lost event)', () => {
    expect(cascadeRecomputedKey(TENANT, 7, '2026-04-21', new Date('2026-04-21T12:04:59Z'))).not.toBe(
      cascadeRecomputedKey(TENANT, 7, '2026-04-21', new Date('2026-04-21T12:05:00Z'))
    )
  })

  it('worker retry within the bucket produces the SAME key, written with skipDuplicates (ON CONFLICT DO NOTHING)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T12:32:00Z'))
    const event = makeEvent({ id: 1 })
    mp.event.findUnique.mockResolvedValue(event)
    tx.event.findMany.mockResolvedValue([event])

    await processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })
    vi.setSystemTime(new Date('2026-04-21T12:33:30Z')) // retry 90s later, same bucket
    await processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })

    const call1 = tx.outboxEvent.createMany.mock.calls[0][0]
    const call2 = tx.outboxEvent.createMany.mock.calls[1][0]
    expect(call1.data[0].idempotencyKey).toBe(`cascade.recomputed:${TENANT}:7:2026-04-21:2026-04-21T12:30`)
    expect(call2.data[0].idempotencyKey).toBe(call1.data[0].idempotencyKey)
    expect(call1.skipDuplicates).toBe(true)
    expect(call2.skipDuplicates).toBe(true)
  })
})

// ── TD-14: outbox write inside the engine transaction ───────────────────────

describe('cascade outbox write in the engine transaction (TD-14, ADR-001 pattern)', () => {
  it('worker path A runs ONE transaction: estimates + slot update + outbox commit together; socket push is post-commit fan-out', async () => {
    const event = makeEvent({ id: 1 })
    mp.event.findUnique.mockResolvedValue(event)
    tx.event.findMany.mockImplementation(async () => {
      callOrder.push('tx.event.findMany')
      return [event]
    })

    const result = await processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })
    expect(result).toEqual({ estimateCount: 1 })

    expect(callOrder).toEqual([
      'setTenantRLS',
      '$transaction', // ONE transaction — no separate outbox tx anymore
      'advisoryLock',
      'tx.event.findMany',
      'tx.cascadeEstimate.deleteMany',
      'tx.cascadeEstimate.createMany',
      'broadcastSlotBulkUpdate',
      'tx.outboxEvent.createMany', // in-tx (ADR-001)
      'socketioQueue.add', // post-commit, non-transactional client push
    ])
    expect(callOrder.filter(c => c === '$transaction')).toHaveLength(1)

    const outboxArg = tx.outboxEvent.createMany.mock.calls[0][0]
    expect(outboxArg.data[0]).toMatchObject({
      tenantId: TENANT,
      eventType: 'cascade.recomputed',
      aggregateType: 'Court',
      aggregateId: '7',
      payload: { courtId: 7, date: '2026-04-21', estimateCount: 1 },
      priority: 'NORMAL',
    })
  })

  it('outbox write failure now aborts the WHOLE engine transaction — no committed-estimates-without-fan-out window', async () => {
    const event = makeEvent({ id: 1 })
    mp.event.findUnique.mockResolvedValue(event)
    tx.event.findMany.mockResolvedValue([event])
    tx.outboxEvent.createMany.mockImplementation(async () => {
      callOrder.push('tx.outboxEvent.createMany')
      throw new Error('outbox boom')
    })

    await expect(processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })).rejects.toThrow('outbox boom')

    // The failure happened INSIDE the single transaction (estimates roll back
    // with it in Postgres), and the client push never fired.
    expect(callOrder.filter(c => c === '$transaction')).toHaveLength(1)
    expect(callOrder.indexOf('tx.outboxEvent.createMany')).toBeGreaterThan(callOrder.indexOf('$transaction'))
    expect(socketioQueue.add).not.toHaveBeenCalled()
  })

  it('an empty court still emits cascade.recomputed (estimateCount 0) — the relocation preserves the worker-level fan-out contract', async () => {
    const results = await runCascade(TENANT, 7, DATE)
    expect(results).toEqual([])
    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1)
    expect(tx.outboxEvent.createMany.mock.calls[0][0].data[0].payload).toMatchObject({
      courtId: 7,
      date: '2026-04-21',
      estimateCount: 0,
    })
  })
})

// ── Flag threading: env → worker → engine ───────────────────────────────────

describe('CASCADE_PREVIEW_PARITY threading (env read at the worker boundary, never inside pure code)', () => {
  function primeSingleEvent() {
    const event = makeEvent({ id: 1, startTimeBE: '20:00' })
    mp.event.findUnique.mockResolvedValue(event)
    tx.event.findMany.mockResolvedValue([event])
  }

  it('flag ON: the worker passes previewParity to the engine — estimates anchor at 20:00 with confidence 1.0', async () => {
    flagState.previewParity = true
    primeSingleEvent()

    await processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })

    const created = tx.cascadeEstimate.createMany.mock.calls[0][0].data[0]
    expect(created.estimatedStartUtc).toEqual(new Date('2026-04-21T20:00:00.000Z'))
    expect(created.confidenceScore).toBe(1)
  })

  it('flag OFF (default): characterized midnight anchor + 0.85 first-item confidence', async () => {
    primeSingleEvent()

    await processCascadeJob({ data: { tenantId: TENANT, eventId: 1 } })

    const created = tx.cascadeEstimate.createMany.mock.calls[0][0].data[0]
    expect(created.estimatedStartUtc).toEqual(new Date('2026-04-21T00:00:00.000Z'))
    expect(created.confidenceScore).toBe(0.85)
  })
})
