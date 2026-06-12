/**
 * Desired-semantics tests for TD-19 (C-3 FEATURE):
 * - undo honors the same lock/confirm flow as forward drags (confirmMutate)
 * - a failed undo keeps the slot (retryable) instead of silently standing
 * - a successful undo consumes the slot and closes the bar
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const updateMock = vi.fn()
vi.mock('../services', () => ({
  eventsApi: { update: (...args: unknown[]) => updateMock(...args) },
}))

import { usePlannerUndo } from './usePlannerUndo'
import type { Event } from '../data/types'

const event: Event = {
  id: 7,
  sportId: 1,
  competitionId: 1,
  participants: 'A vs B',
  startDateBE: '2026-06-13',
  startTimeBE: '20:00',
  isLive: false,
  isDelayedLive: false,
  customFields: {},
  status: 'draft',
}

function setup(confirmMutate?: (ev: Event) => Promise<boolean>) {
  const setEvents = vi.fn()
  const applyOptimisticEvent = vi.fn()
  const revertOptimisticEvent = vi.fn()
  const toast = { error: vi.fn() }
  const hook = renderHook(() =>
    usePlannerUndo({ events: [event], setEvents, applyOptimisticEvent, revertOptimisticEvent, toast, confirmMutate })
  )
  return { hook, setEvents, applyOptimisticEvent, revertOptimisticEvent, toast }
}

beforeEach(() => updateMock.mockReset())

describe('usePlannerUndo (TD-19 semantics)', () => {
  it('declined confirmMutate aborts without an API call and KEEPS the pending undo', async () => {
    const confirmMutate = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    updateMock.mockResolvedValue({})
    const { hook } = setup(confirmMutate)

    act(() => hook.result.current.armUndo({ eventId: 7, previousDate: '2026-06-12' }, 'Moved'))
    await act(async () => hook.result.current.handleUndo())
    expect(confirmMutate).toHaveBeenCalledWith(event)
    expect(updateMock).not.toHaveBeenCalled()
    expect(hook.result.current.undoBar).not.toBeNull()

    // Second attempt, confirm accepted → proceeds
    await act(async () => hook.result.current.handleUndo())
    expect(updateMock).toHaveBeenCalledTimes(1)
  })

  it('a failed undo keeps the slot and bar — retry works', async () => {
    updateMock.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({})
    const { hook, toast, setEvents } = setup()

    act(() => hook.result.current.armUndo({ eventId: 7, previousDate: '2026-06-12' }, 'Moved'))
    await act(async () => hook.result.current.handleUndo())
    expect(toast.error).toHaveBeenCalled()
    expect(hook.result.current.undoBar).not.toBeNull()

    await act(async () => hook.result.current.handleUndo())
    expect(updateMock).toHaveBeenCalledTimes(2)
    expect(setEvents).toHaveBeenCalledTimes(1)
    expect(hook.result.current.undoBar).toBeNull()
  })

  it('a successful undo consumes the slot and closes the bar (no dangling no-op bar)', async () => {
    updateMock.mockResolvedValue({})
    const { hook } = setup()

    act(() => hook.result.current.armUndo({ eventId: 7, previousDate: '2026-06-12' }, 'Moved'))
    await act(async () => hook.result.current.handleUndo())
    expect(hook.result.current.undoBar).toBeNull()

    await act(async () => hook.result.current.handleUndo())
    expect(updateMock).toHaveBeenCalledTimes(1) // second click no-ops
  })

  it('a vanished event drops the stale slot and closes the bar without an API call', async () => {
    const { hook } = setup()
    act(() => hook.result.current.armUndo({ eventId: 999, previousDate: '2026-06-12' }, 'Moved'))
    await act(async () => hook.result.current.handleUndo())
    expect(updateMock).not.toHaveBeenCalled()
    expect(hook.result.current.undoBar).toBeNull()
  })
})
