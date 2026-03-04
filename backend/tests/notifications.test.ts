import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => {
    req.user = { id: 'user1', role: 'planner' }
    next()
  },
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mockPrisma = prisma as unknown as {
  notification: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
}

describe('GET /api/notifications', () => {
  it('returns 200 with user notifications', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      { id: '1', type: 'contract_expiring', title: 'Contract expiring soon', isRead: false }
    ])
    const res = await request(app).get('/api/notifications')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('PATCH /api/notifications/read-all', () => {
  it('marks all notifications as read', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 })
    const res = await request(app).patch('/api/notifications/read-all')
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(3)
  })
})
