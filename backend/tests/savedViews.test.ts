import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: { savedView: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() }, $disconnect: vi.fn() }
}))
vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => { req.user = { id: 'u1' }; next() },
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mock = (prisma as unknown as {
  savedView: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}).savedView

describe('GET /api/saved-views', () => {
  it('returns views for context', async () => {
    mock.findMany.mockResolvedValue([{ id: '1', name: 'My view', context: 'planner', filterState: {} }])
    const res = await request(app).get('/api/saved-views?context=planner')
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('My view')
  })
})

describe('DELETE /api/saved-views/:id', () => {
  it('deletes owned view', async () => {
    mock.findUnique.mockResolvedValue({ id: '1', userId: 'u1' })
    mock.delete.mockResolvedValue({})
    const res = await request(app).delete('/api/saved-views/1')
    expect(res.status).toBe(200)
  })

  it('returns 403 for non-owner', async () => {
    mock.findUnique.mockResolvedValue({ id: '1', userId: 'other' })
    const res = await request(app).delete('/api/saved-views/1')
    expect(res.status).toBe(403)
  })
})
