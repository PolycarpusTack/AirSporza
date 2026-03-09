import { config } from 'dotenv'
config()

import { prisma } from './db/prisma.js'
import { startImportWorker } from './import/services/ImportWorkerService.js'
import { startOutboxConsumer } from './workers/outboxConsumer.js'
import { closeQueues } from './services/queue.js'
import { logger } from './utils/logger.js'

const importWorker = startImportWorker()
const outboxInterval = startOutboxConsumer(1000)

const shutdown = async () => {
  logger.info('Stopping workers')
  importWorker.stop()
  clearInterval(outboxInterval)
  await closeQueues()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
