import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    importSchedule: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    importSource: { findUnique: vi.fn() },
    $disconnect: vi.fn(),
  }
}))

vi.mock('node-cron', () => ({
  default: {
    validate: (expr: string) => /^(\S+ ){4}\S+$/.test(expr),
    schedule: vi.fn(() => ({ stop: vi.fn() })),
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (_: unknown, __: unknown, next: () => void) => next(),
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const scheduleMock = (prisma as unknown as {
  importSchedule: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}).importSchedule

const sourceMock = (prisma as unknown as {
  importSource: { findUnique: ReturnType<typeof vi.fn> }
}).importSource

describe('GET /api/import/schedules', () => {
  it('returns 200 with schedules list', async () => {
    scheduleMock.findMany.mockResolvedValue([{ id: '1', cronExpr: '0 6 * * *', isEnabled: true }])
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

  it('returns 201 for a valid schedule', async () => {
    const created = { id: 'sched1', sourceId: 'src1', cronExpr: '0 6 * * *', isEnabled: true }
    scheduleMock.create.mockResolvedValue(created)
    sourceMock.findUnique.mockResolvedValue({ code: 'EUROSPORT' })

    const res = await request(app)
      .post('/api/import/schedules')
      .send({ sourceId: 'src1', cronExpr: '0 6 * * *', isEnabled: true })
    expect(res.status).toBe(201)
    expect(res.body.id).toBe('sched1')
  })
})

describe('PATCH /api/import/schedules/:id', () => {
  it('returns 200 and disables the schedule when isEnabled is set to false', async () => {
    const existing = { id: 'sched1', cronExpr: '0 6 * * *', isEnabled: true, source: { code: 'EUROSPORT' } }
    const updated = { ...existing, isEnabled: false, source: undefined }
    scheduleMock.findUnique.mockResolvedValue(existing)
    scheduleMock.update.mockResolvedValue({ id: 'sched1', cronExpr: '0 6 * * *', isEnabled: false })

    const res = await request(app)
      .patch('/api/import/schedules/sched1')
      .send({ isEnabled: false })
    expect(res.status).toBe(200)
    expect(res.body.isEnabled).toBe(false)
  })

  it('returns 404 when schedule does not exist', async () => {
    scheduleMock.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/import/schedules/nonexistent')
      .send({ isEnabled: false })
    expect(res.status).toBe(404)
  })
})
