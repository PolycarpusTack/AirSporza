/**
 * TD-20 fix (EPIC D): checkCancelled must adopt only externally-written
 * CONTROL fields (cancelRequested/cancelledBy) from the DB read — counters
 * are owned by this process and must never regress to stale persisted values
 * (a swallowed statsJson write failure used to roll them back).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    importJob: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))
vi.mock('../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { prisma } from '../src/db/prisma.js'
import { createProgressController } from '../src/import/stages/progress.js'
import { ImportJobCancelledError } from '../src/import/stages/shared.js'

const mp = prisma as unknown as {
  importJob: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  mp.importJob.update.mockResolvedValue({})
})

describe('progress.checkCancelled (TD-20)', () => {
  it('does NOT regress in-memory counters to stale DB values', async () => {
    const progress = createProgressController('job-1', { recordsProcessed: 0 })
    await progress.increment({ recordsProcessed: 10, recordsCreated: 7 })

    // DB row is STALE (a previous statsJson write failed and was swallowed)
    mp.importJob.findUnique.mockResolvedValue({
      status: 'running',
      statsJson: { recordsProcessed: 3, recordsCreated: 1 },
    })

    await progress.checkCancelled()
    const snap = progress.snapshot()
    expect(snap.recordsProcessed).toBe(10)
    expect(snap.recordsCreated).toBe(7)
  })

  it('still adopts an externally-written cancel signal', async () => {
    const progress = createProgressController('job-1', { recordsProcessed: 0 })
    mp.importJob.findUnique.mockResolvedValue({
      status: 'running',
      statsJson: { cancelRequested: true, cancelledBy: 'admin@planza.dev' },
    })

    await expect(progress.checkCancelled()).rejects.toThrow(ImportJobCancelledError)

    const p2 = createProgressController('job-2', {})
    await expect(p2.checkCancelled()).rejects.toThrow('admin@planza.dev')
  })

  it('a non-running status still cancels', async () => {
    const progress = createProgressController('job-1', {})
    mp.importJob.findUnique.mockResolvedValue({ status: 'cancelled', statsJson: {} })
    await expect(progress.checkCancelled()).rejects.toThrow(ImportJobCancelledError)
  })
})
