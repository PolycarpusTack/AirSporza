/**
 * C-4-T0: registry create routes map a Prisma P2002 (unique-constraint) violation
 * to a 409 with an honest 'already exists' message — instead of the generic 500
 * the raw P2002 currently produces. Mirrors crewMembers.ts / savedViews.ts.
 * Additive: the SUCCESS path (201) is re-asserted unchanged per route.
 *
 * The P2002 error is a REAL `Prisma.PrismaClientKnownRequestError` (Prisma 5.22)
 * so the routes' `instanceof Prisma.PrismaClientKnownRequestError` guard matches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { Prisma } from '@prisma/client'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    sport: {
      findFirst: vi.fn().mockResolvedValue({ id: 5, tenantId: 'tenant-1' }),
      create: vi.fn(),
    },
    competition: { create: vi.fn() },
    team: { create: vi.fn() },
    player: { create: vi.fn() },
    // E-4 F-2: registry create routes now emit an audit-log entry (actor attribution).
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

/** A REAL P2002 so the routes' `instanceof Prisma.PrismaClientKnownRequestError` guard fires. */
const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  })

beforeEach(() => {
  vi.clearAllMocks()
  mp.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mp.sport.findFirst.mockResolvedValue({ id: 5, tenantId: 'tenant-1' })
})

describe('POST /api/sports — duplicate → 409 (C-4-T0)', () => {
  it('maps P2002 to 409 with the sport message', async () => {
    mp.sport.create.mockRejectedValue(p2002())
    const res = await request(app)
      .post('/api/sports')
      .send({ name: 'Football', icon: '⚽', federation: 'FIFA' })
      .expect(409)
    expect(JSON.stringify(res.body)).toContain('A sport with that name already exists')
  })

  it('still 201s on a successful create', async () => {
    mp.sport.create.mockResolvedValue({ id: 1, name: 'Football', icon: '⚽', federation: 'FIFA' })
    await request(app).post('/api/sports').send({ name: 'Football', icon: '⚽', federation: 'FIFA' }).expect(201)
  })
})

describe('POST /api/competitions — duplicate → 409 (C-4-T0)', () => {
  it('maps P2002 to 409 with the competition message', async () => {
    mp.competition.create.mockRejectedValue(p2002())
    const res = await request(app)
      .post('/api/competitions')
      .send({ sportId: 5, name: 'League A', season: '2026' })
      .expect(409)
    expect(JSON.stringify(res.body)).toContain('A competition with that name and season already exists')
  })

  it('still 201s on a successful create', async () => {
    mp.competition.create.mockResolvedValue({ id: 1, sportId: 5, name: 'League A', season: '2026' })
    await request(app).post('/api/competitions').send({ sportId: 5, name: 'League A', season: '2026' }).expect(201)
  })
})

describe('POST /api/teams — duplicate → 409 (C-4-T0)', () => {
  it('maps P2002 to 409 with the team message', async () => {
    mp.team.create.mockRejectedValue(p2002())
    const res = await request(app).post('/api/teams').send({ name: 'Riverside United' }).expect(409)
    expect(JSON.stringify(res.body)).toContain('A team with that name already exists')
  })

  it('still 201s on a successful create', async () => {
    mp.team.create.mockResolvedValue({ id: 1, name: 'Riverside United' })
    await request(app).post('/api/teams').send({ name: 'Riverside United' }).expect(201)
  })
})

describe('POST /api/players — duplicate → 409 (C-4-T0)', () => {
  it('maps P2002 to 409 with the player message', async () => {
    mp.player.create.mockRejectedValue(p2002())
    const res = await request(app)
      .post('/api/players')
      .send({ fullName: 'Jonas Vale', sportId: 5 })
      .expect(409)
    expect(JSON.stringify(res.body)).toContain('A player with those details already exists')
  })

  it('still 201s on a successful create', async () => {
    mp.player.create.mockResolvedValue({ id: 1, fullName: 'Jonas Vale', sportId: 5 })
    await request(app).post('/api/players').send({ fullName: 'Jonas Vale', sportId: 5 }).expect(201)
  })
})
