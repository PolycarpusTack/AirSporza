import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    resource: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    resourceAssignment: { create: vi.fn(), delete: vi.fn(), findMany: vi.fn() }
  }
}))
vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (_: unknown, __: unknown, next: () => void) => next(),
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mock = (prisma as unknown as { resource: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }).resource

describe('GET /api/resources', () => {
  it('returns list', async () => {
    mock.findMany.mockResolvedValue([{ id: 1, name: 'OB Van 1', type: 'ob_van', capacity: 1 }])
    const res = await request(app).get('/api/resources')
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('OB Van 1')
  })
})
