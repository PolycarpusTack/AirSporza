/**
 * TD-31 — POST /api/import/csv must seed default accessibility deliverables for
 * every event it creates.
 *
 * The CSV import route creates events in a single transaction but (pre-TD-31)
 * skipped the RC-2-T1 defaulting hook — imported events had no deliverable rows,
 * silently skewing the RC-2-T2 KPI endpoint and the RC-2-T3
 * ACCESSIBILITY_UNPLANNED check. This route test pins the fix: one seeding
 * createMany per created event, on the SAME transaction client, with the exact
 * shape events.test.ts asserts for the route create sites.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const { txEventCreate, txDeliverableCreateMany, txOutboxCreate } = vi.hoisted(() => ({
  txEventCreate: vi.fn(),
  txDeliverableCreateMany: vi.fn(),
  txOutboxCreate: vi.fn(),
}))

vi.mock('../src/db/prisma.js', () => {
  const tx = {
    event: { create: txEventCreate },
    outboxEvent: { create: txOutboxCreate },
    accessibilityDeliverable: { createMany: txDeliverableCreateMany },
  }
  return {
    prisma: {
      tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
      $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn(),
    },
  }
})

// /api/import mounts importRoutes BEFORE csvImportRoutes; its router-level
// schema-readiness middleware runs for /csv too — stub it (house posture:
// mergeCandidates-tenant-scope.test.ts).
vi.mock('../src/import/services/ImportSchemaService.js', () => ({
  ensureImportSchemaReady: vi.fn().mockResolvedValue(undefined),
  normalizeImportSchemaError: (e: unknown) => e,
}))

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
import { buildDefaultAccessibilityDeliverables } from '../src/config/accessibility.js'

const mp = prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }

const CSV = [
  'Datum BE,Starttijd BE,Deelnemers',
  '2026-09-14,20:30,Test Team A - Test Team B',
  '2026-09-15,18:00,Test Team C - Test Team D',
].join('\n')

let nextEventId = 100

beforeEach(() => {
  vi.clearAllMocks()
  nextEventId = 100
  txEventCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: nextEventId++,
    ...args.data,
  }))
  txOutboxCreate.mockResolvedValue({})
  txDeliverableCreateMany.mockResolvedValue({ count: 3 })
})

describe('POST /api/import/csv — TD-31 accessibility seeding', () => {
  it('seeds the default deliverables for EACH created event, in the same transaction', async () => {
    const res = await request(app)
      .post('/api/import/csv')
      .field('sportId', '5')
      .field('competitionId', '7')
      .attach('file', Buffer.from(CSV), 'events.csv')

    expect(res.status).toBe(200)
    expect(res.body.inserted).toBe(2)
    expect(txEventCreate).toHaveBeenCalledTimes(2)
    // same-transaction proof: the whole import is one $transaction — creates and seeds share it
    expect(mp.$transaction).toHaveBeenCalledTimes(1)

    expect(txDeliverableCreateMany).toHaveBeenCalledTimes(2)
    for (const [i, eventId] of [100, 101].entries()) {
      expect(txDeliverableCreateMany).toHaveBeenNthCalledWith(i + 1, {
        data: buildDefaultAccessibilityDeliverables({ sportId: 5 }).map(d => ({ ...d, eventId, tenantId: 'tenant-1' })),
        skipDuplicates: true,
      })
    }
  })
})
