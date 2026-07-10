/**
 * E-3-T2 / F-1 — manual-merge target must be tenant-scoped (defense-in-depth,
 * app-level, independent of RLS).
 *
 * approve-merge lets the user supply `targetEntityId`. Before F-1,
 * `updateImportedEvent` looked the target up by id ONLY — a user could point at
 * ANOTHER tenant's event and merge onto it. After F-1, the manual-merge path
 * scopes the lookup by tenantId, so a cross-tenant target is NOT found and the
 * route errors instead of silently merging.
 *
 * This is a route test with prisma fully mocked. The transaction client's
 * `event.findFirst` returns null when the where-clause carries the wrong
 * tenantId (cross-tenant), and returns the event when the tenant matches
 * (same-tenant — no regression).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

// Transaction-client event methods. findFirst (SCOPED, id+tenantId) and findUnique
// (UNSCOPED, id-only) are DISTINCT spies on purpose: it lets the cross-tenant test
// stub the unscoped lookup to RETURN the foreign event while the scoped lookup misses
// it — so a regression to `findUnique` (dropping the tenant guard) is caught by the
// no-merge OUTCOME, not only by the where-clause shape. Hoisted for the vi.mock factory.
const { txEventFindFirst, txEventFindUnique, txEventUpdate } = vi.hoisted(() => ({
  txEventFindFirst: vi.fn(),
  txEventFindUnique: vi.fn(),
  txEventUpdate: vi.fn(),
}))

vi.mock('../src/db/prisma.js', () => {
  const tx = {
    event: { findFirst: txEventFindFirst, findUnique: txEventFindUnique, update: txEventUpdate },
  }
  return {
    prisma: {
      tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
      mergeCandidate: { findFirst: vi.fn(), update: vi.fn() },
      sport: { findFirst: vi.fn().mockResolvedValue({ id: 5, tenantId: 'tenant-1' }) },
      canonicalCompetition: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      competition: {
        findUnique: vi.fn().mockResolvedValue({ id: 2, matches: 0 }),
        update: vi.fn().mockResolvedValue({ id: 2 }),
        create: vi.fn().mockResolvedValue({ id: 2 }),
        findFirst: vi.fn().mockResolvedValue({ id: 2 }),
      },
      competitionAlias: { upsert: vi.fn().mockResolvedValue({}) },
      importSourceLink: { upsert: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn(),
    },
  }
})

vi.mock('../src/import/services/ImportSchemaService.js', () => ({
  ensureImportSchemaReady: vi.fn().mockResolvedValue(undefined),
  normalizeImportSchemaError: (e: unknown) => e,
}))

// Keep provision's projection light: stub governance + outbox side effects.
vi.mock('../src/import/services/ImportGovernanceService.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/import/services/ImportGovernanceService.js')>()
  return {
    ...actual,
    getFieldSourceCodes: vi.fn().mockResolvedValue({}),
    recordFieldProvenance: vi.fn().mockResolvedValue(undefined),
    shouldApplyImportedField: vi.fn().mockReturnValue(true),
  }
})

vi.mock('../src/services/outbox.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/services/outbox.js')>()
  return { ...actual, writeOutboxEvent: vi.fn().mockResolvedValue(undefined) }
})

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', email: 'tester@example.com', tenantId: 'tenant-1', role: 'admin' }
    next()
  },
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

import { buildApp } from '../src/index.js'
const app = buildApp()
import { prisma } from '../src/db/prisma.js'

const mp = prisma as unknown as {
  mergeCandidate: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}

const canonical = {
  sportName: 'Football',
  competitionName: 'Cup',
  startsAtUtc: '2026-01-01T18:00:00.000Z',
  status: 'scheduled',
  metadata: {},
}

const pendingCandidate = {
  id: 'mc1',
  tenantId: 'tenant-1',
  entityType: 'event',
  status: 'pending',
  suggestedEntityId: null,
  importRecord: {
    sourceId: 'src-1',
    sourceRecordId: 'rec-1',
    sourceUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
    normalizedJson: canonical,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mp.mergeCandidate.findFirst.mockResolvedValue(pendingCandidate)
  mp.mergeCandidate.update.mockResolvedValue({ id: 'mc1', status: 'approved_merge' })
})

describe('POST /api/import/merge-candidates/:id/approve-merge — F-1 tenant-scoped target', () => {
  it('does NOT merge onto a cross-tenant target (event not found) and the route errors', async () => {
    // The user-supplied targetEntityId (999) belongs to ANOTHER tenant. The
    // tenant-scoped lookup (findFirst) misses it → null. But an UNSCOPED lookup
    // (findUnique) WOULD find it — stub that so a regression to id-only lookup
    // actually reproduces the threat (finds + merges the foreign event).
    txEventFindFirst.mockResolvedValue(null)
    txEventFindUnique.mockResolvedValue({ id: 999, tenantId: 'other-tenant', participants: 'Foreign event' })

    const res = await request(app)
      .post('/api/import/merge-candidates/mc1/approve-merge')
      .send({ targetEntityId: 999 })

    expect(res.status).not.toBe(200)
    // Lookup was tenant-scoped (id + tenantId), not id-only.
    expect(txEventFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 999, tenantId: 'tenant-1' } }),
    )
    // Merge did NOT complete — INDEPENDENT of the where-clause assertion: even
    // though the unscoped findUnique returns the foreign event, the guard used
    // the scoped findFirst (null) so no update fired. Reverting to findUnique
    // would find the foreign event and trip these.
    expect(mp.mergeCandidate.update).not.toHaveBeenCalled()
    expect(txEventUpdate).not.toHaveBeenCalled()
  })

  it('still merges onto a same-tenant target (no regression)', async () => {
    txEventFindFirst.mockResolvedValue({ id: 123, tenantId: 'tenant-1', participants: 'A vs B' })
    txEventUpdate.mockResolvedValue({ id: 123, tenantId: 'tenant-1' })

    const res = await request(app)
      .post('/api/import/merge-candidates/mc1/approve-merge')
      .send({ targetEntityId: 123 })

    expect(res.status).toBe(200)
    expect(txEventFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 123, tenantId: 'tenant-1' } }),
    )
    expect(txEventUpdate).toHaveBeenCalledTimes(1)
    expect(mp.mergeCandidate.update).toHaveBeenCalledTimes(1)
  })
})
