/**
 * E-4 item 4: the day-window filter on GET /api/broadcast-slots must be
 * half-open [dateStart, dateEnd). The sole caller (schedulesApi.listSlots)
 * passes dateEnd = next-day-midnight as an EXCLUSIVE end ("End of day: next
 * day at midnight"), so an inclusive `lte` double-counts a slot at exactly
 * midnight into both adjacent days. This pins the query to `lt`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    broadcastSlot: { findMany: vi.fn().mockResolvedValue([]) },
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
const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
})

describe('GET /api/broadcast-slots — half-open day window (E-4 item 4)', () => {
  it('filters plannedStartUtc with an EXCLUSIVE upper bound (lt, not lte)', async () => {
    await request(app)
      .get('/api/broadcast-slots?dateStart=2026-07-10&dateEnd=2026-07-11')
      .expect(200)

    expect(mp.broadcastSlot.findMany).toHaveBeenCalledTimes(1)
    const where = mp.broadcastSlot.findMany.mock.calls[0][0].where as {
      plannedStartUtc: Record<string, Date>
    }
    expect(where.plannedStartUtc.gte).toEqual(new Date('2026-07-10'))
    // half-open: dateEnd is the EXCLUSIVE next-day boundary
    expect(where.plannedStartUtc.lt).toEqual(new Date('2026-07-11'))
    expect(where.plannedStartUtc.lte).toBeUndefined()
  })
})
