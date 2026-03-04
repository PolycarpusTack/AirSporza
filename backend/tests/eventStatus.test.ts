import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    event: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $disconnect: vi.fn(),
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: (req as { headers: { 'x-test-role'?: string } }).headers['x-test-role'] ?? 'planner' }
    next()
  },
  authorize: (..._roles: string[]) => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mp = prisma as unknown as {
  event: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  auditLog: { create: ReturnType<typeof vi.fn> }
}

beforeEach(() => vi.clearAllMocks())

describe('PATCH /api/events/:id/status', () => {
  it('422 when transition not allowed for role', async () => {
    mp.event.findUnique.mockResolvedValue({ id: 1, status: 'draft', createdById: null })
    const res = await request(app)
      .patch('/api/events/1/status')
      .set('x-test-role', 'planner')
      .send({ status: 'approved' })
    expect(res.status).toBe(422)
    expect(res.body.message).toMatch(/not allowed/i)
  })

  it('200 when transition is valid', async () => {
    mp.event.findUnique.mockResolvedValue({ id: 1, status: 'draft', createdById: null })
    mp.event.update.mockResolvedValue({ id: 1, status: 'ready' })
    mp.auditLog.create.mockResolvedValue({})
    const res = await request(app)
      .patch('/api/events/1/status')
      .set('x-test-role', 'planner')
      .send({ status: 'ready' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
  })

  it('404 when event does not exist', async () => {
    mp.event.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/events/999/status')
      .send({ status: 'ready' })
    expect(res.status).toBe(404)
  })
})
