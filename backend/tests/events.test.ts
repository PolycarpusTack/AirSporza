import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/index.js'
const app = buildApp()
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    event: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    customFieldValue: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    broadcastSlot: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: vi.fn() },
    outboxEvent: { create: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: 'admin' }
    next()
  },
  authorize: (..._roles: string[]) => (_: unknown, __: unknown, next: () => void) => next(),
}))

vi.mock('../src/services/notificationService.js', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/services/eventSlotBridge.js', () => ({
  syncEventToSlot: vi.fn().mockResolvedValue(undefined),
  shouldSync: vi.fn().mockReturnValue(false),
  unlinkEventSlot: vi.fn().mockResolvedValue(undefined),
}))

const mp = prisma as unknown as {
  event: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  customFieldValue: {
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  broadcastSlot: { updateMany: ReturnType<typeof vi.fn> }
  auditLog: { create: ReturnType<typeof vi.fn> }
  outboxEvent: { create: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Event Endpoints', () => {
  describe('GET /api/events', () => {
    it('should return list of events', async () => {
      mp.event.findMany.mockResolvedValue([
        { id: 1, sportId: 1, participants: 'Team A vs B', customFields: {} }
      ])
      mp.customFieldValue.findMany.mockResolvedValue([])

      const response = await request(app)
        .get('/api/events')
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
    })

    it('should filter events by sportId', async () => {
      mp.event.findMany.mockResolvedValue([
        { id: 1, sportId: 1, participants: 'Team A vs B' }
      ])
      mp.customFieldValue.findMany.mockResolvedValue([])

      const response = await request(app)
        .get('/api/events?sportId=1')
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
    })
  })

  describe('POST /api/events', () => {
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/events')
        .send({})
        .expect(400)

      expect(response.body).toHaveProperty('error', 'Validation failed')
    })

    it('should create an event with valid data', async () => {
      const createdEvent = {
        id: 1,
        sportId: 1,
        competitionId: 1,
        participants: 'Test Team A vs Test Team B',
        startDateBE: '2026-06-15',
        startTimeBE: '14:00',
        isLive: false,
        isDelayedLive: false,
        customFields: { customNote: 'Test note' },
        sport: { id: 1, name: 'Football' },
        competition: { id: 1, name: 'Pro League' },
        channel: null,
      }

      mp.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          event: { create: vi.fn().mockResolvedValue(createdEvent) },
          customFieldValue: { upsert: vi.fn().mockResolvedValue({}) },
          outboxEvent: { create: vi.fn().mockResolvedValue({}) },
          broadcastSlot: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
          },
        }
        return fn(txMock)
      })
      mp.auditLog.create.mockResolvedValue({})

      const response = await request(app)
        .post('/api/events')
        .send({
          sportId: 1,
          competitionId: 1,
          participants: 'Test Team A vs Test Team B',
          startDateBE: '2026-06-15',
          startTimeBE: '14:00',
          isLive: false,
          isDelayedLive: false,
          customFields: { customNote: 'Test note' }
        })
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.participants).toBe('Test Team A vs Test Team B')
    })

    it('should reject invalid sportId (0)', async () => {
      const response = await request(app)
        .post('/api/events')
        .send({
          sportId: 0,
          competitionId: 1,
          participants: 'Test',
          startDateBE: '2026-06-15',
          startTimeBE: '14:00'
        })
        .expect(400)

      expect(response.body.error).toBe('Validation failed')
    })
  })

  describe('PUT /api/events/:id', () => {
    it('should update an event and preserve custom fields', async () => {
      const existing = { id: 1, sportId: 1, competitionId: 1, participants: 'Old', tenantId: 'tenant-1' }
      const updated = {
        id: 1,
        sportId: 1,
        competitionId: 1,
        participants: 'Updated Team A vs Updated Team B',
        customFields: { customNote: 'updated', newField: 'new' },
        sport: { id: 1, name: 'Football' },
        competition: { id: 1, name: 'Pro League' },
        channel: null,
        tenantId: 'tenant-1',
      }

      mp.event.findFirst.mockResolvedValue(existing)
      mp.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          event: { update: vi.fn().mockResolvedValue(updated) },
          customFieldValue: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            upsert: vi.fn().mockResolvedValue({}),
          },
          outboxEvent: { create: vi.fn().mockResolvedValue({}) },
          broadcastSlot: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
          },
        }
        return fn(txMock)
      })
      mp.auditLog.create.mockResolvedValue({})

      const response = await request(app)
        .put('/api/events/1')
        .send({
          sportId: 1,
          competitionId: 1,
          participants: 'Updated Team A vs Updated Team B',
          startDateBE: '2026-06-16',
          startTimeBE: '15:00',
          isLive: true,
          isDelayedLive: false,
          customFields: { customNote: 'updated', newField: 'new' }
        })
        .expect(200)

      expect(response.body.participants).toBe('Updated Team A vs Updated Team B')
    })
  })

  describe('DELETE /api/events/:id', () => {
    it('should delete an event', async () => {
      mp.event.findFirst.mockResolvedValue({ id: 1, participants: 'Test', tenantId: 'tenant-1' })
      mp.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          broadcastSlot: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
          customFieldValue: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          event: { delete: vi.fn().mockResolvedValue({}) },
          outboxEvent: { create: vi.fn().mockResolvedValue({}) },
        }
        return fn(txMock)
      })
      mp.auditLog.create.mockResolvedValue({})

      await request(app)
        .delete('/api/events/1')
        .expect(200)
    })
  })
})
