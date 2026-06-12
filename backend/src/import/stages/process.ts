/**
 * Process stage (C-1 decomposition of ImportJobRunner).
 * Per-record processing: persist the raw ImportRecord, then provision the
 * normalized entity (competition / team / event) through the provision stage.
 *
 * TD-21 (EPIC G): the per-entity processors are thin bindings over one generic
 * `processRecord` parameterized by normalize/upsert functions. New entity
 * paths MUST bind the generic — never clone the pipeline.
 */
import type { RawSourceRecord } from '../types.js'
import { prisma } from '../../db/prisma.js'
import type { ImportAdapter } from '../adapters/BaseAdapter.js'
import type { JobWithSource } from './shared.js'
import { createProgressController } from './progress.js'
import { upsertImportRecord, writeDeadLetter } from './records.js'
import { upsertCompetition, upsertEvent, upsertPlayer, upsertTeam } from './provision.js'

type ProcessStatus = 'completed' | 'partial'

/**
 * Provision outcome. `review` is the optional merge-candidate branch: instead
 * of applying the record, a MergeCandidate row is queued for human review and
 * the record counts as skipped.
 */
export type ProvisionOutcome =
  | { kind: 'created' }
  | { kind: 'updated' }
  | { kind: 'review'; suggestedEntityId: string | null; confidence: number; reasonCodes: string[] }

type ProcessRecordSpec<TNormalized> = {
  /** entityType written on MergeCandidate rows for the review branch. */
  entityType: string
  /** Throwing here dead-letters the record, same as any other pipeline error. */
  normalize: (rawRecord: RawSourceRecord) => TNormalized | null
  upsert: (normalized: TNormalized, rawRecord: RawSourceRecord) => Promise<ProvisionOutcome>
}

/**
 * Generic per-record pipeline (TD-21 collapse of the former triplicated
 * process*Record functions): cancellation check -> normalize -> persist the
 * ImportRecord -> provision -> progress accounting, with a dead-letter catch.
 */
export async function processRecord<TNormalized>(
  job: NonNullable<JobWithSource>,
  progress: ReturnType<typeof createProgressController>,
  rawRecord: RawSourceRecord,
  spec: ProcessRecordSpec<TNormalized>
): Promise<ProcessStatus> {
  await progress.checkCancelled()

  try {
    const normalized = spec.normalize(rawRecord)
    const importRecord = await upsertImportRecord(job.id, job.sourceId, job.tenantId, rawRecord, normalized)

    if (!normalized) {
      await progress.increment({ recordsProcessed: 1, recordsSkipped: 1 })
      return 'partial'
    }

    const result = await spec.upsert(normalized, rawRecord)

    if (result.kind === 'review') {
      await prisma.mergeCandidate.create({
        data: {
          tenantId: job.tenantId,
          importRecordId: importRecord.id,
          entityType: spec.entityType,
          suggestedEntityId: result.suggestedEntityId,
          confidence: result.confidence,
          reasonCodes: result.reasonCodes,
          status: 'pending',
        }
      })
      await progress.increment({ recordsProcessed: 1, recordsSkipped: 1 })
      return 'partial'
    }

    await progress.increment({
      recordsProcessed: 1,
      recordsCreated: result.kind === 'created' ? 1 : 0,
      recordsUpdated: result.kind === 'updated' ? 1 : 0,
    })
    return 'completed'
  } catch (error) {
    await progress.increment({ recordsProcessed: 1, recordsSkipped: 1 })
    await writeDeadLetter(job, rawRecord, error)
    return 'partial'
  }
}

export async function processCompetitionRecord(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>,
  rawRecord: RawSourceRecord
) {
  return processRecord(job, progress, rawRecord, {
    entityType: 'competition',
    normalize: (raw) => adapter.normalizeCompetition(raw),
    upsert: async (normalized) => ({ kind: await upsertCompetition(job.sourceId, job.tenantId, normalized) }),
  })
}

export async function processTeamRecord(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>,
  rawRecord: RawSourceRecord
) {
  return processRecord(job, progress, rawRecord, {
    entityType: 'team',
    normalize: (raw) => {
      if (!adapter.normalizeTeam) {
        throw new Error(`Import scope '${job.entityScope}' is not implemented for source '${job.source.code}'.`)
      }
      return adapter.normalizeTeam(raw)
    },
    upsert: async (normalized) => ({ kind: await upsertTeam(job.sourceId, job.tenantId, normalized) }),
  })
}

export async function processPlayerRecord(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>,
  rawRecord: RawSourceRecord
) {
  return processRecord(job, progress, rawRecord, {
    entityType: 'player',
    normalize: (raw) => {
      if (!adapter.normalizePlayer) {
        throw new Error(`Import scope '${job.entityScope}' is not implemented for source '${job.source.code}'.`)
      }
      return adapter.normalizePlayer(raw)
    },
    // G review fix F1: upsertPlayer now returns the full ProvisionOutcome union
    // (incl. the `review` branch for unverified name collisions) — pass it through.
    upsert: (normalized) => upsertPlayer(job.sourceId, job.tenantId, normalized),
  })
}

export async function processEventRecord(
  job: NonNullable<JobWithSource>,
  adapter: ImportAdapter,
  progress: ReturnType<typeof createProgressController>,
  rawRecord: RawSourceRecord
) {
  return processRecord(job, progress, rawRecord, {
    entityType: 'event',
    normalize: (raw) => adapter.normalizeFixture(raw),
    upsert: (normalized, raw) => upsertEvent(job.sourceId, job.tenantId, raw, normalized),
  })
}
