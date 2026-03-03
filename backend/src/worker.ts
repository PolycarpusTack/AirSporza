import { config } from 'dotenv'
config()

import { prisma } from './db/prisma.js'
import { startImportWorker } from './import/services/ImportWorkerService.js'
import { logger } from './utils/logger.js'

const worker = startImportWorker()

const shutdown = async () => {
  logger.info('Stopping import worker', { workerId: worker.workerId })
  worker.stop()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
