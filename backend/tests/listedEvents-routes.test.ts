/**
 * RC-1-T2 — /api/listed-events routes. supertest + mocked prisma (players-routes idiom).
 * Covers: category list, admin edit (authz + tenant isolation + audit), suggest is
 * read-only (never writes listedCategoryId), confirm sets the link idempotently +
 * tenant-scopes both event & category, dismiss clears idempotently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    listedEventCategory: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    event: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
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

const app = buildApp()
const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const category = { id: 5, tenantId: 'tenant-1', name: 'FIFA World Cup final', sportId: 1, fullLiveRequired: true, besluitRef: 'ref' }
const event = { id: 10, tenantId: 'tenant-1', sportId: 1, competitionId: 100, listedCategoryId: null }

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.listedEventCategory.findMany.mockResolvedValue([])
  mp.listedEventCategory.findFirst.mockResolvedValue(null)
  mp.event.findFirst.mockResolvedValue(null)
})

describe('GET /api/listed-events/categories', () => {
  it('lists the tenant categories (tenant-scoped)', async () => {
    mp.listedEventCategory.findMany.mockResolvedValue([category])
    const res = await request(app).get('/api/listed-events/categories').expect(200)
    expect(res.body).toHaveLength(1)
    expect(mp.listedEventCategory.findMany.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-1' })
  })
})

describe('PUT /api/listed-events/categories/:id', () => {
  it('admin edits fullLiveRequired + audits (AS-3 no-deploy edit)', async () => {
    mp.listedEventCategory.findFirst.mockResolvedValue(category)
    mp.listedEventCategory.update.mockResolvedValue({ ...category, fullLiveRequired: false })
    const res = await request(app).put('/api/listed-events/categories/5').send({ fullLiveRequired: false }).expect(200)
    expect(res.body.fullLiveRequired).toBe(false)
    expect(mp.listedEventCategory.update.mock.calls[0][0].data).toEqual({ fullLiveRequired: false })
    expect(mp.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'listedEventCategory.update', userId: 'u1', entityId: '5', tenantId: 'tenant-1',
    })
  })

  it('rejects non-admin roles', async () => {
    await request(app).put('/api/listed-events/categories/5').set('x-test-role', 'planner').send({ fullLiveRequired: false }).expect(403)
  })

  it('404s for a category not in the tenant (isolation)', async () => {
    mp.listedEventCategory.findFirst.mockResolvedValue(null)
    await request(app).put('/api/listed-events/categories/999').send({ name: 'x' }).expect(404)
    expect(mp.listedEventCategory.findFirst.mock.calls[0][0].where).toEqual({ id: 999, tenantId: 'tenant-1' })
    expect(mp.listedEventCategory.update).not.toHaveBeenCalled()
  })

  it('400s on an empty name', async () => {
    mp.listedEventCategory.findFirst.mockResolvedValue(category)
    await request(app).put('/api/listed-events/categories/5').send({ name: '' }).expect(400)
  })
})

describe('GET /api/listed-events/events/:eventId/suggest', () => {
  it('returns sport-matched suggestions and NEVER writes listedCategoryId', async () => {
    mp.event.findFirst.mockResolvedValue({ ...event, competition: { name: 'FIFA World Cup 2026' } })
    mp.listedEventCategory.findMany.mockResolvedValue([
      { ...category, id: 5, sportId: 1, name: 'FIFA World Cup final' },
      { ...category, id: 6, sportId: 2, name: 'Grand Slam tennis' },
    ])
    const res = await request(app).get('/api/listed-events/events/10/suggest').expect(200)
    expect(res.body.map((c: { id: number }) => c.id)).toEqual([5]) // sport 1 only
    expect(mp.event.update).not.toHaveBeenCalled() // read-only, no auto-bind
    // the event lookup is tenant-scoped (a dropped tenantId must fail this)
    expect(mp.event.findFirst.mock.calls[0][0].where).toMatchObject({ id: 10, tenantId: 'tenant-1' })
  })

  it('404s for an event not in the tenant', async () => {
    mp.event.findFirst.mockResolvedValue(null)
    await request(app).get('/api/listed-events/events/999/suggest').expect(404)
  })
})

describe('POST /api/listed-events/events/:eventId/confirm', () => {
  it('binds the category, is idempotent by eventId, and audits', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    mp.listedEventCategory.findFirst.mockResolvedValue(category)
    mp.event.update.mockResolvedValue({ ...event, listedCategoryId: 5 })
    const res = await request(app).post('/api/listed-events/events/10/confirm').send({ categoryId: 5 }).expect(200)
    expect(res.body.listedCategoryId).toBe(5)
    expect(mp.event.update.mock.calls[0][0]).toEqual({ where: { id: 10 }, data: { listedCategoryId: 5 } })
    // both lookups are tenant-scoped
    expect(mp.event.findFirst.mock.calls[0][0].where).toMatchObject({ id: 10, tenantId: 'tenant-1' })
    expect(mp.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'event.listedCategory.confirm', userId: 'u1', entityId: '10', tenantId: 'tenant-1' })
  })

  it('double-confirm is idempotent (same link, update-by-id, never a create)', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    mp.listedEventCategory.findFirst.mockResolvedValue(category)
    mp.event.update.mockResolvedValue({ ...event, listedCategoryId: 5 })
    await request(app).post('/api/listed-events/events/10/confirm').send({ categoryId: 5 }).expect(200)
    await request(app).post('/api/listed-events/events/10/confirm').send({ categoryId: 5 }).expect(200)
    // both calls are the same update-by-id (idempotent), not an insert
    expect(mp.event.update.mock.calls[0][0]).toEqual({ where: { id: 10 }, data: { listedCategoryId: 5 } })
    expect(mp.event.update.mock.calls[1][0]).toEqual({ where: { id: 10 }, data: { listedCategoryId: 5 } })
  })

  it('400s when the category is not in the tenant (no cross-tenant binding)', async () => {
    mp.event.findFirst.mockResolvedValue(event)
    mp.listedEventCategory.findFirst.mockResolvedValue(null)
    await request(app).post('/api/listed-events/events/10/confirm').send({ categoryId: 999 }).expect(400)
    // the category lookup MUST be tenant-scoped — a mutant dropping tenantId is the
    // central cross-tenant-bind hazard.
    expect(mp.listedEventCategory.findFirst.mock.calls[0][0].where).toEqual({ id: 999, tenantId: 'tenant-1' })
    expect(mp.event.update).not.toHaveBeenCalled()
  })

  it('404s when the event is not in the tenant', async () => {
    mp.event.findFirst.mockResolvedValue(null)
    await request(app).post('/api/listed-events/events/999/confirm').send({ categoryId: 5 }).expect(404)
  })

  it('rejects a role outside planner/admin', async () => {
    await request(app).post('/api/listed-events/events/10/confirm').set('x-test-role', 'sports').send({ categoryId: 5 }).expect(403)
  })
})

describe('POST /api/listed-events/events/:eventId/dismiss', () => {
  it('clears the link, is idempotent (no-op when already null), and audits', async () => {
    mp.event.findFirst.mockResolvedValue({ ...event, listedCategoryId: 5 })
    mp.event.update.mockResolvedValue({ ...event, listedCategoryId: null })
    const res = await request(app).post('/api/listed-events/events/10/dismiss').expect(200)
    expect(res.body.listedCategoryId).toBeNull()
    expect(mp.event.update.mock.calls[0][0]).toEqual({ where: { id: 10 }, data: { listedCategoryId: null } })
    expect(mp.event.findFirst.mock.calls[0][0].where).toMatchObject({ id: 10, tenantId: 'tenant-1' })
    expect(mp.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'event.listedCategory.dismiss', userId: 'u1', entityId: '10', tenantId: 'tenant-1' })
  })

  it('idempotent: dismiss when already null still 200s', async () => {
    mp.event.findFirst.mockResolvedValue({ ...event, listedCategoryId: null })
    mp.event.update.mockResolvedValue({ ...event, listedCategoryId: null })
    await request(app).post('/api/listed-events/events/10/dismiss').expect(200)
  })

  it('404s for an event not in the tenant', async () => {
    mp.event.findFirst.mockResolvedValue(null)
    await request(app).post('/api/listed-events/events/999/dismiss').expect(404)
  })
})
