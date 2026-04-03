import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/index.js'
const app = buildApp()

vi.mock('../src/db/prisma.js', () => {
  const mock = {
    id: '00000000-0000-4000-8000-000000000001', tenantId: 'tenant-1', name: 'Football Data API',
    direction: 'INBOUND', templateCode: 'football_data', credentials: null,
    fieldOverrides: [], config: {}, triggerConfig: {}, isActive: true,
    rateLimitPerMinute: null, rateLimitPerDay: null,
    lastSuccessAt: null, lastFailureAt: null, consecutiveFailures: 0,
    createdAt: new Date(), updatedAt: new Date(),
  }
  return {
    prisma: {
      tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
      integration: {
        findMany: vi.fn().mockResolvedValue([mock]),
        findFirst: vi.fn().mockResolvedValue(mock),
        findUnique: vi.fn().mockResolvedValue(mock),
        create: vi.fn().mockImplementation((args: any) => Promise.resolve({ ...mock, ...args.data, id: '00000000-0000-4000-8000-000000000002' })),
        update: vi.fn().mockImplementation((args: any) => Promise.resolve({ ...mock, ...args.data })),
        delete: vi.fn().mockResolvedValue(mock),
      },
      integrationLog: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
      },
      integrationSchedule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      auditLog: { create: vi.fn() },
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn(),
    },
  }
})

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: any, _: any, next: () => void) => {
    req.user = { id: 'u1', role: 'admin' }
    next()
  },
  authorize: (..._roles: string[]) => (_: any, __: any, next: () => void) => next(),
}))

vi.mock('../src/services/credentialService.js', () => ({
  encryptCredentials: vi.fn().mockReturnValue('v1:encrypted-blob'),
  decryptCredentials: vi.fn().mockReturnValue({ apiKey: 'sk-test-12345' }),
  maskCredentials: vi.fn().mockReturnValue({ apiKey: 'sk-t...2345' }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Integration Hub E2E', () => {
  describe('GET /api/integrations/templates', () => {
    it('returns available templates', async () => {
      const res = await request(app).get('/api/integrations/templates')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThan(0)
      const codes = res.body.map((t: any) => t.code)
      expect(codes).toContain('football_data')
      expect(codes).toContain('generic_webhook')
    })

    it('filters by direction', async () => {
      const res = await request(app).get('/api/integrations/templates?direction=INBOUND')
      expect(res.status).toBe(200)
      expect(res.body.every((t: any) => t.direction === 'INBOUND')).toBe(true)
    })
  })

  describe('GET /api/integrations', () => {
    it('returns list with masked credentials', async () => {
      const res = await request(app).get('/api/integrations')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  describe('POST /api/integrations', () => {
    it('creates an integration with encrypted credentials', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .send({
          name: 'New Integration',
          direction: 'INBOUND',
          templateCode: 'football_data',
          credentials: { apiKey: 'sk-test-12345' },
        })
      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('id')
    })

    it('rejects invalid template code', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .send({
          name: 'Bad Template',
          direction: 'INBOUND',
          templateCode: 'nonexistent_template',
        })
      expect(res.status).toBe(400)
    })

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .send({})
      expect(res.status).toBe(400)
    })
  })

  describe('PUT /api/integrations/:id', () => {
    it('updates with credentials: null keeps existing', async () => {
      const res = await request(app)
        .put('/api/integrations/00000000-0000-4000-8000-000000000001')
        .send({ name: 'Updated Name', credentials: null })
      expect(res.status).toBe(200)
    })
  })

  describe('DELETE /api/integrations/:id', () => {
    it('deletes an integration', async () => {
      const res = await request(app).delete('/api/integrations/00000000-0000-4000-8000-000000000001')
      expect(res.status).toBe(204)
    })
  })

  describe('GET /api/integrations/:id/logs', () => {
    it('returns paginated logs', async () => {
      const res = await request(app).get('/api/integrations/00000000-0000-4000-8000-000000000001/logs')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('data')
    })
  })
})
