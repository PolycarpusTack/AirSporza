/**
 * Records stage (C-1 decomposition of ImportJobRunner).
 * ImportRecord persistence, dead-letter writes, and source-link lookups.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import type { RawSourceRecord } from '../types.js'
import { hashValue, type JobWithSource } from './shared.js'

export async function upsertImportRecord(
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

export async function writeDeadLetter(job: NonNullable<JobWithSource>, rawRecord: RawSourceRecord, error: unknown) {
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

export async function getSourceCompetitionIds(sourceId: string) {
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

