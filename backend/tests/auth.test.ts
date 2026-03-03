import { beforeAll, describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'

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
