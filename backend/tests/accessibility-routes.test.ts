/**
 * RC-2-T2 — /api/accessibility routes. supertest + mocked prisma (listedEvents-routes
 * idiom). Covers: tenant-scoped list, setRequirement (AD/VGT toggle, T888 policy
 * rejection, in-flight 409, legacy-row upsert), transition with the optimistic
 * expected-current-status guard (409 + allowedNext body → retry-safe), audit on every
 * status write, KPI endpoint wiring (tenant + period filter, config-read target).
 *
 * Fixtures are anonymised (no real person names — AS test-data rule).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    event: { findFirst: vi.fn().mockResolvedValue(null) },
    accessibilityDeliverable: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn(),
  },
}))

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
import { ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE } from '../src/config/accessibility.js'

const app = buildApp()
const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const event = { id: 10, tenantId: 'tenant-1', sportId: 1, competitionId: 100 }
const adRow = { id: 1, tenantId: 'tenant-1', eventId: 10, type: 'AUDIO_DESCRIPTION', status: 'NOT_REQUIRED', updatedBy: null }
const t888Row = { id: 2, tenantId: 'tenant-1', eventId: 10, type: 'T888', status: 'REQUIRED', updatedBy: null }

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.event.findFirst.mockResolvedValue(null)
  mp.accessibilityDeliverable.findMany.mockResolvedValue([])
  mp.accessibilityDeliverable.findFirst.mockResolvedValue(null)
})

describe('GET /api/accessibility/events/:eventId/deliverables', () => {
  it('lists the event deliverables, tenant-scoped on BOTH the event guard and the rows', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    mp.accessibilityDeliverable.findMany.mockResolvedValue([t888Row, adRow])
    const res = await request(app).get('/api/accessibility/events/10/deliverables').expect(200)
    expect(res.body).toHaveLength(2)
    expect(mp.event.findFirst.mock.calls[0][0].where).toMatchObject({ id: 10, tenantId: 'tenant-1' })
    expect(mp.accessibilityDeliverable.findMany.mock.calls[0][0].where).toMatchObject({ eventId: 10, tenantId: 'tenant-1' })
  })

  it('404s for an event not in the tenant', async () => {
    mp.event.findFirst.mockResolvedValue(null)
    await request(app).get('/api/accessibility/events/999/deliverables').expect(404)
    expect(mp.accessibilityDeliverable.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/accessibility/events/:eventId/requirement (setRequirement)', () => {
  it('toggles AD NOT_REQUIRED → REQUIRED, stamps updatedBy, and audits', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    mp.accessibilityDeliverable.findFirst.mockResolvedValue(adRow)
    mp.accessibilityDeliverable.update.mockResolvedValue({ ...adRow, status: 'REQUIRED', updatedBy: 'u1' })
    const res = await request(app)
      .post('/api/accessibility/events/10/requirement')
      .send({ type: 'AUDIO_DESCRIPTION', required: true })
      .expect(200)
    expect(res.body.status).toBe('REQUIRED')
    expect(mp.accessibilityDeliverable.update.mock.calls[0][0]).toEqual({
      where: { id: 1 },
      data: { status: 'REQUIRED', updatedBy: 'u1' },
    })
    expect(mp.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'accessibilityDeliverable.setRequirement',
      entityType: 'accessibilityDeliverable',
      entityId: '1',
      userId: 'u1',
      tenantId: 'tenant-1',
    })
  })

  it('toggles VGT REQUIRED → NOT_REQUIRED', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    mp.accessibilityDeliverable.findFirst.mockResolvedValue({ ...adRow, id: 3, type: 'VGT', status: 'REQUIRED' })
    mp.accessibilityDeliverable.update.mockResolvedValue({ ...adRow, id: 3, type: 'VGT', status: 'NOT_REQUIRED', updatedBy: 'u1' })
    const res = await request(app)
      .post('/api/accessibility/events/10/requirement')
      .send({ type: 'VGT', required: false })
      .expect(200)
    expect(res.body.status).toBe('NOT_REQUIRED')
  })

  it('rejects T888 with 400 — its requirement is config policy, not per-event (AS-1)', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    await request(app)
      .post('/api/accessibility/events/10/requirement')
      .send({ type: 'T888', required: false })
      .expect(400)
    expect(mp.accessibilityDeliverable.update).not.toHaveBeenCalled()
    expect(mp.accessibilityDeliverable.create).not.toHaveBeenCalled()
    expect(mp.auditLog.create).not.toHaveBeenCalled()
  })

  it('409s when un-requiring an in-flight deliverable (PLANNED) — body carries currentStatus + allowedNext', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    mp.accessibilityDeliverable.findFirst.mockResolvedValue({ ...adRow, status: 'PLANNED' })
    const res = await request(app)
      .post('/api/accessibility/events/10/requirement')
      .send({ type: 'AUDIO_DESCRIPTION', required: false })
      .expect(409)
    expect(res.body.currentStatus).toBe('PLANNED')
    expect(res.body.allowedNext).toEqual(['CONFIRMED'])
    expect(mp.accessibilityDeliverable.update).not.toHaveBeenCalled()
    expect(mp.auditLog.create).not.toHaveBeenCalled()
  })

  it('required=true on an in-flight deliverable is an idempotent 200 no-op (already required-or-beyond)', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    mp.accessibilityDeliverable.findFirst.mockResolvedValue({ ...adRow, status: 'PLANNED' })
    const res = await request(app)
      .post('/api/accessibility/events/10/requirement')
      .send({ type: 'AUDIO_DESCRIPTION', required: true })
      .expect(200)
    expect(res.body.status).toBe('PLANNED')
    expect(mp.accessibilityDeliverable.update).not.toHaveBeenCalled()
    expect(mp.auditLog.create).not.toHaveBeenCalled()
  })

  it('repeat of the same toggle is an idempotent 200 no-op (no write, retry-safe)', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    mp.accessibilityDeliverable.findFirst.mockResolvedValue({ ...adRow, status: 'REQUIRED' })
    const res = await request(app)
      .post('/api/accessibility/events/10/requirement')
      .send({ type: 'AUDIO_DESCRIPTION', required: true })
      .expect(200)
    expect(res.body.status).toBe('REQUIRED')
    expect(mp.accessibilityDeliverable.update).not.toHaveBeenCalled()
    expect(mp.auditLog.create).not.toHaveBeenCalled()
  })

  it('creates the row when missing (legacy pre-RC-2 event) — upsert semantics, tenant-stamped', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    mp.accessibilityDeliverable.findFirst.mockResolvedValue(null)
    mp.accessibilityDeliverable.create.mockResolvedValue({ ...adRow, id: 9, status: 'REQUIRED', updatedBy: 'u1' })
    const res = await request(app)
      .post('/api/accessibility/events/10/requirement')
      .send({ type: 'AUDIO_DESCRIPTION', required: true })
      .expect(200)
    expect(res.body.status).toBe('REQUIRED')
    expect(mp.accessibilityDeliverable.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant-1',
      eventId: 10,
      type: 'AUDIO_DESCRIPTION',
      status: 'REQUIRED',
      updatedBy: 'u1',
    })
    // the create path audits too (oldStatus is the implicit NOT_REQUIRED)
    expect(mp.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'accessibilityDeliverable.setRequirement',
      entityId: '9',
      oldValue: { status: 'NOT_REQUIRED' },
      newValue: { status: 'REQUIRED' },
    })
  })

  it('404s for an event not in the tenant', async () => {
    mp.event.findFirst.mockResolvedValue(null)
    await request(app)
      .post('/api/accessibility/events/999/requirement')
      .send({ type: 'VGT', required: true })
      .expect(404)
  })

  it('rejects a role outside planner/admin', async () => {
    await request(app)
      .post('/api/accessibility/events/10/requirement')
      .set('x-test-role', 'sports')
      .send({ type: 'VGT', required: true })
      .expect(403)
  })
})

describe('POST /api/accessibility/deliverables/:id/transition', () => {
  it('walks REQUIRED → PLANNED when expectedStatus matches; stamps updatedBy; audits old→new', async () => {
    mp.accessibilityDeliverable.findFirst.mockResolvedValue(t888Row)
    mp.accessibilityDeliverable.update.mockResolvedValue({ ...t888Row, status: 'PLANNED', updatedBy: 'u1' })
    const res = await request(app)
      .post('/api/accessibility/deliverables/2/transition')
      .send({ status: 'PLANNED', expectedStatus: 'REQUIRED' })
      .expect(200)
    expect(res.body.status).toBe('PLANNED')
    expect(mp.accessibilityDeliverable.findFirst.mock.calls[0][0].where).toMatchObject({ id: 2, tenantId: 'tenant-1' })
    expect(mp.accessibilityDeliverable.update.mock.calls[0][0]).toEqual({
      where: { id: 2 },
      data: { status: 'PLANNED', updatedBy: 'u1' },
    })
    expect(mp.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'accessibilityDeliverable.transition',
      entityType: 'accessibilityDeliverable',
      entityId: '2',
      userId: 'u1',
      tenantId: 'tenant-1',
      oldValue: { status: 'REQUIRED' },
      newValue: { status: 'PLANNED' },
    })
  })

  it('409s on expectedStatus mismatch (optimistic guard) with currentStatus + allowedNext — retry-safe', async () => {
    // a retry after a successful REQUIRED→PLANNED finds the row already PLANNED
    mp.accessibilityDeliverable.findFirst.mockResolvedValue({ ...t888Row, status: 'PLANNED' })
    const res = await request(app)
      .post('/api/accessibility/deliverables/2/transition')
      .send({ status: 'PLANNED', expectedStatus: 'REQUIRED' })
      .expect(409)
    expect(res.body.currentStatus).toBe('PLANNED')
    expect(res.body.allowedNext).toEqual(['CONFIRMED'])
    expect(mp.accessibilityDeliverable.update).not.toHaveBeenCalled()
    expect(mp.auditLog.create).not.toHaveBeenCalled()
  })

  it('409s on a state skip (REQUIRED → CONFIRMED) with the allowed set', async () => {
    mp.accessibilityDeliverable.findFirst.mockResolvedValue(t888Row)
    const res = await request(app)
      .post('/api/accessibility/deliverables/2/transition')
      .send({ status: 'CONFIRMED', expectedStatus: 'REQUIRED' })
      .expect(409)
    expect(res.body.currentStatus).toBe('REQUIRED')
    expect(res.body.allowedNext).toEqual(['NOT_REQUIRED', 'PLANNED'])
    expect(mp.accessibilityDeliverable.update).not.toHaveBeenCalled()
    expect(mp.auditLog.create).not.toHaveBeenCalled()
  })

  it('409s on a backward step (DELIVERED is terminal)', async () => {
    mp.accessibilityDeliverable.findFirst.mockResolvedValue({ ...t888Row, status: 'DELIVERED' })
    const res = await request(app)
      .post('/api/accessibility/deliverables/2/transition')
      .send({ status: 'CONFIRMED', expectedStatus: 'DELIVERED' })
      .expect(409)
    expect(res.body.allowedNext).toEqual([])
    expect(mp.auditLog.create).not.toHaveBeenCalled()
  })

  it('rejects a T888 requirement toggle via transition with 400 (config policy, both doors closed)', async () => {
    mp.accessibilityDeliverable.findFirst.mockResolvedValue(t888Row) // REQUIRED
    await request(app)
      .post('/api/accessibility/deliverables/2/transition')
      .send({ status: 'NOT_REQUIRED', expectedStatus: 'REQUIRED' })
      .expect(400)
    expect(mp.accessibilityDeliverable.update).not.toHaveBeenCalled()
    expect(mp.auditLog.create).not.toHaveBeenCalled()
  })

  it('allows an AD/VGT requirement toggle via transition (machine-legal step)', async () => {
    mp.accessibilityDeliverable.findFirst.mockResolvedValue({ ...adRow, status: 'REQUIRED' })
    mp.accessibilityDeliverable.update.mockResolvedValue({ ...adRow, status: 'NOT_REQUIRED', updatedBy: 'u1' })
    const res = await request(app)
      .post('/api/accessibility/deliverables/1/transition')
      .send({ status: 'NOT_REQUIRED', expectedStatus: 'REQUIRED' })
      .expect(200)
    expect(res.body.status).toBe('NOT_REQUIRED')
  })

  it('404s for a deliverable not in the tenant (isolation)', async () => {
    mp.accessibilityDeliverable.findFirst.mockResolvedValue(null)
    await request(app)
      .post('/api/accessibility/deliverables/999/transition')
      .send({ status: 'PLANNED', expectedStatus: 'REQUIRED' })
      .expect(404)
    expect(mp.accessibilityDeliverable.findFirst.mock.calls[0][0].where).toMatchObject({ id: 999, tenantId: 'tenant-1' })
  })

  it('400s when expectedStatus is missing (the guard is mandatory)', async () => {
    mp.accessibilityDeliverable.findFirst.mockResolvedValue(t888Row)
    await request(app)
      .post('/api/accessibility/deliverables/2/transition')
      .send({ status: 'PLANNED' })
      .expect(400)
  })

  it('rejects a role outside planner/admin', async () => {
    await request(app)
      .post('/api/accessibility/deliverables/2/transition')
      .set('x-test-role', 'viewer')
      .send({ status: 'PLANNED', expectedStatus: 'REQUIRED' })
      .expect(403)
  })
})

describe('GET /api/accessibility/kpi', () => {
  it('aggregates the tenant rows in the period; target comes from CONFIG (never a literal)', async () => {
    mp.accessibilityDeliverable.findMany.mockResolvedValue([
      { type: 'T888', status: 'DELIVERED' },
      { type: 'T888', status: 'REQUIRED' },
      { type: 'AUDIO_DESCRIPTION', status: 'NOT_REQUIRED' },
    ])
    const res = await request(app)
      .get('/api/accessibility/kpi?from=2026-06-01&to=2026-06-30')
      .expect(200)

    // tenant + period filter on the raw query
    const where = mp.accessibilityDeliverable.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('tenant-1')
    expect(where.event.startDateBE.gte).toEqual(new Date('2026-06-01'))
    expect(where.event.startDateBE.lte).toEqual(new Date('2026-06-30'))

    const byType = Object.fromEntries(
      (res.body.byType as Array<{ type: string; total: number; requiredCount: number; deliveredCount: number; coveragePct: number | null; targetPct: number | null }>)
        .map(e => [e.type, e]),
    )
    // reconciles 1:1 with the mocked raw rows
    expect(byType.T888).toMatchObject({ total: 2, requiredCount: 2, deliveredCount: 1, coveragePct: 50 })
    expect(byType.AUDIO_DESCRIPTION).toMatchObject({ total: 1, requiredCount: 0, deliveredCount: 0, coveragePct: null })
    expect(byType.VGT).toMatchObject({ total: 0, requiredCount: 0, deliveredCount: 0, coveragePct: null })
    // AS-1 mechanism: target mirrors the config value, whatever it is
    for (const e of res.body.byType as Array<{ type: 'T888' | 'AUDIO_DESCRIPTION' | 'VGT'; targetPct: number | null }>) {
      expect(e.targetPct).toBe(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE[e.type])
    }
  })

  it('400s when from/to are missing or unparseable', async () => {
    await request(app).get('/api/accessibility/kpi').expect(400)
    await request(app).get('/api/accessibility/kpi?from=not-a-date&to=2026-06-30').expect(400)
  })

  it('400s when from > to', async () => {
    await request(app).get('/api/accessibility/kpi?from=2026-07-01&to=2026-06-01').expect(400)
    expect(mp.accessibilityDeliverable.findMany).not.toHaveBeenCalled()
  })
})
