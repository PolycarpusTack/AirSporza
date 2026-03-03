import { beforeAll, describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'

describe('Event Endpoints', () => {
  let authToken: string
  let createdEventId: number
  const testEmail = `event-test-${Date.now()}@example.com`

  beforeAll(async () => {
    const response = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: testEmail, role: 'admin' })
    
    authToken = response.body.token
  })

  describe('GET /api/events', () => {
    it('should return list of events', async () => {
      const response = await request(app)
        .get('/api/events')
        .expect(200)
      
      expect(Array.isArray(response.body)).toBe(true)
    })

    it('should filter events by sportId', async () => {
      const response = await request(app)
        .get('/api/events?sportId=1')
        .expect(200)
      
      expect(Array.isArray(response.body)).toBe(true)
      response.body.forEach((event: { sportId: number }) => {
        expect(event.sportId).toBe(1)
      })
    })
  })

  describe('POST /api/events', () => {
    it('should require authentication', async () => {
      await request(app)
        .post('/api/events')
        .send({ participants: 'Test Match' })
        .expect(401)
    })

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400)
      
      expect(response.body).toHaveProperty('message')
    })

    it('should create an event with valid data', async () => {
      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
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
      expect(response.body.customFields).toEqual({ customNote: 'Test note' })
      createdEventId = response.body.id
    })

    it('should reject invalid sportId (0)', async () => {
      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sportId: 0,
          competitionId: 1,
          participants: 'Test',
          startDateBE: '2026-06-15',
          startTimeBE: '14:00'
        })
        .expect(400)
      
      expect(response.body.message).toMatch(/sportId|required/i)
    })
  })

  describe('PUT /api/events/:id', () => {
    it('should update an event and preserve custom fields', async () => {
      if (!createdEventId) return
      
      const response = await request(app)
        .put(`/api/events/${createdEventId}`)
        .set('Authorization', `Bearer ${authToken}`)
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
      expect(response.body.customFields).toEqual({ customNote: 'updated', newField: 'new' })
    })
  })

  describe('DELETE /api/events/:id', () => {
    it('should require planner or admin role', async () => {
      if (!createdEventId) return

      const userResponse = await request(app)
        .post('/api/auth/dev-login')
        .send({ email: `contracts-${Date.now()}@example.com`, role: 'contracts' })
      
      await request(app)
        .delete(`/api/events/${createdEventId}`)
        .set('Authorization', `Bearer ${userResponse.body.token}`)
        .expect(403)
    })

    it('should delete an event', async () => {
      if (!createdEventId) return

      await request(app)
        .delete(`/api/events/${createdEventId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      
      await request(app)
        .get(`/api/events/${createdEventId}`)
        .expect(404)
    })
  })
})
