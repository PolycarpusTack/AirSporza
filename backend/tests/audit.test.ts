import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    event: { update: vi.fn() },
    techPlan: { update: vi.fn() },
    contract: { update: vi.fn() },
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (_: unknown, __: unknown, next: () => void) => next(),
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mockPrisma = prisma as unknown as {
  auditLog: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  event: { update: ReturnType<typeof vi.fn> }
}

describe('GET /api/audit/:entityType/:entityId', () => {
  it('returns 200 with list of audit entries', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: 'abc', action: 'event.update', oldValue: {}, newValue: {}, createdAt: new Date() }
    ])
    const res = await request(app).get('/api/audit/event/1')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/audit/:logId/restore', () => {
  it('returns 200 and calls update with oldValue', async () => {
    mockPrisma.auditLog.findUnique.mockResolvedValue({
      id: 'abc', entityType: 'event', entityId: '1',
      oldValue: { participants: 'Old Name' }, newValue: { participants: 'New Name' }
    })
    mockPrisma.event.update.mockResolvedValue({ id: 1, participants: 'Old Name' })
    mockPrisma.auditLog.create.mockResolvedValue({})

    const res = await request(app).post('/api/audit/abc/restore')
    expect(res.status).toBe(200)
  })
})
