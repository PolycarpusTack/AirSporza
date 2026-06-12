/**
 * Route-level contract tests for field visibility enforcement (B-1, TD-6).
 * Flag OFF -> responses byte-identical to today. Flag ON -> per-role shaping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'

const authState = { role: 'admin' }

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    fieldDefinition: { findMany: vi.fn().mockResolvedValue([]) },
    event: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    customFieldValue: { findMany: vi.fn().mockResolvedValue([]) },
    techPlan: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn(),
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: authState.role }
    next()
  },
  authorize: (..._roles: string[]) => (_: unknown, __: unknown, next: () => void) => next(),
}))

import { buildApp } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

const app = buildApp()
const mp = prisma as unknown as {
  fieldDefinition: { findMany: ReturnType<typeof vi.fn> }
  event: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> }
  customFieldValue: { findMany: ReturnType<typeof vi.fn> }
  techPlan: { findMany: ReturnType<typeof vi.fn> }
}

const defs = [
  { id: 'venue_info', name: 'venue_info', section: 'event', visibleByRoles: [], sortOrder: 0 },
  { id: 'budget_code', name: 'budget_code', section: 'event', visibleByRoles: ['admin'], sortOrder: 1 },
  { id: 'crew_rate', name: 'crew_rate', section: 'crew', visibleByRoles: ['admin'], sortOrder: 2 },
]

const eventRow = {
  id: 1,
  participants: 'A vs B',
  customFields: { budget_code: 'X-99', venue_info: 'Hall 3' },
}
const values = [
  { fieldId: 'budget_code', fieldValue: 'X-99', entityId: '1' },
  { fieldId: 'venue_info', fieldValue: 'Hall 3', entityId: '1' },
]

beforeEach(() => {
  vi.clearAllMocks()
  authState.role = 'admin'
  mp.fieldDefinition.findMany.mockResolvedValue(defs)
  mp.event.findMany.mockResolvedValue([eventRow])
  mp.event.findFirst.mockResolvedValue(eventRow)
  mp.customFieldValue.findMany.mockResolvedValue(values)
})
afterEach(() => { delete process.env.FIELD_VISIBILITY_ENFORCEMENT })

describe('flag OFF (default) — regression guard', () => {
  it('GET /api/fields returns all definitions for a non-admin', async () => {
    authState.role = 'sports'
    const res = await request(app).get('/api/fields').expect(200)
    expect(res.body).toHaveLength(3)
  })

  it('GET /api/events returns untouched customFields and customValues', async () => {
    authState.role = 'sports'
    const res = await request(app).get('/api/events').expect(200)
    expect(res.body[0].customFields).toEqual(eventRow.customFields)
    expect(res.body[0].customValues).toHaveLength(2)
  })
})

describe('flag ON — enforcement', () => {
  beforeEach(() => { process.env.FIELD_VISIBILITY_ENFORCEMENT = 'true' })

  it('GET /api/fields hides admin-only defs from sports', async () => {
    authState.role = 'sports'
    const res = await request(app).get('/api/fields').expect(200)
    expect(res.body.map((f: { id: string }) => f.id)).toEqual(['venue_info'])
  })

  it('GET /api/fields returns everything for admin', async () => {
    const res = await request(app).get('/api/fields').expect(200)
    expect(res.body).toHaveLength(3)
  })

  it('GET /api/events strips restricted values for sports but keeps open ones', async () => {
    authState.role = 'sports'
    const res = await request(app).get('/api/events').expect(200)
    expect(res.body[0].customFields).toEqual({ venue_info: 'Hall 3' })
    expect(res.body[0].customValues).toEqual([
      { fieldId: 'venue_info', fieldValue: 'Hall 3', entityId: '1' },
    ])
  })

  it('GET /api/events keeps everything for admin', async () => {
    const res = await request(app).get('/api/events').expect(200)
    expect(res.body[0].customFields).toEqual(eventRow.customFields)
    expect(res.body[0].customValues).toHaveLength(2)
  })

  it('GET /api/events/:id strips identically to the list', async () => {
    authState.role = 'planner'
    const res = await request(app).get('/api/events/1').expect(200)
    expect(res.body.customFields).toEqual({ venue_info: 'Hall 3' })
    expect(res.body.customValues).toEqual([
      { fieldId: 'venue_info', fieldValue: 'Hall 3', entityId: '1' },
    ])
  })

  it('GET /api/tech-plans strips restricted crew keys for non-admin', async () => {
    authState.role = 'sports'
    mp.techPlan.findMany.mockResolvedValue([{ id: 1, crew: { director: 'Jane', crew_rate: '500' } }])
    const res = await request(app).get('/api/tech-plans').expect(200)
    expect(res.body[0].crew).toEqual({ director: 'Jane' })
  })
})
