import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { correlationMiddleware, CORRELATION_HEADER } from '../src/middleware/correlation.js'
import { getCorrelationId, requestContext } from '../src/utils/requestContext.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function makeApp() {
  const app = express()
  app.use(correlationMiddleware)
  app.get('/probe', (_req, res) => {
    res.json({ cid: getCorrelationId() ?? null })
  })
  app.get('/probe-async', async (_req, res) => {
    // Cross an async boundary to prove AsyncLocalStorage propagation.
    await new Promise((resolve) => setImmediate(resolve))
    res.json({ cid: getCorrelationId() ?? null })
  })
  return app
}

describe('correlation middleware (D-1)', () => {
  it('passes through an incoming x-correlation-id and echoes it on the response', async () => {
    const res = await request(makeApp()).get('/probe').set(CORRELATION_HEADER, 'cid-from-client')
    expect(res.status).toBe(200)
    expect(res.headers[CORRELATION_HEADER]).toBe('cid-from-client')
    expect(res.body.cid).toBe('cid-from-client')
  })

  it('generates a uuid when no header is sent and sets the response header', async () => {
    const res = await request(makeApp()).get('/probe')
    expect(res.status).toBe(200)
    expect(res.headers[CORRELATION_HEADER]).toMatch(UUID_RE)
    expect(res.body.cid).toBe(res.headers[CORRELATION_HEADER])
  })

  it('replaces oversized incoming ids with a generated uuid', async () => {
    const oversized = 'x'.repeat(300)
    const res = await request(makeApp()).get('/probe').set(CORRELATION_HEADER, oversized)
    expect(res.status).toBe(200)
    expect(res.headers[CORRELATION_HEADER]).toMatch(UUID_RE)
  })

  it('propagates the id across async boundaries via AsyncLocalStorage', async () => {
    const res = await request(makeApp()).get('/probe-async').set(CORRELATION_HEADER, 'cid-async')
    expect(res.status).toBe(200)
    expect(res.body.cid).toBe('cid-async')
  })

  it('getCorrelationId() is undefined outside any context and set inside requestContext.run', () => {
    expect(getCorrelationId()).toBeUndefined()
    requestContext.run({ correlationId: 'cid-direct' }, () => {
      expect(getCorrelationId()).toBe('cid-direct')
    })
    expect(getCorrelationId()).toBeUndefined()
  })
})
