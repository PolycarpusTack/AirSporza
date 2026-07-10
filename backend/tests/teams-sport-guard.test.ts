/**
 * G review fix F4: /api/teams create/update must tenant-verify sportId
 * (same pre-existing gap as the players routes — fixed together).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    team: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
    },
    sport: { findFirst: vi.fn().mockResolvedValue(null) },
    // E-4 F-2: team create now emits an audit-log entry for actor attribution.
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

const team = { id: 1, name: 'Club Brugge', tenantId: 'tenant-1', isManaged: false }

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.team.findFirst.mockResolvedValue(null)
  mp.sport.findFirst.mockResolvedValue({ id: 5, tenantId: 'tenant-1' })
})

describe('POST /api/teams — sport tenant verification (G review fix F4)', () => {
  it("400s with 'Unknown sport' when sportId is not in the tenant", async () => {
    mp.sport.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/teams')
      .send({ name: 'New Team', sportId: 999 })
      .expect(400)
    expect(JSON.stringify(res.body)).toContain('Unknown sport')
    expect(mp.sport.findFirst).toHaveBeenCalledWith({ where: { id: 999, tenantId: 'tenant-1' } })
    expect(mp.team.create).not.toHaveBeenCalled()
  })

  it('creates the team when the sport belongs to the tenant', async () => {
    mp.team.create.mockResolvedValue({ id: 2, name: 'New Team', sportId: 5 })
    await request(app).post('/api/teams').send({ name: 'New Team', sportId: 5 }).expect(201)
    expect(mp.team.create).toHaveBeenCalledTimes(1)
  })

  it('skips the sport check when sportId is absent', async () => {
    mp.team.create.mockResolvedValue({ id: 2, name: 'New Team' })
    await request(app).post('/api/teams').send({ name: 'New Team' }).expect(201)
    expect(mp.sport.findFirst).not.toHaveBeenCalled()
  })
})

describe('PUT /api/teams/:id — sport tenant verification (G review fix F4)', () => {
  it("400s with 'Unknown sport' for a cross-tenant sportId", async () => {
    mp.team.findFirst.mockResolvedValue(team)
    mp.sport.findFirst.mockResolvedValue(null)
    await request(app).put('/api/teams/1').send({ sportId: 999 }).expect(400)
    expect(mp.team.update).not.toHaveBeenCalled()
  })

  it('updates the team when the sport belongs to the tenant', async () => {
    mp.team.findFirst.mockResolvedValue(team)
    mp.team.update.mockResolvedValue({ ...team, sportId: 5 })
    await request(app).put('/api/teams/1').send({ sportId: 5 }).expect(200)
    expect(mp.team.update).toHaveBeenCalledTimes(1)
  })
})
