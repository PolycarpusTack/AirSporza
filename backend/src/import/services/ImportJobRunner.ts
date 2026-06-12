/**
 * Import job orchestrator (decomposed in C-1, TD-1).
 * Owns the run loop: lease/heartbeat, adapter paging, per-record processing,
 * and retry/failure flow. Entity projection lives in stages/provision.ts;
 * record persistence in stages/records.ts; progress + failure handling in
 * their stage modules. EPIC G composes those stages — do not grow this file.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { setTenantRLS } from '../../utils/setTenantRLS.js'
import { createImportAdapter } from '../adapters/index.js'
import type { ImportAdapter } from '../adapters/BaseAdapter.js'
import { acquireRateLimitSlot } from './ImportRateLimitService.js'
import { ensureImportSchemaReady } from './ImportSchemaService.js'
import { mergeImportJobStats, nextLeaseExpiry, readImportJobStats } from './ImportJobState.js'
import type { RawSourceRecord } from '../types.js'
import { loadJob, normalizeRecordType, readCount, scopeToRecordType, type JobWithSource } from '../stages/shared.js'
import { createProgressController } from '../stages/progress.js'
import { handleJobFailure, writeSyncHistory } from '../stages/failure.js'
import { getSourceCompetitionIds } from '../stages/records.js'
import { formatDateOffset } from '../stages/provision.js'
import { processCompetitionRecord, processEventRecord, processTeamRecord } from '../stages/process.js'

// Route-facing exports kept stable for routes/import.ts (split lands in C-2)
export { manualCreateNormalizedEvent, manualMergeNormalizedEvent } from '../stages/provision.js'

type JobStatus = 'completed' | 'partial'

type RunImportJobOptions = {
  workerId?: string
}

export async function runImportJob(jobId: string, options: RunImportJobOptions = {}) {
  await ensureImportSchemaReady()

  const job = await loadJob(jobId)
  if (!job) {
    throw new Error(`Import job '${jobId}' not found.`)
  }

  // Set PostgreSQL RLS context for this tenant — ensures all queries are tenant-scoped
  await setTenantRLS(job.tenantId)

  const now = new Date()
  const startingStats = mergeImportJobStats(job.statsJson, {
    recordsProcessed: readCount(job.statsJson, 'recordsProcessed'),
    recordsCreated: readCount(job.statsJson, 'recordsCreated'),
    recordsUpdated: readCount(job.statsJson, 'recordsUpdated'),
    recordsSkipped: readCount(job.statsJson, 'recordsSkipped'),
    workerId: options.workerId || readImportJobStats(job.statsJson).workerId || null,
    heartbeatAt: now.toISOString(),
    leaseExpiresAt: nextLeaseExpiry(now),
    lastError: null,
  })

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: 'running',
      startedAt: job.startedAt ?? now,
      finishedAt: null,
      errorLog: null,
      statsJson: startingStats as Prisma.InputJsonValue,
    }
  })

  const adapter = createImportAdapter(job.source)
  adapter.setThrottle(() =>
    acquireRateLimitSlot(
      {
        id: job.source.id,
        code: job.source.code,
        rateLimitPerMinute: job.source.rateLimitPerMinute,
        rateLimitPerDay: job.source.rateLimitPerDay,
        tenantId: job.tenantId,
      },
      adapter.rateLimitConfig
    )
  )

  const progress = createProgressController(job.id, startingStats, options.workerId)

  try {
    const result = await executeJob(
      {
        ...job,
        statsJson: startingStats,
      },
      adapter,
      progress
    )

    await progress.stop()

    const finalStats = mergeImportJobStats(progress.snapshot(), {
      lastError: result.message ?? null,
      heartbeatAt: null,
      leaseExpiresAt: null,
      workerId: null,
    })

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: result.status,
        finishedAt: new Date(),
        statsJson: finalStats as Prisma.InputJsonValue,
        errorLog: result.message ?? null,
      }
    })

    await prisma.importSource.update({
      where: { id: job.sourceId },
      data: { lastFetchAt: new Date() }
    })

    // quality-pass fix: use the shared (guarded) helper — the previous inline
    // create was unguarded, so a syncHistory write failure after a COMPLETED
    // import fell into catch -> handleJobFailure and misclassified the job.
    await writeSyncHistory(
      job,
      finalStats,
      result.status === 'completed' ? 'success' : 'partial',
      result.message ?? null
    )
  } catch (error) {
    await progress.stop()
    await handleJobFailure(job, adapter, progress.snapshot(), error)
  }
}

async function executeJob(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>
) {
  const replayDeadLetterId = readImportJobStats(job.statsJson).replayDeadLetterId
  if (replayDeadLetterId) {
    return replayDeadLetter(job, adapter, replayDeadLetterId, progress)
  }

  switch (job.entityScope) {
    case 'competitions':
      return importCompetitions(job, adapter, progress)
    case 'teams':
      return importTeams(job, adapter, progress)
    case 'events':
    case 'fixtures':
      return importEvents(job, adapter, progress)
    case 'live':
      return importEvents(job, adapter, progress, true)
    default:
      throw new Error(`Import scope '${job.entityScope}' is not implemented for source '${job.source.code}'.`)
  }
}

async function replayDeadLetter(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  deadLetterId: string,
  progress: ReturnType<typeof createProgressController>
) {
  const deadLetter = await prisma.importDeadLetter.findUnique({
    where: { id: deadLetterId },
    include: {
      job: {
        select: {
          entityScope: true,
        }
      }
    }
  })

  if (!deadLetter) {
    throw new Error(`Dead letter '${deadLetterId}' not found.`)
  }

  const importRecord = deadLetter.sourceRecordId
    ? await prisma.importRecord.findFirst({
        where: {
          sourceId: deadLetter.sourceId,
          sourceRecordId: deadLetter.sourceRecordId,
        },
        orderBy: { createdAt: 'desc' },
      })
    : null

  const rawRecord: RawSourceRecord = {
    id: deadLetter.sourceRecordId || deadLetter.id,
    type: normalizeRecordType(importRecord?.entityType, scopeToRecordType(job.entityScope)),
    raw: deadLetter.rawPayload as Record<string, unknown>,
    fetchedAt: new Date(),
    sourceUpdatedAt: importRecord?.sourceUpdatedAt || undefined,
  }

  await progress.checkCancelled()

  const entityScope = job.entityScope
  let status: JobStatus = 'completed'
  let message: string | null = null

  try {
    switch (entityScope) {
      case 'competitions':
        status = await processCompetitionRecord(job, adapter, progress, rawRecord)
        break
      case 'teams':
        status = await processTeamRecord(job, adapter, progress, rawRecord)
        break
      case 'events':
      case 'fixtures':
      case 'live':
        status = await processEventRecord(job, adapter, progress, rawRecord)
        break
      default:
        throw new Error(`Replay is not implemented for '${entityScope}'.`)
    }

    await prisma.importDeadLetter.update({
      where: { id: deadLetterId },
      data: {
        resolvedAt: new Date(),
        lastRetryAt: new Date(),
        retryCount: { increment: 1 },
        nextRetryAt: null,
      }
    })
  } catch (error) {
    await prisma.importDeadLetter.update({
      where: { id: deadLetterId },
      data: {
        lastRetryAt: new Date(),
        retryCount: { increment: 1 },
      }
    })
    throw error
  }

  if (status === 'partial') {
    message = 'Dead-letter replay completed with unresolved issues.'
  }

  return { status, message }
}

async function importTeams(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>
) {
  if (!adapter.fetchTeams || !adapter.normalizeTeam) {
    throw new Error(`Import scope '${job.entityScope}' is not implemented for source '${job.source.code}'.`)
  }

  let competitionIds = await getSourceCompetitionIds(job.sourceId)
  if (competitionIds.length === 0) {
    await importCompetitions(job, adapter, progress)
    competitionIds = await getSourceCompetitionIds(job.sourceId)
  }

  if (competitionIds.length === 0) {
    throw new Error(`No competition source links are available for '${job.source.code}' team imports.`)
  }

  const rawRecords = await adapter.fetchTeams({ competitionIds })
  let sawSkip = false

  for (const rawRecord of rawRecords) {
    const status = await processTeamRecord(job, adapter, progress, rawRecord)
    sawSkip = sawSkip || status === 'partial'
  }

  return {
    status: sawSkip ? 'partial' as const : 'completed' as const,
    message: sawSkip ? 'Some team records could not be processed.' : null,
  }
}

async function importCompetitions(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>
) {
  const rawRecords = await adapter.fetchCompetitions({})
  let sawSkip = false

  for (const rawRecord of rawRecords) {
    const status = await processCompetitionRecord(job, adapter, progress, rawRecord)
    sawSkip = sawSkip || status === 'partial'
  }

  return {
    status: sawSkip ? 'partial' as const : 'completed' as const,
    message: sawSkip ? 'Some competition records could not be processed.' : null,
  }
}

async function importEvents(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>,
  liveOnly = false
) {
  const now = new Date()
  const dateFrom = formatDateOffset(now, -1)
  const dateTo = formatDateOffset(now, 14)
  const rawRecords = liveOnly && adapter.fetchLiveUpdates
    ? await adapter.fetchLiveUpdates({ dateFrom, dateTo })
    : await adapter.fetchFixtures({ dateFrom, dateTo })

  let sawSkip = false

  for (const rawRecord of rawRecords) {
    const status = await processEventRecord(job, adapter, progress, rawRecord)
    sawSkip = sawSkip || status === 'partial'
  }

  return {
    status: sawSkip ? 'partial' as const : 'completed' as const,
    message: sawSkip ? 'Some event records could not be applied automatically.' : null,
  }
}

