/**
 * RD-1F — HOTFIX: maxLiveRuns null semantics (defect (a), ADR-015 Acceptance record §2).
 *
 * Exercises the real loader chain of POST /api/schedule-drafts/:id/validate and
 * POST /api/schedule-drafts/:id/publish:
 * loadRightsPolicies (routes/schedules.ts) → RightsPolicy DTO → policyToContractShape
 * (services/validation/rights.ts) → checkRights run-limit branch.
 *
 * Required semantics:
 *   maxLiveRuns: null  → no limit set → run-limit check must NOT fire at all
 *   maxLiveRuns: 0     → explicit limit of zero → MAX_RUNS_EXCEEDED fires
 *   positive limits    → unchanged behavior (regression)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/index.js'
const app = buildApp()
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => {
  const prismaMock: Record<string, unknown> = {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    scheduleDraft: { findFirst: vi.fn(), update: vi.fn() },
    broadcastSlot: { findMany: vi.fn(), updateMany: vi.fn() },
    contract: { findMany: vi.fn() },
    scheduleVersion: { findFirst: vi.fn(), create: vi.fn() },
    outboxEvent: { create: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    // Publish wraps version creation in a transaction — run the callback against this same mock.
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prismaMock) : Promise.all(arg as Promise<unknown>[])
    ),
    $disconnect: vi.fn(),
  }
  return { prisma: prismaMock }
})

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: 'planner' }
    next()
  },
  authorize: (..._roles: string[]) => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mp = prisma as unknown as {
  scheduleDraft: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  broadcastSlot: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> }
  contract: { findMany: ReturnType<typeof vi.fn> }
  scheduleVersion: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  outboxEvent: { create: ReturnType<typeof vi.fn> }
}

const draft = {
  id: 'draft-1',
  tenantId: 'tenant-1',
  channelId: 1,
  dateRangeStart: new Date('2026-07-01'),
  dateRangeEnd: new Date('2026-07-01'),
  operations: [],
  version: 1,
  status: 'EDITING',
}

/** One FULL broadcast slot covering event 100 (competition 10) — counts as 1 draft run. */
const fullSlot = {
  id: 'slot-1',
  tenantId: 'tenant-1',
  channelId: 1,
  eventId: 100,
  contentSegment: 'FULL',
  schedulingMode: 'FIXED',
  plannedStartUtc: new Date('2026-07-01T18:00:00Z'),
  plannedEndUtc: new Date('2026-07-01T20:00:00Z'),
  event: { id: 100, competitionId: 10 },
}

/** Contract covering competition 10 — shape as returned by prisma.contract.findMany. */
function contractWithRunLimit(maxLiveRuns: number | null) {
  return {
    id: 1,
    tenantId: 'tenant-1',
    competitionId: 10,
    status: 'valid',
    territory: [],
    platforms: [],
    maxLiveRuns,
    windowStartUtc: null,
    windowEndUtc: null,
  }
}

async function validateDraft() {
  const res = await request(app).post('/api/schedule-drafts/draft-1/validate').send({})
  expect(res.status).toBe(200)
  return res.body.results as Array<{ code: string; severity: string }>
}

beforeEach(() => {
  vi.clearAllMocks()
  mp.scheduleDraft.findFirst.mockResolvedValue(draft)
  mp.broadcastSlot.findMany.mockResolvedValue([fullSlot])
  // Publish-path arrangements: first version, no pending operations, transaction writes succeed.
  mp.scheduleVersion.findFirst.mockResolvedValue(null)
  mp.scheduleVersion.create.mockResolvedValue({ id: 'version-1', versionNumber: 1 })
  mp.broadcastSlot.updateMany.mockResolvedValue({ count: 1 })
  mp.scheduleDraft.update.mockResolvedValue({ ...draft, status: 'PUBLISHED', version: 2 })
  mp.outboxEvent.create.mockResolvedValue({ id: 'outbox-1' })
})

describe('RD-1F: run-limit null semantics in draft validation', () => {
  it('maxLiveRuns: null means no limit — no MAX_RUNS_* result is emitted (defect (a) reproduction)', async () => {
    mp.contract.findMany.mockResolvedValue([contractWithRunLimit(null)])

    const results = await validateDraft()

    // Defect (a): `maxLiveRuns ?? 0` in loadRightsPolicies turned "no limit set"
    // into an explicit limit of 0, yielding a false blocking MAX_RUNS_EXCEEDED.
    expect(results.filter(r => r.code?.startsWith('MAX_RUNS_'))).toEqual([])
  })

  it('maxLiveRuns: 0 is an explicit limit of zero — MAX_RUNS_EXCEEDED still fires (null vs 0 are distinct)', async () => {
    mp.contract.findMany.mockResolvedValue([contractWithRunLimit(0)])

    const results = await validateDraft()

    const exceeded = results.find(r => r.code === 'MAX_RUNS_EXCEEDED')
    expect(exceeded).toBeDefined()
    expect(exceeded?.severity).toBe('ERROR')
  })

  it('regression: positive limit at capacity still errors (limit 1, one FULL slot in draft)', async () => {
    mp.contract.findMany.mockResolvedValue([contractWithRunLimit(1)])

    const results = await validateDraft()

    const exceeded = results.find(r => r.code === 'MAX_RUNS_EXCEEDED')
    expect(exceeded).toBeDefined()
    expect(exceeded?.severity).toBe('ERROR')
  })

  it('regression: positive limit with headroom emits no MAX_RUNS_* result (limit 5, one FULL slot)', async () => {
    mp.contract.findMany.mockResolvedValue([contractWithRunLimit(5)])

    const results = await validateDraft()

    expect(results.filter(r => r.code?.startsWith('MAX_RUNS_'))).toEqual([])
  })
})

describe('RD-1F: publish is not 422-blocked by an unset run limit', () => {
  it('maxLiveRuns: null — publish succeeds with no ERROR-severity MAX_RUNS_* result (the business pain of defect (a))', async () => {
    mp.contract.findMany.mockResolvedValue([contractWithRunLimit(null)])

    const res = await request(app)
      .post('/api/schedule-drafts/draft-1/publish')
      .send({ acknowledgeWarnings: true })

    // Pre-fix, the false MAX_RUNS_EXCEEDED ERROR made this a 422 ("Validation failed").
    expect(res.status).toBe(201)
    const results = (res.body.validationResults ?? []) as Array<{ code: string; severity: string }>
    expect(results.filter(r => r.code?.startsWith('MAX_RUNS_') && r.severity === 'ERROR')).toEqual([])
  })
})
