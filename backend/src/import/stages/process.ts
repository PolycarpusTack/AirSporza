/**
 * Process stage (C-1 decomposition of ImportJobRunner).
 * Per-record processing: persist the raw ImportRecord, then provision the
 * normalized entity (competition / team / event) through the provision stage.
 */
import type { RawSourceRecord } from '../types.js'
import { prisma } from '../../db/prisma.js'
import type { ImportAdapter } from '../adapters/BaseAdapter.js'
import type { JobWithSource } from './shared.js'
import { createProgressController } from './progress.js'
import { upsertImportRecord, writeDeadLetter } from './records.js'
import { upsertCompetition, upsertEvent, upsertTeam } from './provision.js'

export async function processCompetitionRecord(
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

export async function processTeamRecord(
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

export async function processEventRecord(
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

