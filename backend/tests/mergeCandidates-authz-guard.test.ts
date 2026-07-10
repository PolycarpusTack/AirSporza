/**
 * E-3-T2 — merge-decision WRITE routes must gate by role at the REAL backend
 * boundary. The existing import tests mock `authorize` to a no-op, so they
 * CANNOT catch an authz regression. This test partial-mocks ONLY `authenticate`
 * (to inject a configurable role onto req.user) and keeps the REAL `authorize`,
 * so it actually exercises the role gate.
 *
 * Expected per write route (approve-merge | create-new | ignore):
 *   role 'sports'  -> 403 (dropped — closes the live over-permission)
 *   role 'planner' -> passes the authz gate (NOT 403)
 *   role 'admin'   -> passes the authz gate (NOT 403)
 *
 * Downstream is stubbed: prisma.mergeCandidate.findFirst -> null, so any request
 * that clears the authz gate reaches the handler and returns 404 (a known
 * non-403), proving the route carries the tightened role set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

// Mutable role injected by the (partial) authenticate mock.
let currentRole = 'admin'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    mergeCandidate: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn(),
  },
}))

vi.mock('../src/import/services/ImportSchemaService.js', () => ({
  ensureImportSchemaReady: vi.fn().mockResolvedValue(undefined),
  normalizeImportSchemaError: (e: unknown) => e,
}))

// Partial-mock: keep the REAL `authorize`, override only `authenticate` to
// inject the role under test. This is the whole point — the role gate is real.
vi.mock('../src/middleware/auth.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/middleware/auth.js')>()
  return {
    ...actual,
    authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: 'user-1', email: 'tester@example.com', tenantId: 'tenant-1', role: currentRole }
      next()
    },
  }
})

import { buildApp } from '../src/index.js'
const app = buildApp()

const writeRoutes = [
  { path: 'approve-merge', body: { targetEntityId: 123 } },
  { path: 'create-new', body: {} },
  { path: 'ignore', body: {} },
] as const

beforeEach(() => {
  vi.clearAllMocks()
  currentRole = 'admin'
})

describe.each(writeRoutes)('POST /api/import/merge-candidates/:id/$path — real authorize role gate (E-3-T2)', ({ path, body }) => {
  it("returns 403 for role 'sports' (dropped from the write set)", async () => {
    currentRole = 'sports'
    const res = await request(app).post(`/api/import/merge-candidates/mc1/${path}`).send(body)
    expect(res.status).toBe(403)
  })

  it("passes the authz gate (NOT 403) for role 'planner'", async () => {
    currentRole = 'planner'
    const res = await request(app).post(`/api/import/merge-candidates/mc1/${path}`).send(body)
    expect(res.status).not.toBe(403)
    expect(res.status).toBe(404) // cleared authz -> handler -> candidate not found
  })

  it("passes the authz gate (NOT 403) for role 'admin'", async () => {
    currentRole = 'admin'
    const res = await request(app).post(`/api/import/merge-candidates/mc1/${path}`).send(body)
    expect(res.status).not.toBe(403)
    expect(res.status).toBe(404)
  })
})
