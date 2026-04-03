import { createWorker } from '../services/queue.js'
import { prisma } from '../db/prisma.js'
import { runCascade } from '../services/cascade/engine.js'
import { logger } from '../utils/logger.js'
import { setTenantRLS } from '../utils/setTenantRLS.js'

export const cascadeWorker = createWorker(
  'cascade',
  async (job) => {
    const { tenantId, eventId } = job.data
    if (tenantId) await setTenantRLS(tenantId)
    if (!eventId) {
      logger.warn('Cascade job missing eventId — skipping')
      return { skipped: true }
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) {
      logger.warn(`Cascade job: event ${eventId} not found — skipping`)
      return { skipped: true }
    }

    const courtId = (event.sportMetadata as any)?.court_id
    if (!courtId) {
      logger.warn(`Cascade job: event ${eventId} has no court_id — skipping`)
      return { skipped: true }
    }

    const date = event.startDateBE
    logger.info(`Cascade recompute: court=${courtId}, date=${date}`)

    const estimates = await runCascade(tenantId, courtId, new Date(date))
    logger.info(`Cascade complete: ${estimates.length} estimates updated`)
    return { estimateCount: estimates.length }
  },
  { concurrency: 3 }
)
