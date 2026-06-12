/**
 * Quality-pass fix on TD-18: confirmation is keyed to the exact warning set
 * the user saw — a stale or unrelated confirmation never auto-passes fresh
 * warnings, and an 'unavailable' confirm covers only the unavailable state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const checkMock = vi.fn()
vi.mock('../../../services/conflicts', () => ({
  conflictsApi: { check: (...args: unknown[]) => checkMock(...args) },
}))

import { useConflictCheck } from './useConflictCheck'

const PARAMS = {
  competitionId: 1,
  startDateBE: '2026-06-12',
  startTimeBE: '20:00',
}

const overlap = { type: 'channel_overlap', message: 'Overlaps with Event X' }
const rights = { type: 'rights_window', message: 'Outside rights window' }

beforeEach(() => checkMock.mockReset())

describe('useConflictCheck signature-based confirmation', () => {
  it('same warnings: blocked then pass on explicit re-save', async () => {
    checkMock.mockResolvedValue({ warnings: [overlap], errors: [] })
    const { result } = renderHook(() => useConflictCheck())

    await act(async () => expect(await result.current.checkOrConfirm(PARAMS)).toBe('blocked'))
    await act(async () => expect(await result.current.checkOrConfirm(PARAMS)).toBe('pass'))
  })

  it('changed warnings re-block: a confirmation never covers warnings the user did not see', async () => {
    checkMock.mockResolvedValueOnce({ warnings: [overlap], errors: [] })
    const { result } = renderHook(() => useConflictCheck())
    await act(async () => expect(await result.current.checkOrConfirm(PARAMS)).toBe('blocked'))

    checkMock.mockResolvedValueOnce({ warnings: [overlap, rights], errors: [] })
    await act(async () => expect(await result.current.checkOrConfirm(PARAMS)).toBe('blocked'))
  })

  it('a clean prior check does not pre-confirm later warnings', async () => {
    checkMock.mockResolvedValueOnce({ warnings: [], errors: [] })
    const { result } = renderHook(() => useConflictCheck())
    await act(async () => expect(await result.current.checkOrConfirm(PARAMS)).toBe('pass'))

    checkMock.mockResolvedValueOnce({ warnings: [overlap], errors: [] })
    await act(async () => expect(await result.current.checkOrConfirm(PARAMS)).toBe('blocked'))
  })

  it("confirming 'unavailable' does not pass real warnings that appear when the API recovers", async () => {
    checkMock.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useConflictCheck())
    await act(async () => expect(await result.current.checkOrConfirm(PARAMS)).toBe('unavailable'))

    // API recovers WITH real warnings — must block, not auto-pass
    checkMock.mockResolvedValueOnce({ warnings: [overlap], errors: [] })
    await act(async () => expect(await result.current.checkOrConfirm(PARAMS)).toBe('blocked'))
  })

  it("repeated 'unavailable' passes on the explicit second save (TD-18 confirm flow)", async () => {
    checkMock
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useConflictCheck())
    let first = '', second = ''
    await act(async () => { first = await result.current.checkOrConfirm(PARAMS) })
    await act(async () => { second = await result.current.checkOrConfirm(PARAMS) })
    expect(first).toBe('unavailable')
    expect(second).toBe('pass')
  })

  it('reset clears the pending confirmation', async () => {
    checkMock.mockResolvedValue({ warnings: [overlap], errors: [] })
    const { result } = renderHook(() => useConflictCheck())
    await act(async () => expect(await result.current.checkOrConfirm(PARAMS)).toBe('blocked'))
    act(() => result.current.reset())
    await act(async () => expect(await result.current.checkOrConfirm(PARAMS)).toBe('blocked'))
  })
})
