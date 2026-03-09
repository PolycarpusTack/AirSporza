import { Prisma } from '@prisma/client'
import crypto from 'crypto'
import { prisma } from '../../db/prisma.js'
import { emit } from '../../services/socketInstance.js'
import { logger } from '../../utils/logger.js'
import { createImportAdapter } from '../adapters/index.js'
import type { ImportAdapter } from '../adapters/BaseAdapter.js'
import { DeduplicationService } from './DeduplicationService.js'
import { DailyRateLimitExceededError, acquireRateLimitSlot } from './ImportRateLimitService.js'
import {
  getFieldSourceCodes,
  recordFieldProvenance,
  shouldApplyImportedField,
} from './ImportGovernanceService.js'
import { ensureImportSchemaReady } from './ImportSchemaService.js'
import {
  IMPORT_JOB_HEARTBEAT_MS,
  IMPORT_JOB_MAX_RETRIES,
  mergeImportJobStats,
  nextLeaseExpiry,
  readImportJobStats,
  type ImportJobStats,
} from './ImportJobState.js'
import type {
  CanonicalImportEvent,
  EntityType,
  NormalizedCompetition,
  NormalizedTeam,
  RawSourceRecord,
  SourceCode,
} from '../types.js'

type JobWithSource = Awaited<ReturnType<typeof loadJob>>
type JobStatus = 'completed' | 'partial'

type RunImportJobOptions = {
  workerId?: string
}

type ProcessContext = {
  job: NonNullable<JobWithSource>
  adapter: ImportAdapter
  progress: ReturnType<typeof createProgressController>
}

const deduplicationService = new DeduplicationService()

class ImportJobCancelledError extends Error {
  constructor(message = 'Import job cancelled by operator.') {
    super(message)
    this.name = 'ImportJobCancelledError'
  }
}

export async function runImportJob(jobId: string, options: RunImportJobOptions = {}) {
  await ensureImportSchemaReady()

  const job = await loadJob(jobId)
  if (!job) {
    throw new Error(`Import job '${jobId}' not found.`)
  }

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

    await prisma.syncHistory.create({
      data: {
        tenantId: job.tenantId,
        entityType: job.entityScope,
        entityId: null,
        sourceCode: job.source.code,
        syncType: 'manual',
        triggeredBy: String(finalStats.requestedBy || 'system'),
        status: result.status === 'completed' ? 'success' : 'partial',
        recordsProcessed: finalStats.recordsProcessed || 0,
        recordsCreated: finalStats.recordsCreated || 0,
        recordsUpdated: finalStats.recordsUpdated || 0,
        recordsSkipped: finalStats.recordsSkipped || 0,
        errorMessage: result.message ?? null,
      }
    })
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

async function processCompetitionRecord(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>,
  rawRecord: RawSourceRecord
) {
  await progress.checkCancelled()

  try {
    const normalized = adapter.normalizeCompetition(rawRecord)
    await upsertImportRecord(job.id, job.sourceId, job.tenantId, rawRecord, normalized)

    if (!normalized) {
      await progress.increment({ recordsProcessed: 1, recordsSkipped: 1 })
      return 'partial' as const
    }

    const result = await upsertCompetition(job.sourceId, job.tenantId, normalized)
    await progress.increment({
      recordsProcessed: 1,
      recordsCreated: result === 'created' ? 1 : 0,
      recordsUpdated: result === 'updated' ? 1 : 0,
    })
    return 'completed' as const
  } catch (error) {
    await progress.increment({ recordsProcessed: 1, recordsSkipped: 1 })
    await writeDeadLetter(job, rawRecord, error)
    return 'partial' as const
  }
}

async function processTeamRecord(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>,
  rawRecord: RawSourceRecord
) {
  await progress.checkCancelled()

  try {
    if (!adapter.normalizeTeam) {
      throw new Error(`Import scope '${job.entityScope}' is not implemented for source '${job.source.code}'.`)
    }

    const normalized = adapter.normalizeTeam(rawRecord)
    await upsertImportRecord(job.id, job.sourceId, job.tenantId, rawRecord, normalized)

    if (!normalized) {
      await progress.increment({ recordsProcessed: 1, recordsSkipped: 1 })
      return 'partial' as const
    }

    const result = await upsertTeam(job.sourceId, job.tenantId, normalized)
    await progress.increment({
      recordsProcessed: 1,
      recordsCreated: result === 'created' ? 1 : 0,
      recordsUpdated: result === 'updated' ? 1 : 0,
    })
    return 'completed' as const
  } catch (error) {
    await progress.increment({ recordsProcessed: 1, recordsSkipped: 1 })
    await writeDeadLetter(job, rawRecord, error)
    return 'partial' as const
  }
}

async function processEventRecord(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>,
  rawRecord: RawSourceRecord
) {
  await progress.checkCancelled()

  try {
    const normalized = adapter.normalizeFixture(rawRecord)
    const importRecord = await upsertImportRecord(job.id, job.sourceId, job.tenantId, rawRecord, normalized)

    if (!normalized) {
      await progress.increment({ recordsProcessed: 1, recordsSkipped: 1 })
      return 'partial' as const
    }

    const eventResult = await upsertEvent(job.sourceId, job.tenantId, rawRecord, normalized)
    if (eventResult.kind === 'review') {
      await prisma.mergeCandidate.create({
        data: {
          tenantId: job.tenantId,
          importRecordId: importRecord.id,
          entityType: 'event',
          suggestedEntityId: eventResult.suggestedEntityId,
          confidence: eventResult.confidence,
          reasonCodes: eventResult.reasonCodes,
          status: 'pending',
        }
      })
      await progress.increment({ recordsProcessed: 1, recordsSkipped: 1 })
      return 'partial' as const
    }

    await progress.increment({
      recordsProcessed: 1,
      recordsCreated: eventResult.kind === 'created' ? 1 : 0,
      recordsUpdated: eventResult.kind === 'updated' ? 1 : 0,
    })
    return 'completed' as const
  } catch (error) {
    await progress.increment({ recordsProcessed: 1, recordsSkipped: 1 })
    await writeDeadLetter(job, rawRecord, error)
    return 'partial' as const
  }
}

function createProgressController(jobId: string, initialStats: ImportJobStats, workerId?: string) {
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

async function handleJobFailure(
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

async function writeSyncHistory(
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

async function upsertCompetition(sourceId: string, tenantId: string, normalized: NormalizedCompetition) {
  const sport = await prisma.sport.findFirst({
    where: { name: { equals: normalized.sport, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sport}' not found.`)
  }

  const canonicalCompetition = await prisma.canonicalCompetition.upsert({
    where: {
      sportId_primaryName: {
        sportId: sport.id,
        primaryName: normalized.name,
      }
    },
    create: {
      tenantId,
      sportId: sport.id,
      primaryName: normalized.name,
      countryCode: normalized.country || null,
      logoUrl: normalized.logoUrl || null,
      primarySourceId: sourceId,
    },
    update: {
      countryCode: normalized.country || null,
      logoUrl: normalized.logoUrl || null,
      primarySourceId: sourceId,
    }
  })

  const season = normalized.season || String(new Date().getUTCFullYear())
  const existing = await prisma.competition.findUnique({
    where: {
      sportId_name_season: {
        sportId: sport.id,
        name: normalized.name,
        season,
      }
    }
  })

  const competition = existing
    ? await prisma.competition.update({
        where: { id: existing.id },
        data: { matches: existing.matches || 0 }
      })
    : await prisma.competition.create({
        data: {
          tenantId,
          sportId: sport.id,
          name: normalized.name,
          season,
          matches: 0,
        }
      })

  await prisma.competitionAlias.upsert({
    where: {
      sourceId_normalizedAlias: {
        sourceId,
        normalizedAlias: normalizeName(normalized.name),
      }
    },
    create: {
      tenantId,
      sourceId,
      alias: normalized.name,
      normalizedAlias: normalizeName(normalized.name),
      canonicalCompetitionId: canonicalCompetition.id,
    },
    update: {
      alias: normalized.name,
    }
  })

  await prisma.importSourceLink.upsert({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId: normalized.sourceId,
        entityType: 'competition',
      }
    },
    create: {
      tenantId,
      sourceId,
      sourceRecordId: normalized.sourceId,
      entityType: 'competition',
      entityId: String(competition.id),
      confidence: 100,
      matchMethod: 'exact',
      isManual: false,
    },
    update: {
      entityId: String(competition.id),
      confidence: 100,
      matchMethod: 'exact',
    }
  })

  await recordFieldProvenance({
    entityType: 'competition',
    entityId: String(competition.id),
    fieldNames: ['name', 'season'],
    sourceId,
    sourceRecordId: normalized.sourceId,
    sourceUpdatedAt: null,
  })

  return existing ? 'updated' as const : 'created' as const
}

async function upsertTeam(sourceId: string, tenantId: string, normalized: NormalizedTeam) {
  const sport = await prisma.sport.findFirst({
    where: { name: { equals: normalized.sport, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sport}' not found.`)
  }

  const canonicalTeam = await prisma.canonicalTeam.upsert({
    where: {
      sportId_primaryName: {
        sportId: sport.id,
        primaryName: normalized.name,
      }
    },
    create: {
      tenantId,
      sportId: sport.id,
      primaryName: normalized.name,
      countryCode: normalized.country || null,
      logoUrl: normalized.logoUrl || null,
      primarySourceId: sourceId,
    },
    update: {
      countryCode: normalized.country || null,
      logoUrl: normalized.logoUrl || null,
      primarySourceId: sourceId,
    }
  })

  await prisma.teamAlias.upsert({
    where: {
      sourceId_normalizedAlias: {
        sourceId,
        normalizedAlias: normalizeName(normalized.name),
      }
    },
    create: {
      tenantId,
      sourceId,
      alias: normalized.name,
      normalizedAlias: normalizeName(normalized.name),
      canonicalTeamId: canonicalTeam.id,
    },
    update: {
      alias: normalized.name,
      canonicalTeamId: canonicalTeam.id,
    }
  })

  const existingLink = await prisma.importSourceLink.findUnique({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId: normalized.sourceId,
        entityType: 'team',
      }
    }
  })

  await prisma.importSourceLink.upsert({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId: normalized.sourceId,
        entityType: 'team',
      }
    },
    create: {
      tenantId,
      sourceId,
      sourceRecordId: normalized.sourceId,
      entityType: 'team',
      entityId: canonicalTeam.id,
      confidence: 100,
      matchMethod: 'exact',
      isManual: false,
    },
    update: {
      entityId: canonicalTeam.id,
      confidence: 100,
      matchMethod: 'exact',
    }
  })

  await recordFieldProvenance({
    entityType: 'team',
    entityId: canonicalTeam.id,
    fieldNames: ['primaryName', 'countryCode', 'logoUrl'],
    sourceId,
    sourceRecordId: normalized.sourceId,
    sourceUpdatedAt: null,
  })

  return existingLink ? 'updated' as const : 'created' as const
}

async function upsertEvent(sourceId: string, tenantId: string, rawRecord: RawSourceRecord, normalized: CanonicalImportEvent) {
  const sport = await prisma.sport.findFirst({
    where: { name: { equals: normalized.sportName, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sportName}' not found.`)
  }

  await upsertCompetition(sourceId, tenantId, {
    sourceCode: normalized.externalKeys[0]?.source || 'football_data',
    sourceId: normalized.externalKeys[0]?.id || rawRecord.id,
    name: normalized.competitionName,
    sport: normalized.sportName,
    country: normalized.country,
    season: normalized.seasonLabel,
    logoUrl: undefined,
  })

  const competition = await prisma.competition.findFirst({
    where: {
      sportId: sport.id,
      name: { equals: normalized.competitionName, mode: 'insensitive' },
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (!competition) {
    throw new Error(`Competition '${normalized.competitionName}' not found after upsert.`)
  }

  const exactMatch = await deduplicationService.findExactMatch(sourceId, rawRecord.id, 'event')
  if (exactMatch?.entityId) {
    const updated = await updateImportedEvent(
      Number(exactMatch.entityId),
      normalized,
      sport.id,
      competition.id,
      sourceId,
      rawRecord.id,
      rawRecord.sourceUpdatedAt || null
    )
    emit('event:updated', updated)
    return { kind: 'updated' as const }
  }

  const fingerprintMatch = await deduplicationService.findFingerprintMatch(normalized)
  if (fingerprintMatch?.entityId) {
    const updated = await updateImportedEvent(
      Number(fingerprintMatch.entityId),
      normalized,
      sport.id,
      competition.id,
      sourceId,
      rawRecord.id,
      rawRecord.sourceUpdatedAt || null
    )
    await upsertEventSourceLink(sourceId, tenantId, rawRecord.id, updated.id, fingerprintMatch.confidence, fingerprintMatch.method)
    emit('event:updated', updated)
    return { kind: 'updated' as const }
  }

  const fuzzyMatches = await deduplicationService.findFuzzyMatch(normalized, normalized.externalKeys[0]?.source || 'football_data')
  const strongestFuzzy = fuzzyMatches[0]
  if (strongestFuzzy && !strongestFuzzy.matched) {
    return {
      kind: 'review' as const,
      suggestedEntityId: strongestFuzzy.entityId ?? null,
      confidence: strongestFuzzy.confidence,
      reasonCodes: strongestFuzzy.reasonCodes,
    }
  }

  if (strongestFuzzy?.matched && strongestFuzzy.entityId) {
    const updated = await updateImportedEvent(
      Number(strongestFuzzy.entityId),
      normalized,
      sport.id,
      competition.id,
      sourceId,
      rawRecord.id,
      rawRecord.sourceUpdatedAt || null
    )
    await upsertEventSourceLink(sourceId, tenantId, rawRecord.id, updated.id, strongestFuzzy.confidence, strongestFuzzy.method)
    emit('event:updated', updated)
    return { kind: 'updated' as const }
  }

  const createdSourceCode = normalized.externalKeys[0]?.source || 'football_data'
  const createdPatch = await buildImportedEventData(
    normalized,
    sport.id,
    competition.id,
    null,
    createdSourceCode
  )
  const created = await prisma.event.create({
    data: { ...createdPatch.data, tenantId },
    include: {
      sport: true,
      competition: true,
    }
  })

  await upsertEventSourceLink(sourceId, tenantId, rawRecord.id, created.id, 100, 'exact')
  await recordFieldProvenance({
    entityType: 'event',
    entityId: String(created.id),
    fieldNames: createdPatch.appliedFields,
    sourceId,
    sourceRecordId: rawRecord.id,
    sourceUpdatedAt: rawRecord.sourceUpdatedAt || null,
  })
  emit('event:created', created)

  return { kind: 'created' as const }
}

export async function manualMergeNormalizedEvent(params: {
  sourceId: string
  sourceRecordId: string
  sourceUpdatedAt?: Date | null
  normalized: CanonicalImportEvent
  targetEventId: number
  tenantId?: string
}) {
  const { sourceId, sourceRecordId, sourceUpdatedAt, normalized, targetEventId, tenantId } = params

  const sport = await prisma.sport.findFirst({
    where: { name: { equals: normalized.sportName, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sportName}' not found.`)
  }

  await upsertCompetition(sourceId, tenantId || '', {
    sourceCode: normalized.externalKeys[0]?.source || 'football_data',
    sourceId: normalized.externalKeys[0]?.id || sourceRecordId,
    name: normalized.competitionName,
    sport: normalized.sportName,
    country: normalized.country,
    season: normalized.seasonLabel,
    logoUrl: undefined,
  })

  const competition = await prisma.competition.findFirst({
    where: {
      sportId: sport.id,
      name: { equals: normalized.competitionName, mode: 'insensitive' },
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (!competition) {
    throw new Error(`Competition '${normalized.competitionName}' not found after upsert.`)
  }

  const updated = await updateImportedEvent(
    targetEventId,
    normalized,
    sport.id,
    competition.id,
    sourceId,
    sourceRecordId,
    sourceUpdatedAt || null
  )

  await upsertEventSourceLink(sourceId, tenantId || '', sourceRecordId, updated.id, 100, 'manual')
  emit('event:updated', updated)
  return updated
}

export async function manualCreateNormalizedEvent(params: {
  sourceId: string
  sourceRecordId: string
  sourceUpdatedAt?: Date | null
  normalized: CanonicalImportEvent
  tenantId?: string
}) {
  const { sourceId, sourceRecordId, sourceUpdatedAt, normalized, tenantId } = params

  const sport = await prisma.sport.findFirst({
    where: { name: { equals: normalized.sportName, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sportName}' not found.`)
  }

  await upsertCompetition(sourceId, tenantId || '', {
    sourceCode: normalized.externalKeys[0]?.source || 'football_data',
    sourceId: normalized.externalKeys[0]?.id || sourceRecordId,
    name: normalized.competitionName,
    sport: normalized.sportName,
    country: normalized.country,
    season: normalized.seasonLabel,
    logoUrl: undefined,
  })

  const competition = await prisma.competition.findFirst({
    where: {
      sportId: sport.id,
      name: { equals: normalized.competitionName, mode: 'insensitive' },
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (!competition) {
    throw new Error(`Competition '${normalized.competitionName}' not found after upsert.`)
  }

  const sourceCode = normalized.externalKeys[0]?.source || 'football_data'
  const createdPatch = await buildImportedEventData(
    normalized,
    sport.id,
    competition.id,
    null,
    sourceCode
  )

  const created = await prisma.event.create({
    data: { ...createdPatch.data, tenantId: tenantId || '' },
    include: {
      sport: true,
      competition: true,
    }
  })

  await upsertEventSourceLink(sourceId, tenantId || '', sourceRecordId, created.id, 100, 'manual')
  await recordFieldProvenance({
    entityType: 'event',
    entityId: String(created.id),
    fieldNames: createdPatch.appliedFields,
    sourceId,
    sourceRecordId,
    sourceUpdatedAt: sourceUpdatedAt || null,
  })
  emit('event:created', created)
  return created
}

async function updateImportedEvent(
  eventId: number,
  normalized: CanonicalImportEvent,
  sportId: number,
  competitionId: number,
  sourceId: string,
  sourceRecordId: string,
  sourceUpdatedAt: Date | null
) {
  const existing = await prisma.event.findUnique({
    where: { id: eventId }
  })

  if (!existing) {
    throw new Error(`Event '${eventId}' not found.`)
  }

  const sourceCode = normalized.externalKeys[0]?.source || 'football_data'
  const patch = await buildImportedEventData(
    normalized,
    sportId,
    competitionId,
    existing,
    sourceCode
  )

  return prisma.event.update({
    where: { id: eventId },
    data: patch.data,
    include: {
      sport: true,
      competition: true,
    }
  }).then(async updated => {
    await recordFieldProvenance({
      entityType: 'event',
      entityId: String(updated.id),
      fieldNames: patch.appliedFields,
      sourceId,
      sourceRecordId,
      sourceUpdatedAt,
    })
    return updated
  })
}

async function upsertEventSourceLink(sourceId: string, tenantId: string, sourceRecordId: string, eventId: number, confidence: number, method: 'exact' | 'fingerprint' | 'fuzzy' | 'manual') {
  await prisma.importSourceLink.upsert({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId,
        entityType: 'event',
      }
    },
    create: {
      tenantId,
      sourceId,
      sourceRecordId,
      entityType: 'event',
      entityId: String(eventId),
      confidence,
      matchMethod: method,
      isManual: false,
    },
    update: {
      entityId: String(eventId),
      confidence,
      matchMethod: method,
    }
  })
}

async function buildImportedEventData(normalized: CanonicalImportEvent, sportId: number, competitionId: number, existing: {
  sportId: number
  competitionId: number
  phase: string | null
  category: string | null
  participants: string
  content: string | null
  startDateBE: Date
  startTimeBE: string
  startDateOrigin: Date | null
  startTimeOrigin: string | null
  complex: string | null
  livestreamDate: Date | null
  livestreamTime: string | null
  linearChannel: string | null
  radioChannel: string | null
  linearStartTime: string | null
  isLive: boolean
  isDelayedLive: boolean
  videoRef: string | null
  winner: string | null
  score: string | null
  duration: string | null
  customFields: unknown
  createdById: string | null
  id?: number
} | null, sourceCode: SourceCode) {
  const startsAt = new Date(normalized.startsAtUtc)
  const brusselsDate = formatDateInZone(startsAt, 'Europe/Brussels')
  const brusselsTime = formatTimeInZone(startsAt, 'Europe/Brussels')
  const originDate = formatDateInZone(startsAt, normalized.sourceTimezone || 'UTC')
  const originTime = formatTimeInZone(startsAt, normalized.sourceTimezone || 'UTC')
  const participants = normalized.homeTeam && normalized.awayTeam
    ? `${normalized.homeTeam} vs ${normalized.awayTeam}`
    : normalized.participantsText || existing?.participants || 'Imported event'

  const incoming = {
    sportId,
    competitionId,
    phase: normalized.stage || existing?.phase || '',
    category: existing?.category || 'Imported',
    participants,
    content: normalized.metadata.matchday ? `${normalized.competitionName} - Matchday ${normalized.metadata.matchday}` : (existing?.content || normalized.competitionName),
    startDateBE: new Date(`${brusselsDate}T00:00:00.000Z`),
    startTimeBE: brusselsTime,
    startDateOrigin: new Date(`${originDate}T00:00:00.000Z`),
    startTimeOrigin: originTime,
    complex: normalized.venueName || existing?.complex || '',
    isLive: normalized.status === 'live' || normalized.status === 'halftime',
    winner: normalized.winner || '',
    score: normalized.scoreHome != null && normalized.scoreAway != null ? `${normalized.scoreHome}-${normalized.scoreAway}` : '',
  }

  const currentSources = existing?.id != null
    ? await getFieldSourceCodes('event', String(existing.id))
    : {}

  const data = {
    sportId: shouldApplyImportedField('sportId', sourceCode, currentSources.sportId) ? incoming.sportId : sportId,
    competitionId: shouldApplyImportedField('competitionId', sourceCode, currentSources.competitionId) ? incoming.competitionId : competitionId,
    phase: shouldApplyImportedField('phase', sourceCode, currentSources.phase) ? incoming.phase : (existing?.phase || ''),
    category: existing?.category || incoming.category,
    participants: shouldApplyImportedField('participants', sourceCode, currentSources.participants) ? incoming.participants : (existing?.participants || incoming.participants),
    content: shouldApplyImportedField('content', sourceCode, currentSources.content) ? incoming.content : (existing?.content || incoming.content),
    startDateBE: shouldApplyImportedField('startDateBE', sourceCode, currentSources.startDateBE) ? incoming.startDateBE : incoming.startDateBE,
    startTimeBE: shouldApplyImportedField('startTimeBE', sourceCode, currentSources.startTimeBE) ? incoming.startTimeBE : (existing?.startTimeBE || incoming.startTimeBE),
    startDateOrigin: shouldApplyImportedField('startDateOrigin', sourceCode, currentSources.startDateOrigin) ? incoming.startDateOrigin : (existing?.startDateOrigin || incoming.startDateOrigin),
    startTimeOrigin: shouldApplyImportedField('startTimeOrigin', sourceCode, currentSources.startTimeOrigin) ? incoming.startTimeOrigin : (existing?.startTimeOrigin || incoming.startTimeOrigin),
    complex: shouldApplyImportedField('complex', sourceCode, currentSources.complex) ? incoming.complex : (existing?.complex || incoming.complex),
    livestreamDate: existing?.livestreamDate || null,
    livestreamTime: existing?.livestreamTime || null,
    linearChannel: existing?.linearChannel || '',
    radioChannel: existing?.radioChannel || '',
    linearStartTime: existing?.linearStartTime || brusselsTime,
    isLive: shouldApplyImportedField('isLive', sourceCode, currentSources.isLive) ? incoming.isLive : (existing?.isLive || false),
    isDelayedLive: existing?.isDelayedLive || false,
    videoRef: existing?.videoRef || '',
    winner: shouldApplyImportedField('winner', sourceCode, currentSources.winner) ? incoming.winner : (existing?.winner || ''),
    score: shouldApplyImportedField('score', sourceCode, currentSources.score) ? incoming.score : (existing?.score || ''),
    duration: existing?.duration || '',
    customFields: existing?.customFields || {},
    createdById: existing?.createdById || null,
  }

  const appliedFields = Object.keys(incoming).filter(fieldName => {
    if (!existing) return true
    return shouldApplyImportedField(fieldName, sourceCode, currentSources[fieldName])
  })

  return {
    data,
    appliedFields,
  }
}

async function upsertImportRecord(
  jobId: string,
  sourceId: string,
  tenantId: string,
  rawRecord: RawSourceRecord,
  normalized: unknown
) {
  const payloadHash = hashValue(rawRecord.raw)
  const normalizedHash = normalized ? hashValue(normalized) : null

  return prisma.importRecord.upsert({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId: rawRecord.id,
        entityType: rawRecord.type,
      }
    },
    create: {
      tenantId,
      jobId,
      sourceId,
      sourceRecordId: rawRecord.id,
      sourceUpdatedAt: rawRecord.sourceUpdatedAt || null,
      entityType: rawRecord.type,
      payloadJson: rawRecord.raw as Prisma.InputJsonValue,
      payloadHash,
      normalizedJson: normalized ? normalized as Prisma.InputJsonValue : Prisma.JsonNull,
      normalizedHash: normalizedHash ?? undefined,
      validationStatus: normalized ? 'valid' : 'invalid',
      validationErrors: (normalized ? [] : ['Normalization returned null']) as Prisma.InputJsonValue,
    },
    update: {
      jobId,
      sourceUpdatedAt: rawRecord.sourceUpdatedAt || null,
      payloadJson: rawRecord.raw as Prisma.InputJsonValue,
      payloadHash,
      normalizedJson: normalized ? normalized as Prisma.InputJsonValue : Prisma.JsonNull,
      normalizedHash: normalizedHash ?? undefined,
      validationStatus: normalized ? 'valid' : 'invalid',
      validationErrors: (normalized ? [] : ['Normalization returned null']) as Prisma.InputJsonValue,
      isSuperseded: false,
      supersededByJobId: null,
    }
  })
}

async function writeDeadLetter(job: NonNullable<JobWithSource>, rawRecord: RawSourceRecord, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  await prisma.importDeadLetter.create({
    data: {
      tenantId: job.tenantId,
      jobId: job.id,
      sourceId: job.sourceId,
      sourceRecordId: rawRecord.id,
      rawPayload: rawRecord.raw as Prisma.InputJsonValue,
      errorMessage: message,
      errorType: 'record_error',
    }
  })
}

async function getSourceCompetitionIds(sourceId: string) {
  const links = await prisma.importSourceLink.findMany({
    where: {
      sourceId,
      entityType: 'competition',
    },
    select: {
      sourceRecordId: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  return links.map(link => link.sourceRecordId)
}

function readCount(value: unknown, key: 'recordsProcessed' | 'recordsCreated' | 'recordsUpdated' | 'recordsSkipped') {
  const stats = readImportJobStats(value)
  const raw = stats[key]
  return typeof raw === 'number' ? raw : 0
}

function getRetryDelayMs(classification: ReturnType<ImportAdapter['classifyError']>, retryCount: number) {
  if (classification === 'rate_limited') {
    return Math.min(15 * 60 * 1000, (retryCount + 1) * 60 * 1000)
  }

  return Math.min(10 * 60 * 1000, (retryCount + 1) * 30 * 1000)
}

function scopeToRecordType(entityScope: string): EntityType {
  switch (entityScope) {
    case 'competitions':
      return 'competition'
    case 'teams':
      return 'team'
    case 'events':
    case 'fixtures':
    case 'live':
      return 'event'
    default:
      return 'event'
  }
}

function normalizeRecordType(value: string | null | undefined, fallback: EntityType): EntityType {
  switch (value) {
    case 'sport':
    case 'competition':
    case 'team':
    case 'venue':
    case 'event':
      return value
    default:
      return fallback
  }
}

function hashValue(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function formatDateOffset(base: Date, offsetDays: number) {
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + offsetDays)
  return next.toISOString().slice(0, 10)
}

function formatDateInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find(part => part.type === 'year')?.value || '1970'
  const month = parts.find(part => part.type === 'month')?.value || '01'
  const day = parts.find(part => part.type === 'day')?.value || '01'

  return `${year}-${month}-${day}`
}

function formatTimeInZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

async function loadJob(jobId: string) {
  return prisma.importJob.findUnique({
    where: { id: jobId },
    include: {
      source: true,
    }
  })
}
