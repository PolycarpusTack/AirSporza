/**
 * RD-4-T1 — GET /api/rights/check-slots. supertest + mocked prisma; the checker
 * (`checkRightsForEvents`) is stubbed so this proves ROUTE behavior (day-window
 * query, event-less INFO, batching+mapping, pagination cursor roundtrip, tenant
 * isolation, flag pass-through) without re-testing the checker (covered by RD-3).
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

vi.mock('../src/services/rightsChecker.js', () => ({
  checkRightsForEvent: vi.fn(),
  checkRightsForEvents: vi.fn().mockResolvedValue({}),
  getRightsMatrix: vi.fn().mockResolvedValue([]),
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown; headers: Record<string, unknown> }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: (req.headers['x-test-role'] as string) || 'planner' }
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
import { checkRightsForEvents } from '../src/services/rightsChecker.js'

const app = buildApp()
const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const mockedCheck = checkRightsForEvents as unknown as ReturnType<typeof vi.fn>

const ERR = { code: 'TERRITORY_BLOCKED', severity: 'ERROR', scope: ['rights', 'territory'], message: 'blocked' }
const WARN = { code: 'CONTRACT_EXPIRING', severity: 'WARNING', scope: ['rights', 'expiry'], message: 'expiring' }

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.broadcastSlot.findMany.mockResolvedValue([])
  mockedCheck.mockResolvedValue({})
})

describe('GET /api/rights/check-slots — validation', () => {
  it('400s without a channelId', async () => {
    await request(app).get('/api/rights/check-slots?date=2026-03-01').expect(400)
  })
  it('400s without a valid date', async () => {
    await request(app).get('/api/rights/check-slots?channelId=3&date=not-a-date').expect(400)
  })
  it('400s on a non-YYYY-MM-DD date (e.g. an ISO datetime)', async () => {
    await request(app).get('/api/rights/check-slots?channelId=3&date=2026-03-01T00:00:00Z').expect(400)
  })
  it('400s (not 500) on a garbage cursor that decodes to a non-uuid', async () => {
    await request(app)
      .get('/api/rights/check-slots?channelId=3&date=2026-03-01&cursor=not-a-real-cursor')
      .expect(400)
    expect(mp.broadcastSlot.findMany).not.toHaveBeenCalled()
  })
})

describe('GET /api/rights/check-slots — day window + tenant scope', () => {
  it('queries the tenant channel-day with a HALF-OPEN [date, date+1) window', async () => {
    await request(app).get('/api/rights/check-slots?channelId=3&date=2026-03-01').expect(200)
    const where = mp.broadcastSlot.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('tenant-1')
    expect(where.channelId).toBe(3)
    expect(where.plannedStartUtc.gte.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(where.plannedStartUtc.lt.toISOString()).toBe('2026-03-02T00:00:00.000Z')
    expect(where.plannedStartUtc.lte).toBeUndefined() // half-open, not lte
  })
})

describe('GET /api/rights/check-slots — mapping', () => {
  it('maps each event slot to its checker result and batches distinct eventIds', async () => {
    mp.broadcastSlot.findMany.mockResolvedValue([
      { id: 's1', eventId: 10 }, { id: 's2', eventId: 20 }, { id: 's3', eventId: 10 },
    ])
    mockedCheck.mockResolvedValue({
      10: { ok: false, results: [ERR] },
      20: { ok: true, results: [WARN] },
    })
    const res = await request(app).get('/api/rights/check-slots?channelId=3&date=2026-03-01').expect(200)
    expect(res.body.slots).toEqual([
      { slotId: 's1', ok: false, results: [ERR] },
      { slotId: 's2', ok: true, results: [WARN] },
      { slotId: 's3', ok: false, results: [ERR] },
    ])
    // distinct eventIds only ([10, 20]) passed to the batch checker
    expect(mockedCheck.mock.calls[0][0]).toEqual([10, 20])
  })

  it('event-less slot → INFO SLOT_EVENT_MISSING, ok:true (never dropped)', async () => {
    mp.broadcastSlot.findMany.mockResolvedValue([{ id: 's1', eventId: null }])
    const res = await request(app).get('/api/rights/check-slots?channelId=3&date=2026-03-01').expect(200)
    expect(res.body.slots).toHaveLength(1)
    expect(res.body.slots[0]).toMatchObject({ slotId: 's1', ok: true })
    expect(res.body.slots[0].results[0]).toMatchObject({ code: 'SLOT_EVENT_MISSING', severity: 'INFO' })
    expect(mockedCheck).not.toHaveBeenCalled() // no event ids → no checker call
  })

  it('linked-but-unresolvable event → WARNING SLOT_EVENT_UNRESOLVED, ok:false (not a false CLEAR)', async () => {
    mp.broadcastSlot.findMany.mockResolvedValue([{ id: 's1', eventId: 99 }])
    mockedCheck.mockResolvedValue({}) // event 99 absent from the checker result
    const res = await request(app).get('/api/rights/check-slots?channelId=3&date=2026-03-01').expect(200)
    expect(res.body.slots[0]).toMatchObject({ slotId: 's1', ok: false })
    expect(res.body.slots[0].results[0]).toMatchObject({ code: 'SLOT_EVENT_UNRESOLVED', severity: 'WARNING' })
  })
})

describe('GET /api/rights/check-slots — pagination (ADR-009)', () => {
  // slot ids must be real uuids so the opaque cursor validates on roundtrip.
  const A = '11111111-1111-4111-8111-111111111111'
  const B = '22222222-2222-4222-8222-222222222222'
  const C = '33333333-3333-4333-8333-333333333333'

  it('returns nextCursor + hasMore when a page is full, and roundtrips the cursor', async () => {
    // limit=2 → route asks for take:3; return 3 → hasMore, drop the 3rd
    mp.broadcastSlot.findMany.mockResolvedValue([
      { id: A, eventId: null }, { id: B, eventId: null }, { id: C, eventId: null },
    ])
    const res = await request(app).get('/api/rights/check-slots?channelId=3&date=2026-03-01&limit=2').expect(200)
    expect(res.body.slots).toHaveLength(2)
    expect(res.body.hasMore).toBe(true)
    expect(res.body.nextCursor).toBe(Buffer.from(B).toString('base64url'))
    expect(mp.broadcastSlot.findMany.mock.calls[0][0].take).toBe(3)

    // Feed the cursor back → route decodes it into a Prisma cursor + skip:1
    mp.broadcastSlot.findMany.mockResolvedValue([{ id: C, eventId: null }])
    const res2 = await request(app)
      .get(`/api/rights/check-slots?channelId=3&date=2026-03-01&limit=2&cursor=${encodeURIComponent(res.body.nextCursor)}`)
      .expect(200)
    const args = mp.broadcastSlot.findMany.mock.calls[1][0]
    expect(args.cursor).toEqual({ id: B })
    expect(args.skip).toBe(1)
    expect(res2.body.hasMore).toBe(false)
    expect(res2.body.nextCursor).toBeNull()
  })

  it('caps limit at 200', async () => {
    await request(app).get('/api/rights/check-slots?channelId=3&date=2026-03-01&limit=9999').expect(200)
    expect(mp.broadcastSlot.findMany.mock.calls[0][0].take).toBe(201)
  })

  it('clamps a negative limit to 1 (take: 2)', async () => {
    await request(app).get('/api/rights/check-slots?channelId=3&date=2026-03-01&limit=-5').expect(200)
    expect(mp.broadcastSlot.findMany.mock.calls[0][0].take).toBe(2)
  })
})

describe('GET /api/rights/check-slots — checker opts', () => {
  it('forwards { territory } only (window-aware behavior is the checker default, like the sibling routes)', async () => {
    mp.broadcastSlot.findMany.mockResolvedValue([{ id: 's1', eventId: 10 }])
    mockedCheck.mockResolvedValue({ 10: { ok: true, results: [] } })
    await request(app).get('/api/rights/check-slots?channelId=3&date=2026-03-01&territory=BE').expect(200)
    expect(mockedCheck.mock.calls[0][1]).toEqual({ territory: 'BE' })
  })
})
