import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'

/**
 * Run the import pipeline for a given source code.
 * Creates an import job for all supported scopes and queues it for the worker.
 * This is a thin wrapper that enqueues work for the existing ImportWorkerService.
 */
export async function runImport(sourceCode: string): Promise<void> {
  const source = await prisma.importSource.findFirst({ where: { code: sourceCode } })
  if (!source) {
    logger.warn(`runImport: source not found for code "${sourceCode}"`)
    return
  }

  if (!source.isEnabled) {
    logger.warn(`runImport: source "${sourceCode}" is disabled, skipping`)
    return
  }

  // Create an incremental import job for the source (events/fixtures scope)
  try {
    await prisma.importJob.create({
      data: {
        sourceId: source.id,
        entityScope: 'fixtures',
        mode: 'incremental',
        status: 'queued',
        statsJson: {
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          triggeredBy: 'schedule',
        },
      },
    })
    logger.info(`runImport: queued incremental import job for source "${sourceCode}"`)
  } catch (err) {
    logger.error(`runImport: failed to create import job for source "${sourceCode}"`, { err })
    throw err
  }
}
