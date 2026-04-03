import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/index.js'
const app = buildApp()
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    event: { findFirst: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown; headers: Record<string, string> }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: req.headers['x-test-role'] ?? 'planner' }
    next()
  },
  authorize: (..._roles: string[]) => (_: unknown, __: unknown, next: () => void) => next(),
}))

vi.mock('../src/services/notificationService.js', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

const mp = prisma as unknown as {
  event: { findFirst: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> }
  auditLog: { create: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

beforeEach(() => vi.clearAllMocks())

describe('PATCH /api/events/:id/status', () => {
  it('422 when transition not allowed for role', async () => {
    mp.event.findFirst.mockResolvedValue({ id: 1, status: 'draft', createdById: null })
    const res = await request(app)
      .patch('/api/events/1/status')
      .set('x-test-role', 'planner')
      .send({ status: 'approved' })
    expect(res.status).toBe(422)
    expect(res.body.message).toMatch(/not allowed/i)
  })

  it('200 when transition is valid', async () => {
    mp.event.findFirst.mockResolvedValue({ id: 1, status: 'draft', createdById: null })
    // $transaction receives a callback — we need to invoke it with a mock tx
    mp.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        event: { update: vi.fn().mockResolvedValue({ id: 1, status: 'ready' }) },
        outboxEvent: { create: vi.fn().mockResolvedValue({}) },
      }
      return fn(txMock)
    })
    mp.auditLog.create.mockResolvedValue({})

    const res = await request(app)
      .patch('/api/events/1/status')
      .set('x-test-role', 'planner')
      .send({ status: 'ready' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
  })

  it('404 when event does not exist', async () => {
    mp.event.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/events/999/status')
      .send({ status: 'ready' })
    expect(res.status).toBe(404)
  })
})
