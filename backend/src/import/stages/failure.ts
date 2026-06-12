/**
 * Failure stage (C-1 decomposition of ImportJobRunner).
 * Retry classification/backoff, job failure handling, and sync history.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import type { ImportAdapter } from '../adapters/BaseAdapter.js'
import { IMPORT_JOB_MAX_RETRIES, mergeImportJobStats, type ImportJobStats } from '../services/ImportJobState.js'
import { DailyRateLimitExceededError } from '../services/ImportRateLimitService.js'
import { ImportJobCancelledError, type JobWithSource } from './shared.js'

export async function handleJobFailure(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  stats: ImportJobStats,
  error: unknown
) {
  const message = error instanceof Error ? error.message : 'Unknown import error'

  if (error instanceof ImportJobCancelledError) {
    const cancelledStats = mergeImportJobStats(stats, {
      lastError: message,
      heartbeatAt: null,
      leaseExpiresAt: null,
      workerId: null,
      cancelledAt: stats.cancelledAt || new Date().toISOString(),
    })

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorLog: message,
        statsJson: cancelledStats as Prisma.InputJsonValue,
      }
    })

    await writeSyncHistory(job, cancelledStats, 'failed', message)
    return
  }

  if (error instanceof DailyRateLimitExceededError) {
    const deferredStats = mergeImportJobStats(stats, {
      deferredUntil: error.retryAt.toISOString(),
      heartbeatAt: null,
      leaseExpiresAt: null,
      workerId: null,
      lastError: message,
    })

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: 'queued',
        finishedAt: null,
        errorLog: message,
        statsJson: deferredStats as Prisma.InputJsonValue,
      }
    })

    logger.warn('Import job deferred because the daily rate limit is exhausted', {
      jobId: job.id,
      sourceCode: job.source.code,
      retryAt: error.retryAt.toISOString(),
    })
    return
  }

  const classification = adapter.classifyError(error)
  const retryCount = stats.retryCount || 0
  const shouldRetry = (classification === 'retryable' || classification === 'rate_limited') && retryCount < IMPORT_JOB_MAX_RETRIES

  if (shouldRetry) {
    const retryAfterMs = getRetryDelayMs(classification, retryCount)
    const retryAt = new Date(Date.now() + retryAfterMs)
    const deferredStats = mergeImportJobStats(stats, {
      retryCount: retryCount + 1,
      deferredUntil: retryAt.toISOString(),
      heartbeatAt: null,
      leaseExpiresAt: null,
      workerId: null,
      lastError: message,
    })

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: 'queued',
        finishedAt: null,
        errorLog: message,
        statsJson: deferredStats as Prisma.InputJsonValue,
      }
    })

    logger.warn('Retrying import job after transient failure', {
      jobId: job.id,
      classification,
      retryCount: retryCount + 1,
      retryAt: retryAt.toISOString(),
      message,
    })
    return
  }

  const failedStats = mergeImportJobStats(stats, {
    heartbeatAt: null,
    leaseExpiresAt: null,
    workerId: null,
    lastError: message,
  })

  logger.error('Import job failed', {
    jobId: job.id,
    message,
    classification,
  })

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: 'failed',
      finishedAt: new Date(),
      errorLog: message,
      statsJson: failedStats as Prisma.InputJsonValue,
    }
  })

  await writeSyncHistory(job, failedStats, 'failed', message)

  await prisma.importDeadLetter.create({
    data: {
      tenantId: job.tenantId,
      jobId: job.id,
      sourceId: job.sourceId,
      sourceRecordId: null,
      rawPayload: {} as Prisma.InputJsonValue,
      errorMessage: message,
      errorType: 'job_error',
      nextRetryAt: shouldRetry ? new Date(Date.now() + getRetryDelayMs(classification, retryCount)) : null,
    }
  }).catch(deadLetterError => {
    logger.error('Failed to write dead letter for failed import job', {
      jobId: job.id,
      message: deadLetterError instanceof Error ? deadLetterError.message : String(deadLetterError),
    })
  })
}

export async function writeSyncHistory(
  job: NonNullable<JobWithSource>,
  stats: ImportJobStats,
  status: 'success' | 'partial' | 'failed',
  message: string | null
) {
  await prisma.syncHistory.create({
    data: {
      tenantId: job.tenantId,
      entityType: job.entityScope,
      entityId: null,
      sourceCode: job.source.code,
      syncType: 'manual',
      triggeredBy: String(stats.requestedBy || 'system'),
      status,
      recordsProcessed: stats.recordsProcessed || 0,
      recordsCreated: stats.recordsCreated || 0,
      recordsUpdated: stats.recordsUpdated || 0,
      recordsSkipped: stats.recordsSkipped || 0,
      errorMessage: message,
    }
  }).catch(syncError => {
    logger.error('Failed to write sync history for import job', {
      jobId: job.id,
      message: syncError instanceof Error ? syncError.message : String(syncError),
    })
  })
}

function getRetryDelayMs(classification: ReturnType<ImportAdapter['classifyError']>, retryCount: number) {
  if (classification === 'rate_limited') {
    return Math.min(15 * 60 * 1000, (retryCount + 1) * 60 * 1000)
  }

  return Math.min(10 * 60 * 1000, (retryCount + 1) * 30 * 1000)
}

