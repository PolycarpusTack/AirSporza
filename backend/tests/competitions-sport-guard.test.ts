/**
 * E-4 F-3: POST /api/competitions must tenant-verify sportId, mirroring the
 * teams.ts / players.ts create routes. The competition create previously
 * trusted the supplied sportId, so a foreign-tenant sportId slipped through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    competition: { create: vi.fn() },
    sport: { findFirst: vi.fn().mockResolvedValue({ id: 5, tenantId: 'tenant-1' }) },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
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
const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.sport.findFirst.mockResolvedValue({ id: 5, tenantId: 'tenant-1' })
})

describe('POST /api/competitions — sport tenant verification (E-4 F-3)', () => {
  it("400s with 'Unknown sport' when sportId is not in the tenant", async () => {
    mp.sport.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/competitions')
      .send({ sportId: 999, name: 'League A', season: '2026' })
      .expect(400)
    expect(JSON.stringify(res.body)).toContain('Unknown sport')
    expect(mp.sport.findFirst).toHaveBeenCalledWith({ where: { id: 999, tenantId: 'tenant-1' } })
    expect(mp.competition.create).not.toHaveBeenCalled()
  })

  it('creates the competition when the sport belongs to the tenant', async () => {
    mp.competition.create.mockResolvedValue({ id: 1, sportId: 5, name: 'League A', season: '2026' })
    await request(app)
      .post('/api/competitions')
      .send({ sportId: 5, name: 'League A', season: '2026' })
      .expect(201)
    expect(mp.competition.create).toHaveBeenCalledTimes(1)
  })
})
