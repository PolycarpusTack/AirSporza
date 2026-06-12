/**
 * EPIC G-5: /api/players routes — CRUD, protected remarks (PATCH notes),
 * team-membership CRUD, and ADR-009 pagination, mirroring the teams patterns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    player: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    playerTeam: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      delete: vi.fn(),
    },
    team: { findFirst: vi.fn().mockResolvedValue(null) },
    competition: { findFirst: vi.fn().mockResolvedValue(null) },
    sport: { findFirst: vi.fn().mockResolvedValue(null) },
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
    (req: { user?: { role?: string } }, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
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

const player = { id: 1, fullName: 'Hans Vanaken', tenantId: 'tenant-1', isManaged: false, notes: null }

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.player.findMany.mockResolvedValue([player])
  mp.player.findFirst.mockResolvedValue(null)
  mp.player.count.mockResolvedValue(7)
  mp.playerTeam.findMany.mockResolvedValue([])
  mp.playerTeam.findFirst.mockResolvedValue(null)
  mp.team.findFirst.mockResolvedValue(null)
  mp.competition.findFirst.mockResolvedValue(null)
  // G review fix F4: sportId is tenant-verified on create/update.
  mp.sport.findFirst.mockResolvedValue({ id: 5, tenantId: 'tenant-1' })
})

describe('GET /api/players', () => {
  it('legacy mode: plain array, no count, no take/skip', async () => {
    const res = await request(app).get('/api/players').expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(mp.player.count).not.toHaveBeenCalled()
    expect(mp.player.findMany.mock.calls[0][0].take).toBeUndefined()
  })

  it('paginated: envelope with fullName,id ordering and take/skip', async () => {
    const res = await request(app).get('/api/players?limit=10&offset=20').expect(200)
    expect(res.body.pagination).toEqual({ total: 7, limit: 10, offset: 20 })
    const args = mp.player.findMany.mock.calls[0][0]
    expect(args.take).toBe(10)
    expect(args.skip).toBe(20)
    expect(args.orderBy).toEqual([{ fullName: 'asc' }, { id: 'asc' }])
  })

  it('rejects limit > 200', async () => {
    await request(app).get('/api/players?limit=999').expect(400)
  })

  it('applies search/teamId/managed filters', async () => {
    await request(app).get('/api/players?search=vana&teamId=7&managed=true').expect(200)
    const where = mp.player.findMany.mock.calls[0][0].where
    expect(where.fullName).toEqual({ contains: 'vana', mode: 'insensitive' })
    // G review fix F6: roster reads only return CURRENT memberships.
    expect(where.teamLinks).toEqual({ some: { teamId: 7, isCurrent: true } })
    expect(where.isManaged).toBe(true)
  })

  it('?teamId excludes ended memberships (isCurrent: false) from the roster (G review fix F6)', async () => {
    await request(app).get('/api/players?teamId=7').expect(200)
    const where = mp.player.findMany.mock.calls[0][0].where
    expect(where.teamLinks.some.isCurrent).toBe(true)
  })
})

describe('GET /api/players/:id', () => {
  it('returns the player when found', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    const res = await request(app).get('/api/players/1').expect(200)
    expect(res.body.fullName).toBe('Hans Vanaken')
  })

  it('404s for an unknown player', async () => {
    await request(app).get('/api/players/99').expect(404)
  })
})

describe('POST /api/players', () => {
  it('creates a player as admin, converting birthDate to a date', async () => {
    mp.player.create.mockResolvedValue({ id: 2, fullName: 'New Player' })
    await request(app)
      .post('/api/players')
      .send({ fullName: 'New Player', sportId: 5, birthDate: '1990-01-31', countryCode: 'BE' })
      .expect(201)
    const data = mp.player.create.mock.calls[0][0].data
    expect(data.fullName).toBe('New Player')
    expect(data.birthDate).toEqual(new Date('1990-01-31T00:00:00.000Z'))
    expect(data.tenantId).toBe('tenant-1')
    expect(data.isManaged).toBe(false)
  })

  it('rejects non-admin roles', async () => {
    await request(app)
      .post('/api/players')
      .set('x-test-role', 'sports')
      .send({ fullName: 'New Player', sportId: 5 })
      .expect(403)
  })

  it('rejects an invalid payload', async () => {
    await request(app).post('/api/players').send({ sportId: 5 }).expect(400)
  })

  it("400s with 'Unknown sport' when the sport is not in the tenant (G review fix F4)", async () => {
    mp.sport.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/players')
      .send({ fullName: 'New Player', sportId: 999 })
      .expect(400)
    expect(JSON.stringify(res.body)).toContain('Unknown sport')
    expect(mp.sport.findFirst).toHaveBeenCalledWith({ where: { id: 999, tenantId: 'tenant-1' } })
    expect(mp.player.create).not.toHaveBeenCalled()
  })
})

describe('PUT /api/players/:id', () => {
  it('updates an existing player', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    mp.player.update.mockResolvedValue({ ...player, position: 'Striker' })
    const res = await request(app).put('/api/players/1').send({ position: 'Striker' }).expect(200)
    expect(res.body.position).toBe('Striker')
  })

  it('404s for an unknown player', async () => {
    await request(app).put('/api/players/99').send({ position: 'Striker' }).expect(404)
  })

  it("400s with 'Unknown sport' for a cross-tenant sportId (G review fix F4)", async () => {
    mp.player.findFirst.mockResolvedValue(player)
    mp.sport.findFirst.mockResolvedValue(null)
    await request(app).put('/api/players/1').send({ sportId: 999 }).expect(400)
    expect(mp.player.update).not.toHaveBeenCalled()
  })

  it('skips the sport check when sportId is absent (G review fix F4)', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    mp.player.update.mockResolvedValue(player)
    await request(app).put('/api/players/1').send({ position: 'Striker' }).expect(200)
    expect(mp.sport.findFirst).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/players/:id/notes (protected remarks)', () => {
  it('lets the sports role update notes', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    mp.player.update.mockResolvedValue({ ...player, notes: 'Watch his contract' })
    const res = await request(app)
      .patch('/api/players/1/notes')
      .set('x-test-role', 'sports')
      .send({ notes: 'Watch his contract' })
      .expect(200)
    expect(res.body.notes).toBe('Watch his contract')
    expect(mp.player.update.mock.calls[0][0].data).toEqual({ notes: 'Watch his contract' })
  })

  it('rejects the planner role', async () => {
    await request(app)
      .patch('/api/players/1/notes')
      .set('x-test-role', 'planner')
      .send({ notes: 'nope' })
      .expect(403)
  })
})

describe('player team memberships', () => {
  it('GET /:id/teams lists memberships', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    mp.playerTeam.findMany.mockResolvedValue([{ id: 3, teamId: 7 }])
    const res = await request(app).get('/api/players/1/teams').expect(200)
    expect(res.body).toHaveLength(1)
  })

  it('POST /:id/teams creates a membership', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    mp.team.findFirst.mockResolvedValue({ id: 7, tenantId: 'tenant-1' })
    mp.playerTeam.create.mockResolvedValue({ id: 3, playerId: 1, teamId: 7 })
    const res = await request(app)
      .post('/api/players/1/teams')
      .set('x-test-role', 'sports')
      .send({ teamId: 7 })
      .expect(201)
    expect(res.body.teamId).toBe(7)
    const data = mp.playerTeam.create.mock.calls[0][0].data
    expect(data).toMatchObject({ playerId: 1, teamId: 7, seasonId: null, isCurrent: true, source: 'manual' })
  })

  // G review fix F2: a duplicate is now a 409 (was a silent 200 echo), and the
  // guard keys on the DB unique (playerId, teamId, seasonId) — NULL-aware.
  it('POST /:id/teams 409s on the NULL-season duplicate (G review fix F2)', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    mp.team.findFirst.mockResolvedValue({ id: 7, tenantId: 'tenant-1' })
    mp.playerTeam.findFirst.mockResolvedValue({ id: 3, playerId: 1, teamId: 7 })
    await request(app).post('/api/players/1/teams').send({ teamId: 7 }).expect(409)
    expect(mp.playerTeam.create).not.toHaveBeenCalled()
  })

  it('POST /:id/teams 409s (not 500) for the same player+team+season under a DIFFERENT competition (G review fix F2)', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    mp.team.findFirst.mockResolvedValue({ id: 7, tenantId: 'tenant-1' })
    mp.competition.findFirst.mockResolvedValue({ id: 42, tenantId: 'tenant-1' })
    // Existing row was created under competition 41 — the DB unique
    // (playerId, teamId, seasonId) would still reject the insert.
    mp.playerTeam.findFirst.mockResolvedValue({ id: 3, playerId: 1, teamId: 7, competitionId: 41, seasonId: null })

    const res = await request(app)
      .post('/api/players/1/teams')
      .send({ teamId: 7, competitionId: 42 })
      .expect(409)

    expect(JSON.stringify(res.body)).toContain('already has a membership')
    expect(mp.playerTeam.create).not.toHaveBeenCalled()
    // The guard must key on the unique's columns — competitionId is NOT part of it.
    const guardWhere = mp.playerTeam.findFirst.mock.calls[0][0].where
    expect(guardWhere).toEqual({ playerId: 1, teamId: 7, seasonId: null })
  })

  it('POST /:id/teams requires teamId or competitionId', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    await request(app).post('/api/players/1/teams').send({ seasonId: 2 }).expect(400)
  })

  it('POST /:id/teams 404s for an unknown team', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    await request(app).post('/api/players/1/teams').send({ teamId: 999 }).expect(404)
  })

  it('DELETE /:id/teams/:linkId removes the membership', async () => {
    mp.playerTeam.findFirst.mockResolvedValue({ id: 3, playerId: 1 })
    mp.playerTeam.delete.mockResolvedValue({})
    await request(app).delete('/api/players/1/teams/3').expect(200)
    expect(mp.playerTeam.delete).toHaveBeenCalledWith({ where: { id: 3 } })
  })
})

describe('DELETE /api/players/:id', () => {
  it('deletes an existing player as admin', async () => {
    mp.player.findFirst.mockResolvedValue(player)
    mp.player.delete.mockResolvedValue({})
    await request(app).delete('/api/players/1').expect(200)
  })

  it('rejects non-admin roles', async () => {
    await request(app).delete('/api/players/1').set('x-test-role', 'sports').expect(403)
  })
})
