/**
 * useSyncData — quiet parallel fetch for the Sync screen (D-1-T2).
 * Idiom mirrors useRegistryData v1 (quiet failure, isActive cleanup, isSettled
 * settle-vocabulary) narrowed to TWO parallel collections (jobs + merge
 * candidates) + a refresh() (D-3 awaits it post-decision).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import type { ImportJob, ImportMergeCandidate } from '../../services'

const listJobs = vi.fn()
const listMergeCandidates = vi.fn()

vi.mock('../../services', () => ({
  importsApi: {
    listJobs: (...args: unknown[]) => listJobs(...args),
    listMergeCandidates: (...args: unknown[]) => listMergeCandidates(...args),
  },
}))

import { useSyncData } from './useSyncData'

const JOBS: ImportJob[] = [
  {
    id: 'job-1',
    sourceId: 'src-1',
    entityScope: 'teams',
    mode: 'incremental',
    status: 'completed',
    statsJson: { recordsProcessed: 42 },
    errorLog: null,
    cursor: null,
    startedAt: '2026-07-08T00:00:00Z',
    finishedAt: '2026-07-08T00:05:00Z',
    createdAt: '2026-07-08T00:00:00Z',
    source: { id: 'src-1', code: 'OPTA', name: 'Opta Feed' },
    _count: { records: 42, deadLetters: 0 },
  },
]
const CANDIDATES: ImportMergeCandidate[] = [
  {
    id: 'cand-1',
    entityType: 'team',
    suggestedEntityId: 'team-9',
    confidence: 0.91,
    reasonCodes: ['NAME_MATCH'],
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-07-08T00:00:00Z',
    importRecord: {
      id: 'rec-1',
      sourceId: 'src-1',
      sourceRecordId: 'ext-1',
      entityType: 'team',
      normalizedJson: null,
      sourceUpdatedAt: null,
      source: { id: 'src-1', code: 'OPTA', name: 'Opta Feed' },
    },
  },
]

/** Manually-settleable promise for parallel / mid-flight / post-unmount pins. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  listJobs.mockReset().mockResolvedValue(JOBS)
  listMergeCandidates.mockReset().mockResolvedValue(CANDIDATES)
})

afterEach(() => cleanup())

describe('useSyncData — mount fetch', () => {
  it('fires both list calls in parallel on mount; before resolution isSettled is false and both collections are []', () => {
    const j = deferred<ImportJob[]>()
    const c = deferred<ImportMergeCandidate[]>()
    listJobs.mockReturnValue(j.promise)
    listMergeCandidates.mockReturnValue(c.promise)

    const { result } = renderHook(() => useSyncData())

    expect(listJobs).toHaveBeenCalledTimes(1)
    expect(listMergeCandidates).toHaveBeenCalledTimes(1)

    expect(result.current.isSettled).toBe(false)
    expect(result.current.jobs).toEqual([])
    expect(result.current.candidates).toEqual([])
  })

  it('calls listJobs bare (backend default limit) and listMergeCandidates with { status: pending }', () => {
    renderHook(() => useSyncData())

    expect(listJobs).toHaveBeenCalledWith()
    expect(listMergeCandidates).toHaveBeenCalledWith({ status: 'pending' })
  })

  it('populates both collections and settles once both resolve', async () => {
    const { result } = renderHook(() => useSyncData())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.jobs).toEqual(JOBS)
    expect(result.current.candidates).toEqual(CANDIDATES)
  })
})

describe('useSyncData — quiet failure (mirrors useContracts pin 2)', () => {
  it('a single rejected fetch leaves ITS collection [] but still settles (the other populated)', async () => {
    listJobs.mockReset().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSyncData())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.jobs).toEqual([])
    expect(result.current.candidates).toEqual(CANDIDATES)
  })

  it('both rejecting still settles with empty collections (no hanging skeleton)', async () => {
    listJobs.mockReset().mockRejectedValue(new Error('x'))
    listMergeCandidates.mockReset().mockRejectedValue(new Error('x'))
    const { result } = renderHook(() => useSyncData())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.jobs).toEqual([])
    expect(result.current.candidates).toEqual([])
  })
})

describe('useSyncData — refresh()', () => {
  it('refetches both, updates state, and its promise resolves once both settle', async () => {
    const { result } = renderHook(() => useSyncData())
    await waitFor(() => expect(result.current.isSettled).toBe(true))
    expect(listJobs).toHaveBeenCalledTimes(1)

    const JOBS2: ImportJob[] = [...JOBS, { ...JOBS[0], id: 'job-2' }]
    listJobs.mockResolvedValue(JOBS2)

    await act(async () => {
      await result.current.refresh()
    })

    expect(listJobs).toHaveBeenCalledTimes(2)
    expect(listMergeCandidates).toHaveBeenCalledTimes(2)
    expect(result.current.jobs).toEqual(JOBS2)
    expect(result.current.isSettled).toBe(true)
  })

  it('does NOT reset isSettled to false while refetching (screen keeps showing data)', async () => {
    const { result } = renderHook(() => useSyncData())
    await waitFor(() => expect(result.current.isSettled).toBe(true))

    const j = deferred<ImportJob[]>()
    listJobs.mockReturnValue(j.promise) // jobs stays pending; candidates resolve

    let refreshPromise!: Promise<void>
    await act(async () => {
      refreshPromise = result.current.refresh()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.isSettled).toBe(true)

    await act(async () => {
      j.resolve(JOBS)
      await refreshPromise
    })
    expect(result.current.isSettled).toBe(true)
  })
})

describe('useSyncData — unmount before resolution', () => {
  it('unmounting before the fetches resolve settles cleanly — no throw / no unhandled rejection', async () => {
    // HONEST oracle (mirrors useRegistryData): under React 18.3.1 post-unmount
    // setState is a SILENT no-op, so the isActiveRef guard has no observable R18
    // signal — this asserts the ACHIEVABLE guarantee: resolving after unmount
    // settles cleanly (no throw, no unhandled rejection). The console.error spy is
    // a SECONDARY guard (future React reinstating the warning, or a real throw).
    const j = deferred<ImportJob[]>()
    const c = deferred<ImportMergeCandidate[]>()
    listJobs.mockReturnValue(j.promise)
    listMergeCandidates.mockReturnValue(c.promise)

    const rejections: unknown[] = []
    const onRejection = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', onRejection)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = renderHook(() => useSyncData())
    unmount()

    await act(async () => {
      j.resolve(JOBS)
      c.resolve(CANDIDATES)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(rejections).toEqual([])
    expect(errorSpy).not.toHaveBeenCalled()

    process.off('unhandledRejection', onRejection)
    errorSpy.mockRestore()
  })
})
