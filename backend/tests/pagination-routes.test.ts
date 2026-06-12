/**
 * Route-level pagination tests for GET /api/events (B-4-T1, ADR-009).
 * No params -> legacy plain array (unchanged). limit/offset -> envelope.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    event: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    customFieldValue: { findMany: vi.fn().mockResolvedValue([]) },
    fieldDefinition: { findMany: vi.fn().mockResolvedValue([]) },
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

import { buildApp } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

const app = buildApp()
const mp = prisma as unknown as {
  event: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }
}

const rows = [
  { id: 1, participants: 'A vs B', customFields: {} },
  { id: 2, participants: 'C vs D', customFields: {} },
]

beforeEach(() => {
  vi.clearAllMocks()
  mp.event.findMany.mockResolvedValue(rows)
  mp.event.count.mockResolvedValue(7)
})

describe('GET /api/events — legacy mode (no pagination params)', () => {
  it('returns a plain array and does not call count', async () => {
    const res = await request(app).get('/api/events').expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(mp.event.count).not.toHaveBeenCalled()
    const args = mp.event.findMany.mock.calls[0][0]
    expect(args.take).toBeUndefined()
    expect(args.skip).toBeUndefined()
  })
})

describe('GET /api/events — paginated mode', () => {
  it('returns the envelope with total/limit/offset and passes take/skip', async () => {
    const res = await request(app).get('/api/events?limit=2&offset=3').expect(200)
    expect(res.body.pagination).toEqual({ total: 7, limit: 2, offset: 3 })
    expect(res.body.data).toHaveLength(2)
    const args = mp.event.findMany.mock.calls[0][0]
    expect(args.take).toBe(2)
    expect(args.skip).toBe(3)
  })

  it('adds an id tiebreak to the ordering for stable pages', async () => {
    await request(app).get('/api/events?limit=2').expect(200)
    const args = mp.event.findMany.mock.calls[0][0]
    expect(args.orderBy[args.orderBy.length - 1]).toEqual({ id: 'asc' })
  })

  it('count is scoped to the same tenant filter as the page query', async () => {
    await request(app).get('/api/events?limit=2&sportId=4').expect(200)
    const findArgs = mp.event.findMany.mock.calls[0][0]
    const countArgs = mp.event.count.mock.calls[0][0]
    expect(countArgs.where).toEqual(findArgs.where)
    expect(countArgs.where.tenantId).toBe('tenant-1')
  })

  it('rejects limit > 200', async () => {
    await request(app).get('/api/events?limit=201').expect(400)
  })

  it('rejects negative offset and zero limit', async () => {
    await request(app).get('/api/events?offset=-1').expect(400)
    await request(app).get('/api/events?limit=0').expect(400)
  })
})
