import { beforeAll, describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'

describe('Bulk Event Endpoints', () => {
  let authToken: string
  let createdIds: number[] = []
  const testEmail = `bulk-test-${Date.now()}@example.com`

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: testEmail, role: 'admin' })
    authToken = loginRes.body.token

    // Create two test events
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sportId: 1,
          competitionId: 1,
          participants: `Bulk Test ${i}`,
          startDateBE: '2099-12-01',
          startTimeBE: '10:00',
        })
      if (res.status === 201) createdIds.push(res.body.id)
    }
  })

  describe('PATCH /api/events/bulk/status', () => {
    it('updates status for multiple events', async () => {
      if (createdIds.length < 2) return
      const res = await request(app)
        .patch('/api/events/bulk/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: createdIds, status: 'ready' })
        .expect(200)
      expect(res.body).toMatchObject({ updated: createdIds.length })
    })

    it('rejects invalid status', async () => {
      await request(app)
        .patch('/api/events/bulk/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [1], status: 'not_a_status' })
        .expect(400)
    })
  })

  describe('PATCH /api/events/bulk/reschedule', () => {
    it('shifts dates for multiple events', async () => {
      if (createdIds.length < 2) return
      const res = await request(app)
        .patch('/api/events/bulk/reschedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: createdIds, shiftDays: 1 })
        .expect(200)
      expect(res.body).toMatchObject({ updated: createdIds.length })
    })

    it('rejects shiftDays out of range', async () => {
      await request(app)
        .patch('/api/events/bulk/reschedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [1], shiftDays: 999 })
        .expect(400)
    })
  })

  describe('PATCH /api/events/bulk/assign', () => {
    it('assigns a field to multiple events', async () => {
      if (createdIds.length < 2) return
      const res = await request(app)
        .patch('/api/events/bulk/assign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: createdIds, field: 'linearChannel', value: 'VRT MAX' })
        .expect(200)
      expect(res.body).toMatchObject({ updated: createdIds.length })
    })

    it('rejects invalid field name', async () => {
      await request(app)
        .patch('/api/events/bulk/assign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [1], field: 'notAField', value: 'something' })
        .expect(400)
    })
  })

  describe('DELETE /api/events/bulk', () => {
    it('deletes multiple events', async () => {
      if (createdIds.length < 2) return
      const res = await request(app)
        .delete('/api/events/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: createdIds })
        .expect(200)
      expect(res.body).toMatchObject({ deleted: createdIds.length })
    })

    it('requires authentication', async () => {
      await request(app)
        .delete('/api/events/bulk')
        .send({ ids: [1] })
        .expect(401)
    })
  })
})
