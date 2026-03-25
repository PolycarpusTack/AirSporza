import { env } from '../../config/env.js'

export type ImportJobStats = {
  recordsProcessed?: number
  recordsCreated?: number
  recordsUpdated?: number
  recordsSkipped?: number
  requestedEntityId?: string | null
  requestedBy?: string | null
  note?: string | null
  workerId?: string | null
  heartbeatAt?: string | null
  leaseExpiresAt?: string | null
  deferredUntil?: string | null
  cancelRequested?: boolean
  cancelledBy?: string | null
  cancelledAt?: string | null
  retryCount?: number
  attempts?: number
  retryOf?: string | null
  replayDeadLetterId?: string | null
  lastError?: string | null
}

export const IMPORT_WORKER_POLL_MS = env.IMPORT_WORKER_POLL_MS
export const IMPORT_JOB_LEASE_MS = env.IMPORT_JOB_LEASE_MS
export const IMPORT_JOB_HEARTBEAT_MS = env.IMPORT_JOB_HEARTBEAT_MS
export const IMPORT_JOB_MAX_RETRIES = env.IMPORT_JOB_MAX_RETRIES

export function readImportJobStats(value: unknown): ImportJobStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as ImportJobStats
}

export function mergeImportJobStats(current: unknown, patch: Partial<ImportJobStats>): ImportJobStats {
  return {
    ...readImportJobStats(current),
    ...patch,
  }
}

export function isDeferred(stats: ImportJobStats, now = new Date()) {
  if (!stats.deferredUntil) return false
  return new Date(stats.deferredUntil).getTime() > now.getTime()
}

export function isLeaseActive(stats: ImportJobStats, now = new Date()) {
  if (!stats.leaseExpiresAt) return false
  return new Date(stats.leaseExpiresAt).getTime() > now.getTime()
}

export function nextLeaseExpiry(now = new Date()) {
  return new Date(now.getTime() + IMPORT_JOB_LEASE_MS).toISOString()
}
