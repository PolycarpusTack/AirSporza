import { config } from 'dotenv'
config()

import { prisma } from './db/prisma.js'
import { startImportWorker } from './import/services/ImportWorkerService.js'
import { startOutboxConsumer } from './workers/outboxConsumer.js'
import { standingsWorker } from './workers/standingsWorker.js'
import { bracketWorker } from './workers/bracketWorker.js'
import { closeQueues } from './services/queue.js'
import { logger } from './utils/logger.js'

const importWorker = startImportWorker()
const outboxInterval = startOutboxConsumer(1000)
logger.info('Standings and bracket workers started')

const shutdown = async () => {
  logger.info('Stopping workers')
  importWorker.stop()
  clearInterval(outboxInterval)
  await standingsWorker.close()
  await bracketWorker.close()
  await closeQueues()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
