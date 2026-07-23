/**
 * RC-5-T2 — stage-4 ACCESSIBILITY_UNPLANNED lead time is read via the tenant
 * config loader at the schedules route boundary (flag ON path). supertest +
 * mocked prisma (scheduleDraftValidation-rights idiom) with the regulatory flag
 * pinned ON via the env proxy (cascade-engine idiom) — Repeatable regardless of
 * shell env.
 *
 * Mechanism pins:
 *  - no config row → the constant lead time applies (fallback parity: an event
 *    just BEYOND the constant horizon does NOT warn);
 *  - tenant row with a longer lead time → the SAME event now warns (override
 *    respected in the stage-4 consumer);
 *  - the config is loaded for the request tenant (auth context).
 * Never asserts that any lead-time VALUE is operationally correct: all offsets
 * are DERIVED from the constant (fallback case) / the injected override value —
 * an ops retune of the constant cannot silently break this suite. The clock is
 * pinned via fake Date + setSystemTime (fixed-date posture of the routes suites);
 * only `Date` is faked so real timers keep serving the in-process HTTP round-trip.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import request from 'supertest'

// Pin the flags regardless of the shell/CI environment: regulatory ON (this suite
// tests the gated stage-4 wiring), rights windows OFF (out of scope here).
vi.mock('../src/config/env.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/config/env.js')>()
  return {
    ...mod,
    env: new Proxy(mod.env, {
      get(target, prop, receiver) {
        if (prop === 'REGULATORY_COMPLIANCE_ENABLED') return true
        if (prop === 'RIGHTS_WINDOWS_ENABLED') return false
        return Reflect.get(target, prop, receiver)
      },
    }),
  }
})

vi.mock('../src/db/prisma.js', () => {
  const prismaMock: Record<string, unknown> = {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    scheduleDraft: { findFirst: vi.fn() },
    broadcastSlot: { findMany: vi.fn() },
    contract: { findMany: vi.fn().mockResolvedValue([]) },
    accessibilityDeliverable: { findMany: vi.fn().mockResolvedValue([]) },
    tenantAccessibilityConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prismaMock) : Promise.all(arg as Promise<unknown>[])
    ),
    $disconnect: vi.fn(),
  }
  return { prisma: prismaMock }
})

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: 'planner' }
    next()
  },
  authorize: (..._roles: string[]) => (_: unknown, __: unknown, next: () => void) => next(),
}))

import { buildApp } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'
import { ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS } from '../src/config/accessibility.js'

const app = buildApp()
const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const DAY_MS = 24 * 60 * 60 * 1000
const FIXED_NOW = new Date('2026-08-01T12:00:00.000Z')

// DERIVED offsets (never literals racing the ops-tunable constant): the slot sits
// MARGIN days BEYOND the constant horizon (→ no warning on the fallback path), and
// the tenant override extends the horizon MARGIN days past the slot (→ warning).
const MARGIN_DAYS = 6
const SLOT_OFFSET_DAYS = ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS + MARGIN_DAYS
const OVERRIDE_LEAD_TIME_DAYS = SLOT_OFFSET_DAYS + MARGIN_DAYS
const startUtc = new Date(FIXED_NOW.getTime() + SLOT_OFFSET_DAYS * DAY_MS)

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXED_NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

const draft = {
  id: 'draft-1',
  tenantId: 'tenant-1',
  channelId: 1,
  dateRangeStart: startUtc,
  dateRangeEnd: startUtc,
  operations: [],
  version: 1,
  status: 'EDITING',
}

const slot = {
  id: 'slot-1',
  tenantId: 'tenant-1',
  channelId: 1,
  eventId: 100,
  contentSegment: 'FULL',
  schedulingMode: 'FIXED',
  plannedStartUtc: startUtc,
  plannedEndUtc: new Date(startUtc.getTime() + 2 * 60 * 60 * 1000),
  sportMetadata: {},
  event: { id: 100, competitionId: 10, isLive: false, listedCategoryId: null, listedCategory: null },
}

async function validateDraft() {
  const res = await request(app).post('/api/schedule-drafts/draft-1/validate').send({})
  expect(res.status).toBe(200)
  return res.body.results as Array<{ code: string }>
}

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.scheduleDraft.findFirst.mockResolvedValue(draft)
  mp.broadcastSlot.findMany.mockResolvedValue([slot])
  mp.contract.findMany.mockResolvedValue([])
  mp.tenantAccessibilityConfig.findUnique.mockResolvedValue(null)
  // The event has a REQUIRED T888 deliverable not yet planned:
  mp.accessibilityDeliverable.findMany.mockResolvedValue([
    { eventId: 100, type: 'T888', status: 'REQUIRED' },
  ])
})

describe('RC-5-T2: stage-4 lead time via tenant config (flag ON)', () => {
  it('no config row → constant lead time applies: a slot BEYOND the constant horizon does NOT warn (fallback parity)', async () => {
    const results = await validateDraft()
    expect(results.map(r => r.code)).not.toContain('ACCESSIBILITY_UNPLANNED')
    // The loader WAS consulted for the request tenant (wiring exists, fallback chosen):
    expect(mp.tenantAccessibilityConfig.findUnique.mock.calls[0][0]).toEqual({ where: { tenantId: 'tenant-1' } })
  })

  it('tenant row with a lead time past the slot → the SAME slot now warns (override respected)', async () => {
    mp.tenantAccessibilityConfig.findUnique.mockResolvedValue({
      id: 1,
      tenantId: 'tenant-1',
      t888ExcludedSportIds: null,
      kpiTargetPctByType: null,
      unplannedLeadTimeDays: OVERRIDE_LEAD_TIME_DAYS,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const results = await validateDraft()
    expect(results.map(r => r.code)).toContain('ACCESSIBILITY_UNPLANNED')
  })
})
