/**
 * Shared import-pipeline primitives (C-1 decomposition of ImportJobRunner).
 * Job loading, cancellation, dedup service singleton, and small pure helpers
 * used across stages. Keep this module dependency-light to avoid cycles.
 */
import crypto from 'crypto'
import { readImportJobStats } from '../services/ImportJobState.js'
import { prisma } from '../../db/prisma.js'
import { DeduplicationService } from '../services/DeduplicationService.js'
import type { EntityType } from '../types.js'

export type JobWithSource = Awaited<ReturnType<typeof loadJob>>

export const deduplicationService = new DeduplicationService()

export class ImportJobCancelledError extends Error {
  constructor(message = 'Import job cancelled by operator.') {
    super(message)
    this.name = 'ImportJobCancelledError'
  }
}

export async function loadJob(jobId: string) {
  return prisma.importJob.findUnique({
    where: { id: jobId },
    include: {
      source: true,
    }
  })
}
export function readCount(value: unknown, key: 'recordsProcessed' | 'recordsCreated' | 'recordsUpdated' | 'recordsSkipped') {
  const stats = readImportJobStats(value)
  const raw = stats[key]
  return typeof raw === 'number' ? raw : 0
}

export function scopeToRecordType(entityScope: string): EntityType {
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

export function normalizeRecordType(value: string | null | undefined, fallback: EntityType): EntityType {
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

export function hashValue(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function normalizeName(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

