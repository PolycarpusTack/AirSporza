/**
 * useFmActionItems — FM Home's data hook (FM1-4-T1). Idiom mirrors
 * useSyncData v1 (quiet parallel fetch, isActive cleanup, isSettled
 * settle-vocabulary) — see that module for the reference shape this test
 * suite pins the SAME behavior against, narrowed/extended to THREE parallel
 * collections (weekly broadcast slots via a 7-day fan-out, PENDING ripple
 * proposals, the current user's resolutions) plus a `resolve()` optimistic
 * mutation. Real `deriveActionItems`/`detectCrewConflicts` are used
 * (un-mocked) — this suite proves the WIRING (fetch orchestration, week
 * scoping, resolution merge), not the derivation rules themselves (that's
 * fmActionItems.test.ts's job).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import type { Event } from '../../data/types'
import { makeEvent } from '../ops/__fixtures__/opsFixtureWeek'
import type { RippleProposal } from './fmActionItems'

// Wednesday inside the Mon 2026-08-10 .. Sun 2026-08-16 week; 14:00Z is 10:00
// local under the repo's America/New_York TZ pin (vitest.config.ts) — safely
// mid-day both sides, no local-vs-UTC day-shift risk.
const NOW = new Date('2026-08-12T14:00:00.000Z')
const WEEK_DATES = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16']

const EVENT = makeEvent({
  id: 1,
  competitionId: 10,
  startDateBE: '2026-08-12',
  startTimeBE: '18:00',
  participants: 'Team A vs Team B',
})

let appState: { events: Event[]; techPlans: unknown[]; crewFields: unknown[] }

vi.mock('../../context/AppProvider', () => ({
  useApp: () => appState,
}))

vi.mock('../ops/useContracts', () => ({
  useContracts: () => ({ contracts: [], isSettled: true }),
}))

const listSlots = vi.fn()
const listPending = vi.fn()
const listResolutions = vi.fn()
const resolveApi = vi.fn()

vi.mock('../../services', () => ({
  schedulesApi: { listSlots: (...args: unknown[]) => listSlots(...args) },
  rippleProposalsApi: { listPending: (...args: unknown[]) => listPending(...args) },
  fmActionItemsApi: {
    listResolutions: (...args: unknown[]) => listResolutions(...args),
    resolve: (...args: unknown[]) => resolveApi(...args),
  },
}))

const toastError = vi.fn()
vi.mock('../Toast', () => ({
  useToast: () => ({ error: toastError, success: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

import { useFmActionItems } from './useFmActionItems'

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
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)

  appState = { events: [EVENT], techPlans: [], crewFields: [] }
  listSlots.mockReset().mockResolvedValue([])
  listPending.mockReset().mockResolvedValue({ proposals: [], nextCursor: null, hasMore: false })
  listResolutions.mockReset().mockResolvedValue({ itemKeys: [] })
  resolveApi.mockReset().mockResolvedValue({ resolvedAt: '2026-08-12T14:00:00.000Z' })
  toastError.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useFmActionItems — mount fetch orchestration', () => {
  it('fans broadcast slots out across the 7 days of the current week, in parallel', () => {
    renderHook(() => useFmActionItems())

    expect(listSlots).toHaveBeenCalledTimes(7)
    expect(listSlots.mock.calls.map((c) => c[0])).toEqual(WEEK_DATES.map((date) => ({ date })))
  })

  it('fetches PENDING ripple proposals and the current user resolutions once each', () => {
    renderHook(() => useFmActionItems())

    expect(listPending).toHaveBeenCalledTimes(1)
    expect(listResolutions).toHaveBeenCalledTimes(1)
  })

  it('before any fetch resolves, isSettled is false (items may already be partially derived from sync AppProvider/useContracts data — only the fetched collections start empty)', () => {
    listSlots.mockReturnValue(new Promise(() => {}))
    listPending.mockReturnValue(new Promise(() => {}))
    listResolutions.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useFmActionItems())

    expect(result.current.isSettled).toBe(false)
    // No optimistic resolution can exist yet (resolvedKeys is still empty).
    expect(result.current.items.every((i) => i.resolved === false)).toBe(true)
  })

  it('settles once all three collections resolve, deriving items via the real fmActionItems v1 rules', async () => {
    const { result } = renderHook(() => useFmActionItems())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    const keys = result.current.items.map((i) => i.key).sort()
    // No contract for competitionId 10 -> RIGHTS MISSING; no channel/slot -> UNPLACED.
    expect(keys).toEqual(['RIGHTS:competition:10', 'UNPLACED:event:1'])
    expect(result.current.items.every((i) => i.resolved === false)).toBe(true)
  })

  it('exposes weekEvents (events filtered to the Mon..Sun week) for the EVENTS THIS WEEK KPI tile', async () => {
    appState.events = [
      EVENT,
      makeEvent({ id: 2, competitionId: 20, startDateBE: '2026-08-01', startTimeBE: '18:00', participants: 'Outside week' }),
    ]
    const { result } = renderHook(() => useFmActionItems())
    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.weekEvents.map((e) => e.id)).toEqual([1])
  })

  it('excludes events outside the current week from derivation (Home is week-scoped)', async () => {
    appState.events = [
      EVENT,
      makeEvent({ id: 2, competitionId: 20, startDateBE: '2026-08-01', startTimeBE: '18:00', participants: 'Outside week' }),
    ]
    const { result } = renderHook(() => useFmActionItems())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.items.some((i) => i.key.includes('event:2') || i.key.includes('competition:20'))).toBe(false)
  })
})

describe('useFmActionItems — quiet failure (FM1-3 AC: partial data beats no data)', () => {
  it('a rejected ripple-proposals fetch omits FEED items but still settles with CONFLICT/RIGHTS/UNPLACED/CREW derived', async () => {
    listPending.mockReset().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useFmActionItems())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.items.some((i) => i.kind === 'FEED')).toBe(false)
    expect(result.current.items.some((i) => i.kind === 'RIGHTS')).toBe(true)
  })

  it('one failing day in the broadcast-slots fan-out does not blank the whole week (other days still merged)', async () => {
    listSlots.mockReset().mockImplementation(({ date }: { date: string }) => {
      if (date === '2026-08-12') return Promise.reject(new Error('one bad day'))
      // A slot present for 2026-08-13 on channel-less event's day would flip
      // UNPLACED off for that event; here we just prove the OTHER 6 calls'
      // results are honored (settles cleanly, no throw) even though the
      // matching day rejected.
      return Promise.resolve([])
    })
    const { result } = renderHook(() => useFmActionItems())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.items.some((i) => i.key === 'UNPLACED:event:1')).toBe(true)
  })

  it('a rejected resolutions fetch still settles, with items un-resolved (no crash)', async () => {
    listResolutions.mockReset().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useFmActionItems())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.items.every((i) => i.resolved === false)).toBe(true)
  })
})

describe('useFmActionItems — resolution merge', () => {
  it('an item whose key is in the fetched resolutions renders resolved: true', async () => {
    listResolutions.mockReset().mockResolvedValue({ itemKeys: ['UNPLACED:event:1'] })
    const { result } = renderHook(() => useFmActionItems())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    const unplaced = result.current.items.find((i) => i.key === 'UNPLACED:event:1')
    expect(unplaced?.resolved).toBe(true)
    const rights = result.current.items.find((i) => i.key === 'RIGHTS:competition:10')
    expect(rights?.resolved).toBe(false)
  })
})

describe('useFmActionItems — FEED items from PENDING ripple proposals', () => {
  it('maps a PENDING proposal for a known event into a FEED item', async () => {
    const proposal: RippleProposal = {
      id: 'p-1',
      tenantId: 't-1',
      eventId: 1,
      source: 'FEED',
      sourceChangeId: 'feed:1:a',
      status: 'PENDING',
      beforeSlots: [],
      preview: {},
      confidence: null,
      createdAt: '2026-08-12T00:00:00.000Z',
      decidedAt: null,
      decidedBy: null,
      rationale: null,
    }
    listPending.mockReset().mockResolvedValue({ proposals: [proposal], nextCursor: null, hasMore: false })
    const { result } = renderHook(() => useFmActionItems())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.items.some((i) => i.kind === 'FEED' && i.key === 'FEED:proposal:p-1')).toBe(true)
  })
})

describe('useFmActionItems — resolve() optimistic update + revert', () => {
  it('marks the item resolved immediately (before the POST resolves)', async () => {
    const { result } = renderHook(() => useFmActionItems())
    await waitFor(() => expect(result.current.isSettled).toBe(true))

    const pending = deferred<{ resolvedAt: string }>()
    resolveApi.mockReturnValue(pending.promise)

    act(() => {
      void result.current.resolve('UNPLACED:event:1')
    })

    expect(result.current.items.find((i) => i.key === 'UNPLACED:event:1')?.resolved).toBe(true)

    await act(async () => {
      pending.resolve({ resolvedAt: '2026-08-12T14:00:00.000Z' })
      await Promise.resolve()
    })
    expect(result.current.items.find((i) => i.key === 'UNPLACED:event:1')?.resolved).toBe(true)
  })

  it('posts the itemKey to fmActionItemsApi.resolve', async () => {
    const { result } = renderHook(() => useFmActionItems())
    await waitFor(() => expect(result.current.isSettled).toBe(true))

    await act(async () => {
      await result.current.resolve('UNPLACED:event:1')
    })

    expect(resolveApi).toHaveBeenCalledWith('UNPLACED:event:1')
  })

  it('reverts the optimistic dim and surfaces a toast when the POST fails', async () => {
    const { result } = renderHook(() => useFmActionItems())
    await waitFor(() => expect(result.current.isSettled).toBe(true))

    resolveApi.mockReset().mockRejectedValue(new Error('network down'))

    await act(async () => {
      await result.current.resolve('UNPLACED:event:1')
    })

    expect(result.current.items.find((i) => i.key === 'UNPLACED:event:1')?.resolved).toBe(false)
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it('does NOT revert an item that was ALREADY resolved before this call, even if the POST fails (idempotent re-resolve of a confirmed item)', async () => {
    listResolutions.mockReset().mockResolvedValue({ itemKeys: ['UNPLACED:event:1'] })
    const { result } = renderHook(() => useFmActionItems())
    await waitFor(() => expect(result.current.isSettled).toBe(true))
    expect(result.current.items.find((i) => i.key === 'UNPLACED:event:1')?.resolved).toBe(true)

    resolveApi.mockReset().mockRejectedValue(new Error('network down'))
    await act(async () => {
      await result.current.resolve('UNPLACED:event:1')
    })

    expect(result.current.items.find((i) => i.key === 'UNPLACED:event:1')?.resolved).toBe(true)
  })
})

describe('useFmActionItems — refresh()', () => {
  it('refetches all three collections', async () => {
    const { result } = renderHook(() => useFmActionItems())
    await waitFor(() => expect(result.current.isSettled).toBe(true))
    expect(listSlots).toHaveBeenCalledTimes(7)

    await act(async () => {
      await result.current.refresh()
    })

    expect(listSlots).toHaveBeenCalledTimes(14)
    expect(listPending).toHaveBeenCalledTimes(2)
    expect(listResolutions).toHaveBeenCalledTimes(2)
  })
})
