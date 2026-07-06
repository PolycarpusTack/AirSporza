/**
 * C-1-T0 (EPIC C Registry, HYBRID re-gate 2026-07-05): the three registry list
 * routes gain ADDITIVE payload embeds so the frontend can derive LINKED-record
 * summaries without an N+1 fan-out. No endpoint/verb/filter changes — only new
 * `include` keys on the existing `findMany` list handlers:
 *   - competitions list `_count` gains `teamLinks`
 *   - teams list gains `_count: { competitionLinks, playerLinks (isCurrent only) }`
 *   - players list gains a current-team embed (`teamLinks where isCurrent → team`)
 *
 * Prisma is fully mocked, so these assert the QUERY SHAPE passed to findMany
 * (the house route-test idiom — cf. players-routes.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    competition: { findMany: vi.fn().mockResolvedValue([]) },
    team: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    player: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
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
const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-1', slug: 'default' })
  mockPrisma.competition.findMany.mockResolvedValue([])
  mockPrisma.team.findMany.mockResolvedValue([])
  mockPrisma.player.findMany.mockResolvedValue([])
})

describe('GET /api/competitions — registry LINKED embed (C-1-T0)', () => {
  it('counts team memberships alongside the existing event count', async () => {
    await request(app).get('/api/competitions').expect(200)
    const { include } = mockPrisma.competition.findMany.mock.calls[0][0]
    // additive — the existing sport include and events count must survive
    expect(include.sport).toBe(true)
    expect(include._count.select.events).toBe(true)
    expect(include._count.select.teamLinks).toBe(true)
  })
})

describe('GET /api/teams — registry LINKED embed (C-1-T0)', () => {
  it('counts competition memberships and CURRENT player memberships', async () => {
    await request(app).get('/api/teams').expect(200)
    const { include } = mockPrisma.team.findMany.mock.calls[0][0]
    // additive — the existing sport include must survive intact (shape, not just presence)
    expect(include.sport).toEqual({ select: { id: true, name: true, icon: true } })
    expect(include._count.select).toEqual({
      competitionLinks: true,
      // filtered relation count — ended stints (isCurrent: false) do not count as
      // today's squad (mirrors the ?teamId roster-read rule, players.ts F6)
      playerLinks: { where: { isCurrent: true } },
    })
  })
})

describe('GET /api/players — registry current-team embed (C-1-T0)', () => {
  it('embeds the current team (id + name) via the isCurrent membership', async () => {
    await request(app).get('/api/players').expect(200)
    const { include } = mockPrisma.player.findMany.mock.calls[0][0]
    // additive — the existing sport include must survive intact (shape, not just presence)
    expect(include.sport).toEqual({ select: { id: true, name: true, icon: true } })
    expect(include.teamLinks).toEqual({
      where: { isCurrent: true },
      select: { team: { select: { id: true, name: true } } },
    })
  })
})
