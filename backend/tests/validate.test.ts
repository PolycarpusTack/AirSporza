import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { z } from 'zod'
import { validate } from '../src/middleware/validate.js'

function createApp() {
  const app = express()
  app.use(express.json())

  app.post('/test/:id',
    validate({
      params: z.object({ id: z.coerce.number().int().positive() }),
      body: z.object({ name: z.string().min(1) }),
    }),
    (req, res) => {
      res.json({ id: req.params.id, name: req.body.name })
    }
  )

  app.get('/search',
    validate({
      query: z.object({
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
    }),
    (req, res) => {
      res.json({ q: req.query.q, limit: req.query.limit })
    }
  )

  return app
}

describe('validate middleware', () => {
  it('should parse valid params and body', async () => {
    const res = await request(createApp())
      .post('/test/42')
      .send({ name: 'Hello' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 42, name: 'Hello' })
  })

  it('should reject invalid param', async () => {
    const res = await request(createApp())
      .post('/test/abc')
      .send({ name: 'Hello' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Validation failed')
    expect(res.body.details).toHaveProperty('params')
  })

  it('should reject missing required body field', async () => {
    const res = await request(createApp())
      .post('/test/1')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.details).toHaveProperty('body')
  })

  it('should apply query defaults', async () => {
    const res = await request(createApp())
      .get('/search')
    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(20)
  })

  it('should report multiple validation errors', async () => {
    const res = await request(createApp())
      .post('/test/abc')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.details).toHaveProperty('params')
    expect(res.body.details).toHaveProperty('body')
  })
})
