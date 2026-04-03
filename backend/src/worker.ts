import { config } from 'dotenv'
config()

import { prisma } from './db/prisma.js'
import { startImportWorker } from './import/services/ImportWorkerService.js'
import { startOutboxConsumer } from './workers/outboxConsumer.js'
import { standingsWorker } from './workers/standingsWorker.js'
import { bracketWorker } from './workers/bracketWorker.js'
import { startSocketWorker } from './workers/socketWorker.js'
import { startWebhookWorker } from './workers/webhookWorker.js'
import { cascadeWorker } from './workers/cascadeWorker.js'
import { alertWorker } from './workers/alertWorker.js'
import { startIntegrationPushWorker } from './workers/integrationPushWorker.js'
import { closeQueues } from './services/queue.js'
import { logger } from './utils/logger.js'

const importWorker = startImportWorker()
const outboxInterval = startOutboxConsumer(5000)
const socketWorker = startSocketWorker()
const webhookWorker = startWebhookWorker()
const integrationWorker = startIntegrationPushWorker()
logger.info('All workers started (standings, bracket, cascade, alert, socket, webhook, integration, outbox)')

const shutdown = async () => {
  logger.info('Stopping workers')
  importWorker.stop()
  clearInterval(outboxInterval)
  await standingsWorker.close()
  await bracketWorker.close()
  await cascadeWorker.close()
  await alertWorker.close()
  await socketWorker.close()
  await webhookWorker.close()
  await integrationWorker.close()
  await closeQueues()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
