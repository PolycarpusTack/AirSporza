/**
 * SV-2-T3 — read-only ripple-proposal surface (Contract Snapshot `ripple v1`):
 * GET /api/ripple-proposals (ADR-009 pagination; status/eventId filters) +
 * GET /api/ripple-proposals/:id. Tenant-scoped from the auth context;
 * cross-tenant/unknown id → 404. NO accept/reject here — that is SV-3
 * (ADR-019 Open assumption 2 boundary).
 *
 * supertest + mocked prisma (rightsWindows-routes.test.ts pattern).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    rippleProposal: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
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

const UUID = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'

const proposal = {
  id: UUID,
  tenantId: 'tenant-1',
  eventId: 42,
  source: 'FEED',
  sourceChangeId: 'feed:42:abc',
  status: 'PENDING',
  beforeSlots: [{ slotId: 's1' }],
  preview: { proposed: [], manualReviewSlots: [], rights: null },
  confidence: null,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  decidedAt: null,
  decidedBy: null,
  rationale: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.rippleProposal.findMany.mockResolvedValue([])
  mp.rippleProposal.findFirst.mockResolvedValue(null)
})

describe('GET /api/ripple-proposals', () => {
  it('lists tenant-scoped proposals, newest first (createdAt desc, id desc)', async () => {
    mp.rippleProposal.findMany.mockResolvedValue([proposal])
    const res = await request(app).get('/api/ripple-proposals').expect(200)
    expect(res.body.proposals).toHaveLength(1)
    expect(res.body.proposals[0].id).toBe(UUID)
    expect(res.body.hasMore).toBe(false)
    expect(res.body.nextCursor).toBeNull()
    const args = mp.rippleProposal.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ tenantId: 'tenant-1' })
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
  })

  it('filters by status and eventId', async () => {
    await request(app).get('/api/ripple-proposals?status=PENDING&eventId=42').expect(200)
    expect(mp.rippleProposal.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      status: 'PENDING',
      eventId: 42,
    })
  })

  it('400s an unknown status (validated against the Prisma enum — TD-28-clean)', async () => {
    await request(app).get('/api/ripple-proposals?status=BOGUS').expect(400)
    expect(mp.rippleProposal.findMany).not.toHaveBeenCalled()
  })

  it('400s a non-positive eventId', async () => {
    await request(app).get('/api/ripple-proposals?eventId=nope').expect(400)
    expect(mp.rippleProposal.findMany).not.toHaveBeenCalled()
  })

  it('paginates per ADR-009: take limit+1, hasMore drops the extra, opaque base64url cursor', async () => {
    const p2 = { ...proposal, id: UUID2 }
    mp.rippleProposal.findMany.mockResolvedValue([proposal, p2]) // limit 1 → one extra
    const res = await request(app).get('/api/ripple-proposals?limit=1').expect(200)
    expect(res.body.proposals).toHaveLength(1)
    expect(res.body.hasMore).toBe(true)
    expect(res.body.nextCursor).toBe(Buffer.from(UUID).toString('base64url'))
    expect(mp.rippleProposal.findMany.mock.calls[0][0].take).toBe(2)
  })

  it('continues from a supplied cursor (Prisma cursor + skip 1)', async () => {
    const cursor = Buffer.from(UUID).toString('base64url')
    await request(app).get(`/api/ripple-proposals?cursor=${cursor}`).expect(200)
    const args = mp.rippleProposal.findMany.mock.calls[0][0]
    expect(args.cursor).toEqual({ id: UUID })
    expect(args.skip).toBe(1)
  })

  it('400s a corrupt cursor (never a Prisma uuid-syntax 500)', async () => {
    await request(app).get('/api/ripple-proposals?cursor=%%%not-b64%%%').expect(400)
    expect(mp.rippleProposal.findMany).not.toHaveBeenCalled()
  })

  it('clamps limit to the 1..200 range', async () => {
    await request(app).get('/api/ripple-proposals?limit=9999').expect(200)
    expect(mp.rippleProposal.findMany.mock.calls[0][0].take).toBe(201)
  })

  it('limit=0 falls back to the default page size (falsy → default, not an empty page)', async () => {
    await request(app).get('/api/ripple-proposals?limit=0').expect(200)
    expect(mp.rippleProposal.findMany.mock.calls[0][0].take).toBe(101)
  })

  it('negative limit clamps to 1', async () => {
    await request(app).get('/api/ripple-proposals?limit=-5').expect(200)
    expect(mp.rippleProposal.findMany.mock.calls[0][0].take).toBe(2)
  })
})

describe('GET /api/ripple-proposals/:id', () => {
  it('returns a tenant-owned proposal with the full ripple v1 read shape', async () => {
    mp.rippleProposal.findFirst.mockResolvedValue(proposal)
    const res = await request(app).get(`/api/ripple-proposals/${UUID}`).expect(200)
    expect(res.body).toMatchObject({
      id: UUID,
      eventId: 42,
      source: 'FEED',
      status: 'PENDING',
      sourceChangeId: 'feed:42:abc',
      confidence: null,
      beforeSlots: [{ slotId: 's1' }],
      preview: { proposed: [], manualReviewSlots: [], rights: null },
    })
    // The lookup MUST be tenant-scoped (auth context, never client input):
    expect(mp.rippleProposal.findFirst.mock.calls[0][0].where).toEqual({
      id: UUID,
      tenantId: 'tenant-1',
    })
  })

  it('404s a cross-tenant/unknown id (tenant-scoped miss — no existence leak)', async () => {
    mp.rippleProposal.findFirst.mockResolvedValue(null)
    await request(app).get(`/api/ripple-proposals/${UUID2}`).expect(404)
    expect(mp.rippleProposal.findFirst.mock.calls[0][0].where).toEqual({
      id: UUID2,
      tenantId: 'tenant-1',
    })
  })

  it('400s a non-uuid id', async () => {
    await request(app).get('/api/ripple-proposals/not-a-uuid').expect(400)
    expect(mp.rippleProposal.findFirst).not.toHaveBeenCalled()
  })
})

describe('SV-2 boundary — NO review mutations ship in this story (SV-3 owns accept/reject)', () => {
  it.each(['post', 'put', 'patch', 'delete'] as const)('%s on a proposal id is 404 (no route)', async (verb) => {
    await request(app)[verb](`/api/ripple-proposals/${UUID}`).expect(404)
  })

  it('POST /api/ripple-proposals/:id/accept does not exist', async () => {
    await request(app).post(`/api/ripple-proposals/${UUID}/accept`).expect(404)
  })

  it('POST /api/ripple-proposals/:id/reject does not exist', async () => {
    await request(app).post(`/api/ripple-proposals/${UUID}/reject`).expect(404)
  })
})
