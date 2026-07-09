import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/index.js'
const app = buildApp()
import { prisma } from '../src/db/prisma.js'
import { manualMergeNormalizedEvent, manualCreateNormalizedEvent } from '../src/import/services/ImportJobRunner.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    mergeCandidate: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    // ensureImportSchemaReady middleware probes for required import tables — report all present
    $queryRawUnsafe: vi.fn().mockResolvedValue([{
      ImportSource: 'public."ImportSource"',
      ImportJob: 'public."ImportJob"',
      ImportRecord: 'public."ImportRecord"',
      ImportSourceLink: 'public."ImportSourceLink"',
      MergeCandidate: 'public."MergeCandidate"',
      ImportDeadLetter: 'public."ImportDeadLetter"',
      SyncHistory: 'public."SyncHistory"',
    }]),
    $disconnect: vi.fn(),
  }
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, __: unknown, next: () => void) => {
    req.user = { id: 'user-1', email: 'tester@example.com', tenantId: 'tenant-1' }
    next()
  },
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

vi.mock('../src/import/services/ImportJobRunner.js', () => ({
  manualMergeNormalizedEvent: vi.fn(),
  manualCreateNormalizedEvent: vi.fn(),
}))

const candidateMock = (prisma as unknown as {
  mergeCandidate: {
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}).mergeCandidate

const mergeService = manualMergeNormalizedEvent as unknown as ReturnType<typeof vi.fn>
const createService = manualCreateNormalizedEvent as unknown as ReturnType<typeof vi.fn>

const canonical = {
  sportName: 'Football',
  competitionName: 'Cup',
  startsAtUtc: '2026-01-01T18:00:00.000Z',
  status: 'scheduled',
  metadata: {},
}

const importRecord = {
  sourceId: 'src-1',
  sourceRecordId: 'rec-1',
  sourceUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
  normalizedJson: canonical,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// approve-merge
// ---------------------------------------------------------------------------
describe('POST /api/import/merge-candidates/:id/approve-merge — already-decided guard', () => {
  it('returns 409 and does NOT run the merge when candidate is already decided', async () => {
    candidateMock.findFirst.mockResolvedValue({
      id: 'mc1',
      tenantId: 'tenant-1',
      entityType: 'event',
      status: 'approved_merge',
      suggestedEntityId: '123',
      importRecord,
    })

    const res = await request(app)
      .post('/api/import/merge-candidates/mc1/approve-merge')
      .send({ targetEntityId: 123 })

    expect(res.status).toBe(409)
    expect(res.body.status).toBe('fail')
    expect(res.body.message).toMatch(/already been decided/)
    expect(candidateMock.update).not.toHaveBeenCalled()
    expect(mergeService).not.toHaveBeenCalled()
  })

  it('still processes a pending candidate (guard is additive)', async () => {
    candidateMock.findFirst.mockResolvedValue({
      id: 'mc1',
      tenantId: 'tenant-1',
      entityType: 'event',
      status: 'pending',
      suggestedEntityId: null,
      importRecord,
    })
    mergeService.mockResolvedValue({ id: 999 })
    candidateMock.update.mockResolvedValue({ id: 'mc1', status: 'approved_merge' })

    const res = await request(app)
      .post('/api/import/merge-candidates/mc1/approve-merge')
      .send({ targetEntityId: 123 })

    expect(res.status).toBe(200)
    expect(mergeService).toHaveBeenCalledTimes(1)
    expect(candidateMock.update).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// create-new
// ---------------------------------------------------------------------------
describe('POST /api/import/merge-candidates/:id/create-new — already-decided guard', () => {
  it('returns 409 and does NOT create a duplicate event when already decided (AS-7)', async () => {
    candidateMock.findFirst.mockResolvedValue({
      id: 'mc1',
      tenantId: 'tenant-1',
      entityType: 'event',
      status: 'create_new',
      suggestedEntityId: '999',
      importRecord,
    })

    const res = await request(app)
      .post('/api/import/merge-candidates/mc1/create-new')
      .send({})

    expect(res.status).toBe(409)
    expect(res.body.status).toBe('fail')
    expect(res.body.message).toMatch(/already been decided/)
    expect(candidateMock.update).not.toHaveBeenCalled()
    expect(createService).not.toHaveBeenCalled()
  })

  it('still processes a pending candidate (guard is additive)', async () => {
    candidateMock.findFirst.mockResolvedValue({
      id: 'mc1',
      tenantId: 'tenant-1',
      entityType: 'event',
      status: 'pending',
      suggestedEntityId: null,
      importRecord,
    })
    createService.mockResolvedValue({ id: 999 })
    candidateMock.update.mockResolvedValue({ id: 'mc1', status: 'create_new' })

    const res = await request(app)
      .post('/api/import/merge-candidates/mc1/create-new')
      .send({})

    expect(res.status).toBe(200)
    expect(createService).toHaveBeenCalledTimes(1)
    expect(candidateMock.update).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// ignore
// ---------------------------------------------------------------------------
describe('POST /api/import/merge-candidates/:id/ignore — already-decided guard', () => {
  it('returns 409 and does NOT update when already decided', async () => {
    candidateMock.findFirst.mockResolvedValue({
      id: 'mc1',
      tenantId: 'tenant-1',
      status: 'ignored',
    })

    const res = await request(app)
      .post('/api/import/merge-candidates/mc1/ignore')
      .send({})

    expect(res.status).toBe(409)
    expect(res.body.status).toBe('fail')
    expect(res.body.message).toMatch(/already been decided/)
    expect(candidateMock.update).not.toHaveBeenCalled()
  })

  it('still ignores a pending candidate (guard is additive)', async () => {
    candidateMock.findFirst.mockResolvedValue({
      id: 'mc1',
      tenantId: 'tenant-1',
      status: 'pending',
    })
    candidateMock.update.mockResolvedValue({ id: 'mc1', status: 'ignored' })

    const res = await request(app)
      .post('/api/import/merge-candidates/mc1/ignore')
      .send({})

    expect(res.status).toBe(200)
    expect(candidateMock.update).toHaveBeenCalledTimes(1)
  })
})
