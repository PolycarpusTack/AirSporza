/**
 * RD-2-T2 — nested rights-window CRUD under /api/contracts/:contractId/rights-windows.
 * supertest + mocked prisma (players-routes.test.ts pattern). Covers: list,
 * create, idempotent retry (200 same row), 409 overlap across the 4 dimensions,
 * 400 unknown category, tenant isolation (404 for foreign contract), RBAC, and
 * audit-log writes on mutations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    contract: { findFirst: vi.fn() },
    rightsWindow: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
      if (!req.user?.role || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden' })
      }
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

const contract = { id: 7, tenantId: 'tenant-1' }
const UUID = '11111111-1111-4111-8111-111111111111'

const existingWindow = {
  id: '22222222-2222-4222-8222-222222222222',
  contractId: 7,
  tenantId: 'tenant-1',
  category: 'LIVE',
  exclusivity: 'NON_EXCLUSIVE',
  territory: ['BE'],
  platforms: ['linear'],
  windowStartUtc: null,
  windowEndUtc: null,
  maxRuns: null,
  holdbackHoursMin: null,
}

const validBody = {
  category: 'HIGHLIGHTS',
  exclusivity: 'NON_EXCLUSIVE',
  territory: ['BE'],
  platforms: ['linear'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.contract.findFirst.mockResolvedValue(contract)
  mp.rightsWindow.findMany.mockResolvedValue([])
  mp.rightsWindow.findFirst.mockResolvedValue(null)
})

describe('GET /api/contracts/:contractId/rights-windows', () => {
  it('lists the windows for a tenant-owned contract', async () => {
    mp.rightsWindow.findMany.mockResolvedValue([existingWindow])
    const res = await request(app).get('/api/contracts/7/rights-windows').expect(200)
    expect(res.body).toHaveLength(1)
    expect(mp.rightsWindow.findMany.mock.calls[0][0].where).toMatchObject({ contractId: 7, tenantId: 'tenant-1' })
  })

  it('404s when the contract is not in the tenant (isolation)', async () => {
    mp.contract.findFirst.mockResolvedValue(null)
    await request(app).get('/api/contracts/999/rights-windows').expect(404)
    // The parent-contract guard MUST be tenant-scoped (no undefined-tenant leak).
    expect(mp.contract.findFirst.mock.calls[0][0].where).toMatchObject({ id: 999, tenantId: 'tenant-1' })
    expect(mp.rightsWindow.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/contracts/:contractId/rights-windows', () => {
  it('creates a window as admin and writes an audit log', async () => {
    mp.rightsWindow.create.mockResolvedValue({ id: UUID, ...validBody, contractId: 7 })
    const res = await request(app).post('/api/contracts/7/rights-windows').send(validBody).expect(201)
    expect(res.body.category).toBe('HIGHLIGHTS')
    const data = mp.rightsWindow.create.mock.calls[0][0].data
    expect(data.tenantId).toBe('tenant-1')
    expect(data.contractId).toBe(7)
    expect(typeof data.id).toBe('string') // server-generated uuid when none supplied
    expect(mp.auditLog.create).toHaveBeenCalledTimes(1)
    // Compliance log: who + what + which entity + which tenant (not just action).
    expect(mp.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'rightsWindow.create',
      userId: 'u1',
      entityId: UUID,
      tenantId: 'tenant-1',
    })
  })

  it('happy path also allowed for the contracts role (not just admin)', async () => {
    mp.rightsWindow.create.mockResolvedValue({ id: UUID, ...validBody, contractId: 7 })
    await request(app)
      .post('/api/contracts/7/rights-windows')
      .set('x-test-role', 'contracts')
      .send(validBody)
      .expect(201)
  })

  it('persists a client-supplied uuid id', async () => {
    mp.rightsWindow.create.mockResolvedValue({ id: UUID, ...validBody, contractId: 7 })
    await request(app).post('/api/contracts/7/rights-windows').send({ ...validBody, id: UUID }).expect(201)
    expect(mp.rightsWindow.create.mock.calls[0][0].data.id).toBe(UUID)
  })

  it('idempotent: re-POST of an existing id returns 200 with the existing row (no duplicate)', async () => {
    mp.rightsWindow.findFirst.mockResolvedValue({ id: UUID, ...validBody, contractId: 7 })
    const res = await request(app).post('/api/contracts/7/rights-windows').send({ ...validBody, id: UUID }).expect(200)
    expect(res.body.id).toBe(UUID)
    // The dup lookup MUST be scoped by id+contractId+tenantId — a client id under a
    // different contract/tenant must NOT be echoed back (cross-tenant read leak).
    expect(mp.rightsWindow.findFirst.mock.calls[0][0].where).toMatchObject({
      id: UUID,
      contractId: 7,
      tenantId: 'tenant-1',
    })
    expect(mp.rightsWindow.create).not.toHaveBeenCalled()
  })

  it('400s on an unknown category (zod)', async () => {
    await request(app).post('/api/contracts/7/rights-windows').send({ ...validBody, category: 'BOGUS' }).expect(400)
    expect(mp.rightsWindow.create).not.toHaveBeenCalled()
  })

  it('409s when the candidate overlaps an existing window (same category+period+territory+platform)', async () => {
    mp.rightsWindow.findMany.mockResolvedValue([{ ...existingWindow, category: 'LIVE' }])
    const res = await request(app)
      .post('/api/contracts/7/rights-windows')
      .send({ ...validBody, category: 'LIVE', territory: ['BE'], platforms: ['linear'] })
      .expect(409)
    expect(JSON.stringify(res.body)).toContain(existingWindow.id)
    expect(mp.rightsWindow.create).not.toHaveBeenCalled()
  })

  it('does NOT 409 when territory is disjoint (BE window vs NL candidate)', async () => {
    mp.rightsWindow.findMany.mockResolvedValue([{ ...existingWindow, category: 'LIVE', territory: ['BE'] }])
    mp.rightsWindow.create.mockResolvedValue({ id: UUID })
    await request(app)
      .post('/api/contracts/7/rights-windows')
      .send({ ...validBody, category: 'LIVE', territory: ['NL'], platforms: ['linear'] })
      .expect(201)
  })

  it('does NOT 409 when platform is disjoint (linear window vs on-demand candidate)', async () => {
    mp.rightsWindow.findMany.mockResolvedValue([{ ...existingWindow, category: 'LIVE', platforms: ['linear'] }])
    mp.rightsWindow.create.mockResolvedValue({ id: UUID })
    await request(app)
      .post('/api/contracts/7/rights-windows')
      .send({ ...validBody, category: 'LIVE', territory: ['BE'], platforms: ['on-demand'] })
      .expect(201)
  })

  it('does NOT 409 when the validity PERIOD is disjoint (same category+scope)', async () => {
    mp.rightsWindow.findMany.mockResolvedValue([{
      ...existingWindow, category: 'LIVE',
      windowStartUtc: '2026-01-01T00:00:00.000Z', windowEndUtc: '2026-02-01T00:00:00.000Z',
    }])
    mp.rightsWindow.create.mockResolvedValue({ id: UUID })
    await request(app)
      .post('/api/contracts/7/rights-windows')
      .send({ ...validBody, category: 'LIVE', territory: ['BE'], platforms: ['linear'],
        windowStartUtc: '2026-03-01T00:00:00.000Z', windowEndUtc: '2026-04-01T00:00:00.000Z' })
      .expect(201)
  })

  it('does NOT 409 when the category differs (same period+scope)', async () => {
    mp.rightsWindow.findMany.mockResolvedValue([{ ...existingWindow, category: 'LIVE' }])
    mp.rightsWindow.create.mockResolvedValue({ id: UUID })
    await request(app)
      .post('/api/contracts/7/rights-windows')
      .send({ ...validBody, category: 'HIGHLIGHTS', territory: ['BE'], platforms: ['linear'] })
      .expect(201)
  })

  it('rejects non-admin roles', async () => {
    await request(app).post('/api/contracts/7/rights-windows').set('x-test-role', 'sports').send(validBody).expect(403)
  })

  it('404s when the contract is foreign/unknown', async () => {
    mp.contract.findFirst.mockResolvedValue(null)
    await request(app).post('/api/contracts/999/rights-windows').send(validBody).expect(404)
  })
})

describe('PUT /api/contracts/:contractId/rights-windows/:windowId', () => {
  it('full-replaces an existing window and audits', async () => {
    mp.rightsWindow.findFirst.mockResolvedValue(existingWindow)
    mp.rightsWindow.update.mockResolvedValue({ ...existingWindow, category: 'DELAYED' })
    const res = await request(app)
      .put(`/api/contracts/7/rights-windows/${existingWindow.id}`)
      .send({ ...validBody, category: 'DELAYED' })
      .expect(200)
    expect(res.body.category).toBe('DELAYED')
    // The window lookup is tenant+contract scoped.
    expect(mp.rightsWindow.findFirst.mock.calls[0][0].where).toMatchObject({
      id: existingWindow.id, contractId: 7, tenantId: 'tenant-1',
    })
    expect(mp.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'rightsWindow.update',
      userId: 'u1',
      entityId: existingWindow.id,
      tenantId: 'tenant-1',
    })
  })

  it('rejects non-admin/non-contracts roles', async () => {
    await request(app)
      .put(`/api/contracts/7/rights-windows/${existingWindow.id}`)
      .set('x-test-role', 'sports')
      .send(validBody)
      .expect(403)
  })

  it('excludes self from the overlap check (updating a window in place is fine)', async () => {
    mp.rightsWindow.findFirst.mockResolvedValue(existingWindow)
    mp.rightsWindow.update.mockResolvedValue(existingWindow)
    await request(app)
      .put(`/api/contracts/7/rights-windows/${existingWindow.id}`)
      .send({ ...validBody, category: 'LIVE' })
      .expect(200)
    // the sibling query must exclude the window being updated
    expect(mp.rightsWindow.findMany.mock.calls[0][0].where.id).toEqual({ not: existingWindow.id })
  })

  it('404s for an unknown window', async () => {
    mp.rightsWindow.findFirst.mockResolvedValue(null)
    await request(app).put(`/api/contracts/7/rights-windows/${UUID}`).send(validBody).expect(404)
  })

  it('400s on a non-uuid windowId', async () => {
    await request(app).put('/api/contracts/7/rights-windows/not-a-uuid').send(validBody).expect(400)
  })
})

describe('DELETE /api/contracts/:contractId/rights-windows/:windowId', () => {
  it('deletes an existing window as admin and audits', async () => {
    mp.rightsWindow.findFirst.mockResolvedValue(existingWindow)
    mp.rightsWindow.delete.mockResolvedValue({})
    await request(app).delete(`/api/contracts/7/rights-windows/${existingWindow.id}`).expect(200)
    expect(mp.rightsWindow.findFirst.mock.calls[0][0].where).toMatchObject({
      id: existingWindow.id, contractId: 7, tenantId: 'tenant-1',
    })
    expect(mp.rightsWindow.delete).toHaveBeenCalledWith({ where: { id: existingWindow.id } })
    expect(mp.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'rightsWindow.delete',
      userId: 'u1',
      entityId: existingWindow.id,
      tenantId: 'tenant-1',
    })
  })

  it('404s for an unknown window', async () => {
    mp.rightsWindow.findFirst.mockResolvedValue(null)
    await request(app).delete(`/api/contracts/7/rights-windows/${UUID}`).expect(404)
  })

  it('rejects non-admin roles', async () => {
    await request(app).delete(`/api/contracts/7/rights-windows/${existingWindow.id}`).set('x-test-role', 'planner').expect(403)
  })
})
