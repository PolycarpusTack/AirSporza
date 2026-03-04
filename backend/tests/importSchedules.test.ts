import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: { importSchedule: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() } }
}))
vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (_: unknown, __: unknown, next: () => void) => next(),
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mock = (prisma as unknown as { importSchedule: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }).importSchedule

describe('GET /api/import/schedules', () => {
  it('returns 200 with schedules list', async () => {
    mock.findMany.mockResolvedValue([{ id: '1', cronExpr: '0 6 * * *', isEnabled: true }])
    const res = await request(app).get('/api/import/schedules')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })
})

describe('POST /api/import/schedules', () => {
  it('returns 400 for invalid cron expression', async () => {
    const res = await request(app)
      .post('/api/import/schedules')
      .send({ sourceId: 'src1', cronExpr: 'not-a-cron' })
    expect(res.status).toBe(400)
  })
})
