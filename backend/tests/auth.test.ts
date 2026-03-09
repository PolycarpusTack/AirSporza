import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn(),
  },
}))

const mp = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

describe('Auth Endpoints', () => {
  describe('GET /api/auth/me', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401)

      expect(response.body).toHaveProperty('message')
    })
  })
})

describe('Dev Login', () => {
  const testEmail = `test-${Date.now()}@example.com`

  it('should create a new user and return token in development', async () => {
    mp.user.findUnique.mockResolvedValue(null)
    mp.user.create.mockResolvedValue({
      id: 'user-1',
      email: testEmail,
      name: testEmail.split('@')[0],
      role: 'planner',
      tenantId: 'tenant-1',
    })

    const response = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: testEmail, role: 'planner' })
      .expect(200)

    expect(response.body).toHaveProperty('token')
    expect(response.body).toHaveProperty('user')
    expect(response.body.user.email).toBe(testEmail)
    expect(response.body.user.role).toBe('planner')
  })
})
