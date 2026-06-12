import { Registry, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'
import type { Request, Response, NextFunction } from 'express'
import { prisma } from './db/prisma.js'
import { logger } from './utils/logger.js'

/**
 * D-2 — /metrics golden signals.
 *
 * A dedicated registry holds:
 *  - prom-client default process/node metrics
 *  - http_request_duration_seconds histogram (latency + traffic + errors via status)
 *  - lazily-collected saturation gauges: BullMQ queue depths, unprocessed
 *    OutboxEvent rows and ImportDeadLetter backlog, refreshed on each scrape
 *    via async collect() callbacks. Collection failures are logged at warn
 *    level and skipped — a scrape never fails because Redis/PG are down.
 */
export const register = new Registry()

collectDefaultMetrics({ register })

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
})

const UUID_SEGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const NUMERIC_SEGMENT = /\/\d+(?=\/|$)/g

/**
 * Low-cardinality route label: prefer the matched Express route pattern
 * (baseUrl + route path); otherwise normalize raw paths by collapsing
 * numeric and uuid segments to `:id`.
 */
function routeLabel(req: Request): string {
  const routePath = req.route?.path as string | undefined
  if (routePath) {
    const base = req.baseUrl ?? ''
    const combined = `${base}${routePath === '/' ? '' : routePath}`
    return combined || '/'
  }
  return (req.path || '/')
    .replace(UUID_SEGMENT, ':id')
    .replace(NUMERIC_SEGMENT, '/:id')
}

/**
 * Observes the duration of every HTTP request. Mounted early in buildApp,
 * right after the correlation middleware.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9
    httpRequestDuration.observe(
      { method: req.method, route: routeLabel(req), status: String(res.statusCode) },
      seconds
    )
  })
  next()
}

// ── Saturation gauges (lazy, scrape-time) ───────────────────────────────────

/** Cap scrape-time backend calls so a wedged Redis/PG can't hang the scrape. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)
      t.unref()
    }),
  ])
}

const COLLECT_TIMEOUT_MS = 2_000

new Gauge({
  name: 'bullmq_queue_depth',
  help: 'Jobs pending per BullMQ queue (waiting + active + delayed + prioritized)',
  labelNames: ['queue'] as const,
  registers: [register],
  async collect() {
    try {
      // Lazy import keeps BullMQ/Redis out of processes that never scrape.
      const q = await import('./services/queue.js')
      const queues = {
        cascade: q.cascadeQueue,
        alerts: q.alertQueue,
        standings: q.standingsQueue,
        bracket: q.bracketQueue,
        socketio: q.socketioQueue,
        webhook: q.webhookQueue,
        integration: q.integrationQueue,
      }
      await Promise.all(
        Object.entries(queues).map(async ([name, queue]) => {
          const counts = await withTimeout(
            queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized'),
            COLLECT_TIMEOUT_MS,
            `getJobCounts(${name})`
          )
          this.set(
            { queue: name },
            (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0)
          )
        })
      )
    } catch (err) {
      logger.warn('metrics: failed to collect BullMQ queue depths', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

new Gauge({
  name: 'outbox_events_unprocessed',
  help: 'OutboxEvent rows awaiting dispatch (not processed, not dead-lettered)',
  registers: [register],
  async collect() {
    try {
      const count = await withTimeout(
        prisma.outboxEvent.count({ where: { processedAt: null, deadLetteredAt: null } }),
        COLLECT_TIMEOUT_MS,
        'outboxEvent.count'
      )
      this.set(count)
    } catch (err) {
      logger.warn('metrics: failed to collect outbox backlog', {
        error: err instanceof Error ? err.message : String(err),
      })
      this.set(0)
    }
  },
})

new Gauge({
  name: 'import_dead_letters_unresolved',
  help: 'ImportDeadLetter rows not yet resolved',
  registers: [register],
  async collect() {
    try {
      const count = await withTimeout(
        prisma.importDeadLetter.count({ where: { resolvedAt: null } }),
        COLLECT_TIMEOUT_MS,
        'importDeadLetter.count'
      )
      this.set(count)
    } catch (err) {
      logger.warn('metrics: failed to collect import dead-letter backlog', {
        error: err instanceof Error ? err.message : String(err),
      })
      this.set(0)
    }
  },
})

// ── Scrape endpoint handler ──────────────────────────────────────────────────

/**
 * GET /metrics — standard Prometheus scrape posture: no auth, but can be
 * disabled with METRICS_ENABLED=false (default ON). Checked per-request so
 * the gate is honored without a rebuild of the app.
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  if (process.env.METRICS_ENABLED === 'false') {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
}
