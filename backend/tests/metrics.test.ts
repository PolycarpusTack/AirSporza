import { describe, it, expect, vi, afterEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/index.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'default' }) },
    outboxEvent: { count: vi.fn().mockResolvedValue(5) },
    importDeadLetter: { count: vi.fn().mockResolvedValue(2) },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn(),
  },
}))

vi.mock('../src/services/queue.js', () => {
  const q = () => ({
    add: vi.fn(),
    close: vi.fn(),
    getJobCounts: vi.fn().mockResolvedValue({ waiting: 2, active: 1, delayed: 0, prioritized: 0 }),
  })
  return {
    createQueue: vi.fn(q),
    createWorker: vi.fn((_name: string, processor: unknown) => ({ processor })),
    cascadeQueue: q(),
    alertQueue: q(),
    standingsQueue: q(),
    bracketQueue: q(),
    socketioQueue: q(),
    webhookQueue: q(),
    integrationQueue: q(),
    closeQueues: vi.fn(),
  }
})

const app = buildApp()

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /metrics (D-2)', () => {
  it('returns 200 with the prom-client content type', async () => {
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
  })

  it('exposes the http_request_duration_seconds histogram with normalized route labels', async () => {
    // Generate a sample first so labeled series exist, not just HELP/TYPE.
    await request(app).get('/health')
    const res = await request(app).get('/metrics')

    expect(res.text).toContain('# TYPE http_request_duration_seconds histogram')
    expect(res.text).toContain('http_request_duration_seconds_bucket')
    expect(res.text).toContain('route="/health"')
    expect(res.text).toContain('status="200"')
  })

  it('exposes BullMQ queue depth, outbox backlog and import dead-letter gauges from lazy collectors', async () => {
    const res = await request(app).get('/metrics')

    // 2 waiting + 1 active + 0 delayed + 0 prioritized = 3 per queue.
    expect(res.text).toContain('bullmq_queue_depth{queue="webhook"} 3')
    expect(res.text).toContain('bullmq_queue_depth{queue="cascade"} 3')
    expect(res.text).toContain('outbox_events_unprocessed 5')
    expect(res.text).toContain('import_dead_letters_unresolved 2')
  })

  it('includes prom-client default process metrics', async () => {
    const res = await request(app).get('/metrics')
    expect(res.text).toContain('process_cpu_user_seconds_total')
  })

  it('returns 404 when METRICS_ENABLED=false', async () => {
    vi.stubEnv('METRICS_ENABLED', 'false')
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(404)
  })
})
