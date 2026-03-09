import { createWorker } from '../services/queue.js'
import { runCascade } from '../services/cascade/engine.js'
import { logger } from '../utils/logger.js'

export const cascadeWorker = createWorker(
  'cascade',
  async (job) => {
    const { tenantId, courtId, date } = job.data
    logger.info(`Cascade recompute: court=${courtId}, date=${date}`)

    const estimates = await runCascade(tenantId, courtId, new Date(date))
    logger.info(`Cascade complete: ${estimates.length} estimates updated`)
    return { estimateCount: estimates.length }
  },
  { concurrency: 3 }
)
