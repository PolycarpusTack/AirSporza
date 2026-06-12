/**
 * B-4-T2: pagination envelope on /api/teams and import listings.
 * Teams: envelope when limit OR offset present (standard ADR-009 rule).
 * Import listings: `limit` predates the envelope (legacy plain-array consumers),
 * so the envelope keys on the NEW `offset` param only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    team: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    importRecord: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    mergeCandidate: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    importDeadLetter: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    importJob: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    importSource: { findMany: vi.fn().mockResolvedValue([]) },
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

vi.mock('../src/import/services/ImportSchemaService.js', () => ({
  ensureImportSchemaReady: vi.fn().mockResolvedValue(undefined),
  normalizeImportSchemaError: (e: unknown) => e,
}))

import { buildApp } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

const app = buildApp()
const mp = prisma as unknown as Record<string, { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }>

beforeEach(() => {
  vi.clearAllMocks()
  mp.team.findMany.mockResolvedValue([{ id: 1, name: 'AA Gent' }])
  mp.team.count.mockResolvedValue(42)
  mp.importRecord.findMany.mockResolvedValue([{ id: 'r1' }])
  mp.importRecord.count.mockResolvedValue(1500)
  mp.mergeCandidate.findMany.mockResolvedValue([])
  mp.mergeCandidate.count.mockResolvedValue(9)
  mp.importDeadLetter.findMany.mockResolvedValue([])
  mp.importDeadLetter.count.mockResolvedValue(3)
  mp.importJob.findMany.mockResolvedValue([])
  mp.importJob.count.mockResolvedValue(5)
})

describe('GET /api/teams', () => {
  it('legacy mode: plain array, no count, no take/skip', async () => {
    const res = await request(app).get('/api/teams').expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(mp.team.count).not.toHaveBeenCalled()
    expect(mp.team.findMany.mock.calls[0][0].take).toBeUndefined()
  })

  it('paginated: envelope with name,id ordering and take/skip', async () => {
    const res = await request(app).get('/api/teams?limit=10&offset=20').expect(200)
    expect(res.body.pagination).toEqual({ total: 42, limit: 10, offset: 20 })
    const args = mp.team.findMany.mock.calls[0][0]
    expect(args.take).toBe(10)
    expect(args.skip).toBe(20)
    expect(args.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }])
  })

  it('rejects limit > 200', async () => {
    await request(app).get('/api/teams?limit=999').expect(400)
  })
})

describe('import listings — envelope keys on offset only (legacy limit consumers)', () => {
  it('GET /api/import/records/unlinked with limit only stays a plain array', async () => {
    const res = await request(app).get('/api/import/records/unlinked?limit=30').expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(mp.importRecord.count).not.toHaveBeenCalled()
  })

  it('GET /api/import/records/unlinked with offset returns the envelope at 1k+ volume', async () => {
    const res = await request(app).get('/api/import/records/unlinked?limit=50&offset=1000').expect(200)
    expect(res.body.pagination).toEqual({ total: 1500, limit: 50, offset: 1000 })
    const args = mp.importRecord.findMany.mock.calls[0][0]
    expect(args.skip).toBe(1000)
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }])
  })

  it('GET /api/import/merge-candidates with offset returns the envelope', async () => {
    const res = await request(app).get('/api/import/merge-candidates?offset=0').expect(200)
    expect(res.body.pagination.total).toBe(9)
  })

  it('GET /api/import/dead-letters with offset returns the envelope', async () => {
    const res = await request(app).get('/api/import/dead-letters?offset=2').expect(200)
    expect(res.body.pagination.total).toBe(3)
    expect(mp.importDeadLetter.findMany.mock.calls[0][0].skip).toBe(2)
  })

  it('GET /api/import/jobs with offset returns the envelope', async () => {
    const res = await request(app).get('/api/import/jobs?offset=0&limit=5').expect(200)
    expect(res.body.pagination).toEqual({ total: 5, limit: 5, offset: 0 })
  })

  it('GET /api/import/jobs without offset stays a plain... existing shape', async () => {
    const res = await request(app).get('/api/import/jobs?limit=5').expect(200)
    expect(res.body.pagination).toBeUndefined()
    expect(mp.importJob.count).not.toHaveBeenCalled()
  })
})
