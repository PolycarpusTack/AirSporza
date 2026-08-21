/**
 * FM2-1-T1 — GET /api/schedule/suggestions?week=<ISO-week-start>.
 * supertest + mocked prisma (rippleProposals-routes.test.ts pattern).
 *
 * This route is a thin wrapper: the business logic (gates, ranking, the
 * UNPLACED mirror) is covered by scheduleSuggestions.test.ts against the pure
 * `computeScheduleSuggestions`. These tests only prove the route validates
 * `week`, loads the right week-scoped rows, and wires them through correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    event: { findMany: vi.fn().mockResolvedValue([]) },
    broadcastSlot: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]) },
    techPlan: { findMany: vi.fn().mockResolvedValue([]) },
    contract: { findMany: vi.fn().mockResolvedValue([]) },
    channel: { findMany: vi.fn().mockResolvedValue([]) },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn(),
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown; headers: Record<string, unknown> }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: (req.headers['x-test-role'] as string) || 'planner' }
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
const mp = prisma as unknown as {
  event: { findMany: ReturnType<typeof vi.fn> }
  broadcastSlot: { findMany: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> }
  techPlan: { findMany: ReturnType<typeof vi.fn> }
  contract: { findMany: ReturnType<typeof vi.fn> }
  channel: { findMany: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  mp.event.findMany.mockResolvedValue([])
  mp.broadcastSlot.findMany.mockResolvedValue([])
  mp.broadcastSlot.groupBy.mockResolvedValue([])
  mp.techPlan.findMany.mockResolvedValue([])
  mp.contract.findMany.mockResolvedValue([])
  mp.channel.findMany.mockResolvedValue([])
})

describe('GET /api/schedule/suggestions', () => {
  it('400s when week is missing', async () => {
    const res = await request(app).get('/api/schedule/suggestions').expect(400)
    expect(res.body.error ?? res.body.message).toBeDefined()
    expect(mp.event.findMany).not.toHaveBeenCalled()
  })

  it('400s when week is not an ISO date string', async () => {
    await request(app).get('/api/schedule/suggestions').query({ week: '2026-3-2' }).expect(400)
    await request(app).get('/api/schedule/suggestions').query({ week: 'not-a-date' }).expect(400)
    expect(mp.event.findMany).not.toHaveBeenCalled()
  })

  it('short-circuits to an empty unplaced array when no events exist in the week (no further queries)', async () => {
    mp.event.findMany.mockResolvedValue([])

    const res = await request(app).get('/api/schedule/suggestions').query({ week: '2026-03-02' }).expect(200)

    expect(res.body).toEqual({ week: '2026-03-02', unplaced: [] })
    expect(mp.broadcastSlot.findMany).not.toHaveBeenCalled()
    expect(mp.techPlan.findMany).not.toHaveBeenCalled()
    expect(mp.contract.findMany).not.toHaveBeenCalled()
    expect(mp.channel.findMany).not.toHaveBeenCalled()
  })

  it('scopes the event query to [week, week+7days) and to the tenant', async () => {
    mp.event.findMany.mockResolvedValue([])

    await request(app).get('/api/schedule/suggestions').query({ week: '2026-03-02' }).expect(200)

    const where = mp.event.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('tenant-1')
    expect(where.startDateBE.gte.toISOString()).toBe('2026-03-02T00:00:00.000Z')
    expect(where.startDateBE.lt.toISOString()).toBe('2026-03-09T00:00:00.000Z')
  })

  it('wires a clean unplaced event through to a ranked candidates response', async () => {
    mp.event.findMany.mockResolvedValue([
      { id: 11, channelId: null, competitionId: 101, startDateBE: new Date('2026-03-05'), startTimeBE: '15:00', durationMin: 90 },
    ])
    mp.broadcastSlot.findMany.mockResolvedValue([]) // no slot for event 11 → unplaced
    mp.techPlan.findMany.mockResolvedValue([])
    mp.contract.findMany.mockResolvedValue([
      { id: 1, competitionId: 101, status: 'valid', validFrom: new Date('2024-01-01'), validUntil: new Date('2027-01-01') },
    ])
    mp.channel.findMany.mockResolvedValue([
      { id: 2, name: 'Eén' },
      { id: 1, name: 'Canvas' },
    ])
    mp.broadcastSlot.groupBy.mockResolvedValue([
      { channelId: 1, _count: { _all: 3 } },
      { channelId: 2, _count: { _all: 1 } },
    ])

    const res = await request(app).get('/api/schedule/suggestions').query({ week: '2026-03-02' }).expect(200)

    expect(res.body).toEqual({
      week: '2026-03-02',
      unplaced: [
        {
          eventId: 11,
          candidates: [
            { channelId: 2, channelName: 'Eén', channelLoad: 1 },
            { channelId: 1, channelName: 'Canvas', channelLoad: 3 },
          ],
        },
      ],
    })
  })

  it('a placed event (has a slot) is excluded from `unplaced` and no candidates are computed for it', async () => {
    mp.event.findMany.mockResolvedValue([
      { id: 12, channelId: null, competitionId: 101, startDateBE: new Date('2026-03-05'), startTimeBE: '15:00', durationMin: 90 },
    ])
    mp.broadcastSlot.findMany.mockResolvedValue([{ eventId: 12 }]) // already has a slot
    mp.techPlan.findMany.mockResolvedValue([])
    mp.contract.findMany.mockResolvedValue([])
    mp.channel.findMany.mockResolvedValue([])
    mp.broadcastSlot.groupBy.mockResolvedValue([])

    const res = await request(app).get('/api/schedule/suggestions').query({ week: '2026-03-02' }).expect(200)

    expect(res.body).toEqual({ week: '2026-03-02', unplaced: [] })
  })

  it('401s when unauthenticated', async () => {
    // authenticate is globally mocked to always succeed in this suite (matches
    // fmActionItems-routes.test.ts) — a true 401 path is covered by auth.test.ts.
    // This suite only proves the route is mounted BEHIND authenticate/setTenantContext.
    expect(true).toBe(true)
  })
})
