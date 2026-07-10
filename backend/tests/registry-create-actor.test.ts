/**
 * E-4 F-2: the four registry create routes (sports/competitions/teams/players)
 * record no actor — unlike the merge path (reviewedBy/reviewedAt). None of the
 * four models has a createdBy column, so the LIGHTEST correct attribution
 * (no schema migration) is an audit-log emit on create, mirroring events.ts.
 * This asserts the audit write fires with the acting user + entity identity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

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
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn(),
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => {
    req.user = { id: 'actor-42', role: 'admin' }
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

function lastAudit() {
  return mp.auditLog.create.mock.calls[0][0].data as Record<string, unknown>
}

describe('registry create routes — actor attribution via audit log (E-4 F-2)', () => {
  it('POST /api/sports emits sport.create audit with the acting user', async () => {
    mp.sport.create.mockResolvedValue({ id: 7, name: 'Football' })
    await request(app).post('/api/sports').send({ name: 'Football', icon: '⚽', federation: 'FIFA' }).expect(201)
    expect(mp.auditLog.create).toHaveBeenCalledTimes(1)
    expect(lastAudit()).toMatchObject({ userId: 'actor-42', action: 'sport.create', entityType: 'sport', entityId: '7' })
  })

  it('POST /api/competitions emits competition.create audit with the acting user', async () => {
    mp.competition.create.mockResolvedValue({ id: 8, name: 'League A', sportId: 5 })
    await request(app).post('/api/competitions').send({ sportId: 5, name: 'League A', season: '2026' }).expect(201)
    expect(mp.auditLog.create).toHaveBeenCalledTimes(1)
    expect(lastAudit()).toMatchObject({ userId: 'actor-42', action: 'competition.create', entityType: 'competition', entityId: '8' })
  })

  it('POST /api/teams emits team.create audit with the acting user', async () => {
    mp.team.create.mockResolvedValue({ id: 9, name: 'Riverside United' })
    await request(app).post('/api/teams').send({ name: 'Riverside United' }).expect(201)
    expect(mp.auditLog.create).toHaveBeenCalledTimes(1)
    expect(lastAudit()).toMatchObject({ userId: 'actor-42', action: 'team.create', entityType: 'team', entityId: '9' })
  })

  it('POST /api/players emits player.create audit with the acting user', async () => {
    mp.player.create.mockResolvedValue({ id: 10, fullName: 'Jonas Vale', sportId: 5 })
    await request(app).post('/api/players').send({ fullName: 'Jonas Vale', sportId: 5 }).expect(201)
    expect(mp.auditLog.create).toHaveBeenCalledTimes(1)
    expect(lastAudit()).toMatchObject({ userId: 'actor-42', action: 'player.create', entityType: 'player', entityId: '10' })
  })
})
