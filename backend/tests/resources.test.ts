import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    resource: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    resourceAssignment: { create: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  }
}))
vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (_: unknown, __: unknown, next: () => void) => next(),
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mockResource = (prisma as unknown as {
  resource: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}).resource

const mockAssignment = (prisma as unknown as {
  resourceAssignment: {
    create: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
}).resourceAssignment

describe('GET /api/resources', () => {
  it('returns list', async () => {
    mockResource.findMany.mockResolvedValue([{ id: 1, name: 'OB Van 1', type: 'ob_van', capacity: 1 }])
    const res = await request(app).get('/api/resources')
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('OB Van 1')
  })
})

describe('POST /api/resources', () => {
  it('valid body returns 201', async () => {
    const created = { id: 2, name: 'Camera Unit A', type: 'camera_unit', capacity: 3, isActive: true, notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    mockResource.create.mockResolvedValue(created)
    const res = await request(app)
      .post('/api/resources')
      .send({ name: 'Camera Unit A', type: 'camera_unit', capacity: 3 })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Camera Unit A')
    expect(res.body.type).toBe('camera_unit')
  })

  it('invalid type returns 400', async () => {
    const res = await request(app)
      .post('/api/resources')
      .send({ name: 'Bad Resource', type: 'invalid_type' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/resources/:id/assign', () => {
  it('returns 201', async () => {
    const resource = { id: 1, name: 'OB Van 1', type: 'ob_van', capacity: 1, isActive: true, notes: null }
    const assignment = { id: 10, resourceId: 1, techPlanId: 5, quantity: 1, notes: null, createdAt: new Date().toISOString() }
    mockResource.findUnique.mockResolvedValue(resource)
    mockAssignment.create.mockResolvedValue(assignment)
    const res = await request(app)
      .post('/api/resources/1/assign')
      .send({ techPlanId: 5 })
    expect(res.status).toBe(201)
    expect(res.body.techPlanId).toBe(5)
    expect(res.body.resourceId).toBe(1)
  })
})
