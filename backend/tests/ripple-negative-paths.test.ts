/**
 * SV-2-T2 — negative-path pins with `SCHEDULE_RIPPLE_ENABLED` **ON** (ADR-019 §2):
 *
 *  - MANUAL (`PUT /events/:id`) stays byte-identical: the deliberate human edit
 *    auto-syncs via eventSlotBridge exactly as today and NEVER produces a
 *    RippleProposal.
 *  - CASCADE (`runCascade`) stays byte-identical: writes `estimated*` slot
 *    fields only (never `planned*`) and NEVER produces a RippleProposal.
 *
 * The `RippleSource` enum ships CASCADE|MANUAL values that SV-2 must never
 * produce — these tests pin both paths so a future wiring mistake fails loudly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

// Flag ON for the whole file — the point is that these paths ignore it.
vi.mock('../src/config/env.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/config/env.js')>()
  return {
    ...mod,
    env: new Proxy(mod.env, {
      get(target, prop, receiver) {
        if (prop === 'SCHEDULE_RIPPLE_ENABLED') return true
        // Cascade parity flag pinned OFF: this file pins TODAY'S cascade write
        // set, independent of the shell/CI environment.
        if (prop === 'CASCADE_PREVIEW_PARITY') return false
        return Reflect.get(target, prop, receiver)
      },
    }),
  }
})

const { rippleSpies } = vi.hoisted(() => ({
  rippleSpies: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}))

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    event: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    customFieldValue: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    rippleProposal: rippleSpies,
    broadcastSlot: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn(),
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: 'admin' }
    next()
  },
  authorize: (..._roles: string[]) => (_: unknown, __: unknown, next: () => void) => next(),
}))

vi.mock('../src/services/notificationService.js', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/import/services/ImportSchemaService.js', () => ({
  ensureImportSchemaReady: vi.fn().mockResolvedValue(undefined),
  normalizeImportSchemaError: (e: unknown) => e,
}))

// MANUAL pin: the bridge is mocked so we can assert the auto-sync CALL happens
// (behavior preserved) without exercising its SQL.
vi.mock('../src/services/eventSlotBridge.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/services/eventSlotBridge.js')>()
  return {
    ...actual,
    shouldSync: vi.fn().mockReturnValue(true),
    syncEventToSlot: vi.fn().mockResolvedValue(undefined),
    unlinkEventSlot: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { buildApp } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'
import { syncEventToSlot } from '../src/services/eventSlotBridge.js'
import { runCascade } from '../src/services/cascade/engine.js'

const app = buildApp()
const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
  $transaction: ReturnType<typeof vi.fn>
  $executeRaw: ReturnType<typeof vi.fn>
}

const TENANT = '00000000-0000-4000-8000-0000000000aa'

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
})

describe('SV-2-T2 MANUAL path (PUT /events/:id) — byte-identical with the flag ON', () => {
  it('auto-syncs via eventSlotBridge as today and creates NO RippleProposal', async () => {
    const existing = {
      id: 1, sportId: 1, competitionId: 1, participants: 'Old', tenantId: 'tenant-1',
      channelId: 3, startDateBE: new Date('2026-08-01'), startTimeBE: '20:00',
    }
    const updated = {
      ...existing,
      startTimeBE: '21:15',
      customFields: {},
      sport: { id: 1, name: 'Football' },
      competition: { id: 1, name: 'Pro League' },
      channel: { id: 3, name: 'One', color: null, types: [], timezone: 'Europe/Brussels' },
    }

    mp.event.findFirst.mockResolvedValue(existing)
    const txRipple = { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() }
    mp.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        event: { update: vi.fn().mockResolvedValue(updated) },
        customFieldValue: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          upsert: vi.fn().mockResolvedValue({}),
        },
        outboxEvent: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        rippleProposal: txRipple,
      })
    })

    await request(app)
      .put('/api/events/1')
      .send({
        sportId: 1,
        competitionId: 1,
        participants: 'Old',
        startDateBE: '2026-08-01',
        startTimeBE: '21:15',
        isLive: false,
        isDelayedLive: false,
      })
      .expect(200)

    // The deliberate human edit IS the review — auto-sync unchanged, invoked
    // with the UPDATED row (new startTimeBE) on the route's own tx client:
    expect(syncEventToSlot).toHaveBeenCalledTimes(1)
    const [syncedEvent, syncedDb] = (syncEventToSlot as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(syncedEvent).toMatchObject({ id: 1, startTimeBE: '21:15', channelId: 3 })
    expect(syncedDb).toBeDefined()
    expect(syncedDb).not.toBe(prisma) // tx client, not the root client
    // …and no proposal machinery is touched, in or out of the tx:
    expect(txRipple.create).not.toHaveBeenCalled()
    expect(txRipple.updateMany).not.toHaveBeenCalled()
    expect(txRipple.findFirst).not.toHaveBeenCalled()
    expect(rippleSpies.create).not.toHaveBeenCalled()
    expect(rippleSpies.updateMany).not.toHaveBeenCalled()
  })
})

describe('SV-2-T2 CASCADE path (runCascade) — byte-identical with the flag ON', () => {
  it('writes estimated* slot fields only and creates NO RippleProposal', async () => {
    const capturedSql: string[] = []
    const txRipple = { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() }
    const tx = {
      $executeRaw: vi.fn(async (...args: unknown[]) => {
        const first = args[0] as { sql?: string } | string[]
        capturedSql.push(Array.isArray(first) ? first.join('?') : String(first?.sql ?? ''))
        return 1
      }),
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            tenantId: TENANT,
            status: 'approved',
            startDateBE: new Date('2026-04-21'),
            startTimeBE: '20:00',
            durationMin: 100,
            sportMetadata: { court_id: 7, order_on_court: 1 },
            sport: null,
            phase: null,
          },
        ]),
      },
      broadcastSlot: { findMany: vi.fn().mockResolvedValue([]) },
      cascadeEstimate: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      rippleProposal: txRipple,
    }
    mp.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))

    const results = await runCascade(TENANT, 7, new Date('2026-04-21'))
    expect(results).toHaveLength(1)

    // The slot write touches estimated*/earliest/latest ONLY — never planned*:
    const slotUpdate = capturedSql.find((s) => s.includes('UPDATE "BroadcastSlot"'))
    expect(slotUpdate).toBeTruthy()
    expect(slotUpdate).toContain('"estimatedStartUtc"')
    expect(slotUpdate).not.toContain('"plannedStartUtc"')
    expect(slotUpdate).not.toContain('"plannedEndUtc"')

    // No proposal machinery, flag notwithstanding:
    expect(txRipple.create).not.toHaveBeenCalled()
    expect(txRipple.updateMany).not.toHaveBeenCalled()
    expect(txRipple.findFirst).not.toHaveBeenCalled()
    expect(rippleSpies.create).not.toHaveBeenCalled()
  })
})
