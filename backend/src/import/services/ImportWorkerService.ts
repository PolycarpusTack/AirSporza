import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { runImportJob } from './ImportJobRunner.js'
import {
  IMPORT_WORKER_POLL_MS,
  mergeImportJobStats,
  nextLeaseExpiry,
  readImportJobStats,
} from './ImportJobState.js'
import { ensureImportSchemaReady } from './ImportSchemaService.js'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function claimNextImportJob(workerId: string) {
  await ensureImportSchemaReady()

  return prisma.$transaction(async tx => {
    const candidates = await tx.$queryRaw<Array<{
      id: string
      startedAt: Date | null
      statsJson: Prisma.JsonValue | null
    }>>(Prisma.sql`
      WITH candidate AS (
        SELECT "id", "startedAt", "statsJson"
        FROM "ImportJob"
        WHERE
          (
            "status" = 'queued'
            AND COALESCE(("statsJson"->>'deferredUntil')::timestamptz, '-infinity'::timestamptz) <= NOW()
          )
          OR
          (
            "status" = 'running'
            AND COALESCE(("statsJson"->>'leaseExpiresAt')::timestamptz, '-infinity'::timestamptz) <= NOW()
          )
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      SELECT "id", "startedAt", "statsJson" FROM candidate
    `)

    const candidate = candidates[0]
    if (!candidate) {
      return null
    }

    const now = new Date()
    const stats = readImportJobStats(candidate.statsJson)
    const claimedStats = mergeImportJobStats(candidate.statsJson, {
      workerId,
      heartbeatAt: now.toISOString(),
      leaseExpiresAt: nextLeaseExpiry(now),
      attempts: (stats.attempts || 0) + 1,
      cancelRequested: false,
      cancelledBy: null,
      cancelledAt: null,
      lastError: null,
    })

    await tx.importJob.update({
      where: { id: candidate.id },
      data: {
        status: 'running',
        startedAt: candidate.startedAt ?? now,
        finishedAt: null,
        errorLog: null,
        statsJson: claimedStats as Prisma.InputJsonValue,
      }
    })

    return candidate.id
  })
}

export function startImportWorker() {
  let stopped = false
  const workerId = process.env.IMPORT_WORKER_ID || randomUUID()

  logger.info('Import worker started', { workerId, pollMs: IMPORT_WORKER_POLL_MS })

  const loop = async () => {
    while (!stopped) {
      try {
        const jobId = await claimNextImportJob(workerId)
        if (!jobId) {
          await sleep(IMPORT_WORKER_POLL_MS)
          continue
        }

        await runImportJob(jobId, { workerId })
      } catch (error) {
        logger.error('Import worker loop failed', {
          workerId,
          message: error instanceof Error ? error.message : String(error),
        })
        await sleep(IMPORT_WORKER_POLL_MS)
      }
    }
  }

  void loop()

  return {
    workerId,
    stop() {
      stopped = true
    }
  }
}
