/**
 * useScheduleSuggestions fetch/wiring tests (FM2-1-T2). Mirrors useContracts's
 * own quiet-fetch test posture (mount fetch, quiet failure, isActive
 * cleanup) plus the week-scoped refetch/refresh() behavior this hook adds.
 * `api.get` (src/utils/api.ts) is mocked — this suite proves THIS hook's
 * fetch/state contract, not the real HTTP layer.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
vi.mock('../../utils/api', () => ({
  api: { get: (...args: unknown[]) => getMock(...args) },
}))

import { useScheduleSuggestions } from './useScheduleSuggestions'

const RESPONSE = {
  week: '2026-03-02',
  unplaced: [
    { eventId: 1, candidates: [{ channelId: 10, channelName: 'Eén', channelLoad: 2 }] },
    { eventId: 2, candidates: [] },
  ],
}

beforeEach(() => {
  getMock.mockReset()
})

afterEach(() => cleanup())

describe('mount fetch', () => {
  it('calls GET /schedule/suggestions?week=<week> and hydrates unplaced', async () => {
    getMock.mockResolvedValue(RESPONSE)

    const { result } = renderHook(() => useScheduleSuggestions('2026-03-02'))

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(getMock).toHaveBeenCalledWith('/schedule/suggestions?week=2026-03-02')
    expect(result.current.unplaced).toEqual(RESPONSE.unplaced)
  })

  it('quiet failure: isSettled flips true, unplaced stays []', async () => {
    getMock.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useScheduleSuggestions('2026-03-02'))

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.unplaced).toEqual([])
  })

  it('refetches when `week` changes', async () => {
    getMock.mockResolvedValue(RESPONSE)

    const { result, rerender } = renderHook(({ week }) => useScheduleSuggestions(week), {
      initialProps: { week: '2026-03-02' },
    })

    await waitFor(() => expect(result.current.isSettled).toBe(true))
    expect(getMock).toHaveBeenCalledTimes(1)

    rerender({ week: '2026-03-09' })

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2))
    expect(getMock).toHaveBeenLastCalledWith('/schedule/suggestions?week=2026-03-09')
  })
})

describe('refresh', () => {
  it('re-fetches the current week on demand', async () => {
    getMock.mockResolvedValue(RESPONSE)
    const { result } = renderHook(() => useScheduleSuggestions('2026-03-02'))
    await waitFor(() => expect(result.current.isSettled).toBe(true))
    getMock.mockClear()

    const updated = { week: '2026-03-02', unplaced: [] }
    getMock.mockResolvedValue(updated)

    await act(async () => {
      await result.current.refresh()
    })

    expect(getMock).toHaveBeenCalledWith('/schedule/suggestions?week=2026-03-02')
    expect(result.current.unplaced).toEqual([])
  })
})
