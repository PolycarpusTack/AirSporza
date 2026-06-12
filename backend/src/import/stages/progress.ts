/**
 * Progress stage (C-1 decomposition of ImportJobRunner).
 * Heartbeat, stats accumulation, and cancellation polling for a running job.
 */
import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { Prisma } from '@prisma/client'
import {
  IMPORT_JOB_HEARTBEAT_MS,
  mergeImportJobStats,
  readImportJobStats,
  nextLeaseExpiry,
  type ImportJobStats,
} from '../services/ImportJobState.js'
import { ImportJobCancelledError } from './shared.js'

export function createProgressController(jobId: string, initialStats: ImportJobStats, workerId?: string) {
  let stopped = false
  let writeChain: Promise<void> = Promise.resolve()
  let stats = initialStats

  const queueWrite = (patch: Partial<ImportJobStats>) => {
    writeChain = writeChain.then(async () => {
      if (stopped) {
        return
      }

      stats = mergeImportJobStats(stats, patch)
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          statsJson: stats as Prisma.InputJsonValue,
        }
      })
    }).catch(error => {
      logger.error('Failed to persist import job progress', {
        jobId,
        message: error instanceof Error ? error.message : String(error),
      })
    })

    return writeChain
  }

  const heartbeat = async () => {
    const now = new Date()
    await queueWrite({
      workerId: workerId || stats.workerId || null,
      heartbeatAt: now.toISOString(),
      leaseExpiresAt: nextLeaseExpiry(now),
    })
  }

  const timer = setInterval(() => {
    void heartbeat()
  }, IMPORT_JOB_HEARTBEAT_MS)

  return {
    snapshot() {
      return stats
    },
    async increment(delta: Partial<Record<'recordsProcessed' | 'recordsCreated' | 'recordsUpdated' | 'recordsSkipped', number>>) {
      await queueWrite({
        recordsProcessed: (stats.recordsProcessed || 0) + (delta.recordsProcessed || 0),
        recordsCreated: (stats.recordsCreated || 0) + (delta.recordsCreated || 0),
        recordsUpdated: (stats.recordsUpdated || 0) + (delta.recordsUpdated || 0),
        recordsSkipped: (stats.recordsSkipped || 0) + (delta.recordsSkipped || 0),
      })
    },
    async checkCancelled() {
      await writeChain

      const latest = await prisma.importJob.findUnique({
        where: { id: jobId },
        select: {
          status: true,
          statsJson: true,
        }
      })

      if (!latest) {
        throw new ImportJobCancelledError('Import job no longer exists.')
      }

      stats = mergeImportJobStats(stats, readImportJobStats(latest.statsJson))

      if (latest.status !== 'running' || stats.cancelRequested) {
        throw new ImportJobCancelledError(
          stats.cancelledBy
            ? `Import job cancelled by ${stats.cancelledBy}.`
            : 'Import job cancelled by operator.'
        )
      }
    },
    async stop() {
      stopped = true
      clearInterval(timer)
      await writeChain
    },
  }
}

export type ProgressController = ReturnType<typeof createProgressController>
