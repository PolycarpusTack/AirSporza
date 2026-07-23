/**
 * RC-5-T2 — /api/accessibility/config (admin GET/PUT) + the KPI consumer reading
 * targets via the tenant loader. supertest + mocked prisma (accessibility-routes
 * idiom). Asserts the fallback + override MECHANISM only — never that any value is
 * legally correct (TODO-KPI posture, AS-1).
 *
 * Covers: admin-only (403 non-admin on both verbs), tenant scoping from the auth
 * context (a client-supplied tenantId is REJECTED — TD-31 lesson), per-tenant
 * upsert (PUT retry-safe), field-level 400s (target outside 0–100, negative lead
 * time, unknown deliverable type key), audit on write, KPI fallback parity +
 * override. Fixtures are anonymised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => {
  const prismaMock: Record<string, unknown> = {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    event: { findFirst: vi.fn().mockResolvedValue(null) },
    accessibilityDeliverable: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    tenantAccessibilityConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    // PUT wraps read-previous + upsert in a transaction — run the callback on this same mock.
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prismaMock) : Promise.all(arg as Promise<unknown>[])
    ),
    $disconnect: vi.fn(),
  }
  return { prisma: prismaMock }
})

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown; headers: Record<string, unknown> }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: (req.headers['x-test-role'] as string) || 'admin' }
    next()
  },
  authorize: (...roles: string[]) =>
    (req: { user?: { role?: string } }, res: { status: (c: number) => { json: (b: unknown) => void } }, next: () => void) => {
      if (!req.user?.role || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' })
      next()
    },
}))

vi.mock('../src/import/services/ImportSchemaService.js', () => ({
  ensureImportSchemaReady: vi.fn().mockResolvedValue(undefined),
  normalizeImportSchemaError: (e: unknown) => e,
}))

import { buildApp } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'
import {
  T888_EXCLUDED_SPORT_IDS,
  ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE,
  ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS,
} from '../src/config/accessibility.js'

const app = buildApp()
const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

/** A stored config row (per-tenant override) as prisma returns it. */
const storedRow = {
  id: 1,
  tenantId: 'tenant-1',
  t888ExcludedSportIds: [7, 9],
  kpiTargetPctByType: { T888: 90 },
  unplannedLeadTimeDays: 30,
  updatedBy: 'u1',
  createdAt: new Date('2026-07-23T00:00:00.000Z'),
  updatedAt: new Date('2026-07-23T00:00:00.000Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.tenantAccessibilityConfig.findUnique.mockResolvedValue(null)
  mp.tenantAccessibilityConfig.upsert.mockResolvedValue(storedRow)
  mp.accessibilityDeliverable.findMany.mockResolvedValue([])
})

describe('GET /api/accessibility/config', () => {
  it('no row → effective config IS the constants (fallback parity), override null', async () => {
    const res = await request(app).get('/api/accessibility/config').expect(200)
    expect(res.body).toEqual({
      effective: {
        t888ExcludedSportIds: [...T888_EXCLUDED_SPORT_IDS].sort((a, b) => a - b),
        kpiTargetPctByType: ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE,
        unplannedLeadTimeDays: ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS,
      },
      override: null,
    })
    // Tenant-scoped from the auth context:
    expect(mp.tenantAccessibilityConfig.findUnique.mock.calls[0][0]).toEqual({ where: { tenantId: 'tenant-1' } })
  })

  it('with a row → effective merges per field; override exposes the raw stored fields', async () => {
    mp.tenantAccessibilityConfig.findUnique.mockResolvedValue(storedRow)
    const res = await request(app).get('/api/accessibility/config').expect(200)
    expect(res.body.effective).toEqual({
      t888ExcludedSportIds: [7, 9],
      kpiTargetPctByType: { ...ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE, T888: 90 },
      unplannedLeadTimeDays: 30,
    })
    expect(res.body.override).toEqual({
      t888ExcludedSportIds: [7, 9],
      kpiTargetPctByType: { T888: 90 },
      unplannedLeadTimeDays: 30,
    })
  })

  it('403 for a non-admin (admin config endpoint)', async () => {
    await request(app).get('/api/accessibility/config').set('x-test-role', 'planner').expect(403)
    expect(mp.tenantAccessibilityConfig.findUnique).not.toHaveBeenCalled()
  })
})

describe('PUT /api/accessibility/config', () => {
  const fullBody = { t888ExcludedSportIds: [7, 9], kpiTargetPctByType: { T888: 90 }, unplannedLeadTimeDays: 30 }

  it('upserts the row scoped to the AUTH-CONTEXT tenant (never the body)', async () => {
    await request(app).put('/api/accessibility/config').send(fullBody).expect(200)

    const call = mp.tenantAccessibilityConfig.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ tenantId: 'tenant-1' })
    expect(call.create).toMatchObject({ tenantId: 'tenant-1', unplannedLeadTimeDays: 30, updatedBy: 'u1' })
    expect(call.create.t888ExcludedSportIds).toEqual([7, 9])
    expect(call.create.kpiTargetPctByType).toEqual({ T888: 90 })
    expect(call.update).toMatchObject({ unplannedLeadTimeDays: 30, updatedBy: 'u1' })
  })

  it('response round-trips the stored state: effective + override (mirrors GET)', async () => {
    const res = await request(app).put('/api/accessibility/config').send(fullBody).expect(200)

    expect(res.body.effective.unplannedLeadTimeDays).toBe(30)
    expect(res.body.override).toEqual({
      t888ExcludedSportIds: [7, 9],
      kpiTargetPctByType: { T888: 90 },
      unplannedLeadTimeDays: 30,
    })
  })

  it('audits the write (entityType-prefixed action, house convention)', async () => {
    await request(app).put('/api/accessibility/config').send(fullBody).expect(200)

    expect(mp.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'tenantAccessibilityConfig.update',
      entityType: 'tenantAccessibilityConfig',
      userId: 'u1',
      tenantId: 'tenant-1',
    })
  })

  it('accepts the INCLUSIVE boundaries — target 0 and lead time 0 survive to the row (no ??-eats-zero)', async () => {
    mp.tenantAccessibilityConfig.upsert.mockResolvedValue({
      ...storedRow,
      t888ExcludedSportIds: null,
      kpiTargetPctByType: { T888: 0 },
      unplannedLeadTimeDays: 0,
    })
    const res = await request(app)
      .put('/api/accessibility/config')
      .send({ kpiTargetPctByType: { T888: 0 }, unplannedLeadTimeDays: 0 })
      .expect(200)

    const call = mp.tenantAccessibilityConfig.upsert.mock.calls[0][0]
    expect(call.create.kpiTargetPctByType).toEqual({ T888: 0 })
    expect(call.create.unplannedLeadTimeDays).toBe(0)
    expect(res.body.override.kpiTargetPctByType).toEqual({ T888: 0 })
    expect(res.body.override.unplannedLeadTimeDays).toBe(0)
  })

  it('accepts the upper boundary — target 100 is valid', async () => {
    await request(app).put('/api/accessibility/config').send({ kpiTargetPctByType: { T888: 100 } }).expect(200)
    expect(mp.tenantAccessibilityConfig.upsert).toHaveBeenCalledTimes(1)
  })

  it('a repeat of the same PUT is another clean upsert (no 409 — PUT semantics)', async () => {
    await request(app).put('/api/accessibility/config').send({ unplannedLeadTimeDays: 30 }).expect(200)
    await request(app).put('/api/accessibility/config').send({ unplannedLeadTimeDays: 30 }).expect(200)
    expect(mp.tenantAccessibilityConfig.upsert).toHaveBeenCalledTimes(2)
  })

  it('omitted fields are stored as NULL (clear-to-fallback: PUT replaces the whole override)', async () => {
    mp.tenantAccessibilityConfig.upsert.mockResolvedValue({ ...storedRow, t888ExcludedSportIds: null, kpiTargetPctByType: null })
    const res = await request(app).put('/api/accessibility/config').send({ unplannedLeadTimeDays: 30 }).expect(200)
    // NULL stored fields fall back to their constants in the effective view:
    expect(res.body.effective.kpiTargetPctByType).toEqual(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE)
    expect(res.body.effective.t888ExcludedSportIds).toEqual([...T888_EXCLUDED_SPORT_IDS].sort((a, b) => a - b))
  })

  it('403 for a non-admin', async () => {
    await request(app).put('/api/accessibility/config').set('x-test-role', 'planner').send({ unplannedLeadTimeDays: 5 }).expect(403)
    expect(mp.tenantAccessibilityConfig.upsert).not.toHaveBeenCalled()
  })

  it('400 with field-level detail: KPI target above 100', async () => {
    const res = await request(app)
      .put('/api/accessibility/config')
      .send({ kpiTargetPctByType: { T888: 101 } })
      .expect(400)
    expect(res.body.error).toBe('Validation failed')
    expect(JSON.stringify(res.body.details)).toContain('kpiTargetPctByType')
    expect(mp.tenantAccessibilityConfig.upsert).not.toHaveBeenCalled()
  })

  it('400: KPI target below 0', async () => {
    await request(app).put('/api/accessibility/config').send({ kpiTargetPctByType: { VGT: -1 } }).expect(400)
    expect(mp.tenantAccessibilityConfig.upsert).not.toHaveBeenCalled()
  })

  it('400 with field-level detail: unknown deliverable type key', async () => {
    const res = await request(app)
      .put('/api/accessibility/config')
      .send({ kpiTargetPctByType: { SIGNING_XL: 50 } })
      .expect(400)
    expect(JSON.stringify(res.body.details)).toContain('SIGNING_XL')
    expect(mp.tenantAccessibilityConfig.upsert).not.toHaveBeenCalled()
  })

  it('400: negative lead time', async () => {
    const res = await request(app).put('/api/accessibility/config').send({ unplannedLeadTimeDays: -1 }).expect(400)
    expect(JSON.stringify(res.body.details)).toContain('unplannedLeadTimeDays')
    expect(mp.tenantAccessibilityConfig.upsert).not.toHaveBeenCalled()
  })

  it('400: non-positive sport id in the exclusion set', async () => {
    await request(app).put('/api/accessibility/config').send({ t888ExcludedSportIds: [0] }).expect(400)
    expect(mp.tenantAccessibilityConfig.upsert).not.toHaveBeenCalled()
  })

  it('400: a client-supplied tenantId is REJECTED outright (tenant comes from auth context only)', async () => {
    await request(app)
      .put('/api/accessibility/config')
      .send({ tenantId: 'tenant-2', unplannedLeadTimeDays: 5 })
      .expect(400)
    expect(mp.tenantAccessibilityConfig.upsert).not.toHaveBeenCalled()
  })
})

describe('GET /api/accessibility/kpi — targets read via the tenant loader (consumer wiring)', () => {
  const kpiRows = [
    { type: 'T888', status: 'DELIVERED' },
    { type: 'T888', status: 'REQUIRED' },
  ]

  it('no config row → targetPct comes from the constants (fallback parity, byte-identical to today)', async () => {
    mp.accessibilityDeliverable.findMany.mockResolvedValue(kpiRows)
    const res = await request(app).get('/api/accessibility/kpi?from=2026-01-01&to=2026-12-31').expect(200)
    const t888 = res.body.byType.find((e: { type: string }) => e.type === 'T888')
    expect(t888.targetPct).toBe(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE.T888)
  })

  it('config row with a T888 target → the tenant target is reported; other types keep their constants', async () => {
    mp.tenantAccessibilityConfig.findUnique.mockResolvedValue(storedRow) // T888: 90
    mp.accessibilityDeliverable.findMany.mockResolvedValue(kpiRows)
    const res = await request(app).get('/api/accessibility/kpi?from=2026-01-01&to=2026-12-31').expect(200)
    const byType = Object.fromEntries(res.body.byType.map((e: { type: string; targetPct: number | null }) => [e.type, e.targetPct]))
    expect(byType.T888).toBe(90)
    expect(byType.AUDIO_DESCRIPTION).toBe(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE.AUDIO_DESCRIPTION)
    expect(byType.VGT).toBe(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE.VGT)
    // Loaded for THIS tenant (auth context):
    expect(mp.tenantAccessibilityConfig.findUnique.mock.calls[0][0]).toEqual({ where: { tenantId: 'tenant-1' } })
  })
})
