/**
 * Unit tests for handleDragEnd — drag-to-reschedule logic in PlannerView.
 * Tests the handler logic in isolation without rendering the full component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DragEndEvent } from '@dnd-kit/core'
import type { Event } from '../data/types'

// Mock @dnd-kit/core — no-op stubs so the module resolves cleanly
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: unknown }) => children,
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    isDragging: false,
  }),
  useDroppable: () => ({
    setNodeRef: () => {},
    isOver: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => '' } },
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 42,
    sportId: 1,
    competitionId: 1,
    participants: 'Team A vs Team B',
    startDateBE: '2026-03-04',
    startTimeBE: '10:00',
    isLive: false,
    isDelayedLive: false,
    customFields: {},
    status: 'draft',
    ...overrides,
  }
}

function makeDragEvent(activeId: string, overId: string | null, event: Event): DragEndEvent {
  return {
    active: {
      id: activeId,
      data: { current: { event } },
      rect: { current: { initial: null, translated: null } },
    },
    over: overId
      ? {
          id: overId,
          data: { current: {} },
          rect: { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 },
          disabled: false,
        }
      : null,
    delta: { x: 0, y: 0 },
    activatorEvent: {} as Event,
    collisions: null,
  } as unknown as DragEndEvent
}

// ── Replicates handleDragEnd from PlannerView ─────────────────────────────────
//
// Accepts both setRealtimeEvents (local) and setGlobalEvents (AppProvider context)
// to mirror the two-phase optimistic update pattern.

function buildHandleDragEnd(
  events: Event[],
  setRealtimeEvents: (fn: (prev: Event[]) => Event[]) => void,
  setGlobalEvents: (fn: (prev: Event[]) => Event[]) => void,
  toastError: (msg: string) => void,
  updateFn: (id: number, data: Partial<Event>) => Promise<Event>
) {
  return async ({ active, over }: DragEndEvent) => {
    if (!over) return
    const eventId = Number(active.id)
    const newDate = over.id as string
    const event = events.find(e => e.id === eventId)
    if (!event) return
    const currentDateStr = typeof event.startDateBE === 'string'
      ? event.startDateBE.slice(0, 10)
      : (event.startDateBE as Date).toISOString().slice(0, 10)
    if (newDate === currentDateStr) return  // same day, no-op
    const snapshot = event.startDateBE
    // Optimistic: update local display only
    setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
    try {
      await updateFn(eventId, { ...event, startDateBE: newDate })
      // Confirm: update global context after API success
      setGlobalEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
    } catch {
      // Revert local only
      setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: snapshot } : e))
      toastError('Failed to reschedule event')
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handleDragEnd — drag-to-reschedule', () => {
  const toastError = vi.fn()
  let localEvents: Event[]
  let globalEvents: Event[]
  let updateFn: ReturnType<typeof vi.fn>

  function setRealtimeEvents(fn: (prev: Event[]) => Event[]) {
    localEvents = fn(localEvents)
  }

  function setGlobalEvents(fn: (prev: Event[]) => Event[]) {
    globalEvents = fn(globalEvents)
  }

  const setRealtimeEventsSpy = vi.fn(setRealtimeEvents)
  const setGlobalEventsSpy = vi.fn(setGlobalEvents)

  beforeEach(() => {
    vi.clearAllMocks()
    updateFn = vi.fn()
    // Reset spy implementations each time
    setRealtimeEventsSpy.mockImplementation(setRealtimeEvents)
    setGlobalEventsSpy.mockImplementation(setGlobalEvents)
  })

  it('on success: local state updates first, then global setEvents is called', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    localEvents = [event]
    globalEvents = [event]

    const callOrder: string[] = []
    const orderedSetRealtime = vi.fn((fn: (prev: Event[]) => Event[]) => {
      callOrder.push('setRealtimeEvents')
      localEvents = fn(localEvents)
    })
    const orderedSetGlobal = vi.fn((fn: (prev: Event[]) => Event[]) => {
      callOrder.push('setGlobalEvents')
      globalEvents = fn(globalEvents)
    })

    updateFn.mockResolvedValue({ ...event, startDateBE: '2026-03-05' })

    const handleDragEnd = buildHandleDragEnd(
      [event],
      orderedSetRealtime,
      orderedSetGlobal,
      toastError,
      updateFn
    )
    await handleDragEnd(makeDragEvent('42', '2026-03-05', event))

    expect(updateFn).toHaveBeenCalledWith(42, expect.objectContaining({ startDateBE: '2026-03-05' }))
    // Local update happens before global
    expect(callOrder).toEqual(['setRealtimeEvents', 'setGlobalEvents'])
    expect(localEvents[0].startDateBE).toBe('2026-03-05')
    expect(globalEvents[0].startDateBE).toBe('2026-03-05')
  })

  it('on failure: only setRealtimeEvents reverts — setGlobalEvents is never called', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    localEvents = [event]
    globalEvents = [event]

    const orderedSetRealtime = vi.fn((fn: (prev: Event[]) => Event[]) => {
      localEvents = fn(localEvents)
    })
    const orderedSetGlobal = vi.fn((fn: (prev: Event[]) => Event[]) => {
      globalEvents = fn(globalEvents)
    })

    updateFn.mockRejectedValue(new Error('Network error'))

    const handleDragEnd = buildHandleDragEnd(
      [event],
      orderedSetRealtime,
      orderedSetGlobal,
      toastError,
      updateFn
    )
    await handleDragEnd(makeDragEvent('42', '2026-03-05', event))

    expect(updateFn).toHaveBeenCalledWith(42, expect.objectContaining({ startDateBE: '2026-03-05' }))
    // setRealtimeEvents called twice: once for optimistic update, once for revert
    expect(orderedSetRealtime).toHaveBeenCalledTimes(2)
    // setGlobalEvents must NOT be called at all on failure
    expect(orderedSetGlobal).not.toHaveBeenCalled()
    // Local state reverted to original
    expect(localEvents[0].startDateBE).toBe('2026-03-04')
    // Global state unchanged
    expect(globalEvents[0].startDateBE).toBe('2026-03-04')
    expect(toastError).toHaveBeenCalledWith('Failed to reschedule event')
  })

  it('calls eventsApi.update with the new date on successful drag', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    localEvents = [event]
    globalEvents = [event]
    updateFn.mockResolvedValue({ ...event, startDateBE: '2026-03-05' })

    const handleDragEnd = buildHandleDragEnd(
      [event],
      setRealtimeEventsSpy,
      setGlobalEventsSpy,
      toastError,
      updateFn
    )
    await handleDragEnd(makeDragEvent('42', '2026-03-05', event))

    expect(updateFn).toHaveBeenCalledWith(42, expect.objectContaining({ startDateBE: '2026-03-05' }))
    expect(localEvents[0].startDateBE).toBe('2026-03-05')
  })

  it('reverts to snapshot on API failure', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    localEvents = [event]
    globalEvents = [event]
    updateFn.mockRejectedValue(new Error('Network error'))

    const handleDragEnd = buildHandleDragEnd(
      [event],
      setRealtimeEventsSpy,
      setGlobalEventsSpy,
      toastError,
      updateFn
    )
    await handleDragEnd(makeDragEvent('42', '2026-03-05', event))

    expect(updateFn).toHaveBeenCalledWith(42, expect.objectContaining({ startDateBE: '2026-03-05' }))
    // Should revert to the original date after failure
    expect(localEvents[0].startDateBE).toBe('2026-03-04')
    expect(toastError).toHaveBeenCalledWith('Failed to reschedule event')
  })

  it('does nothing when over is null', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    localEvents = [event]
    globalEvents = [event]
    updateFn.mockResolvedValue(event)

    const handleDragEnd = buildHandleDragEnd(
      [event],
      setRealtimeEventsSpy,
      setGlobalEventsSpy,
      toastError,
      updateFn
    )
    await handleDragEnd(makeDragEvent('42', null, event))

    expect(updateFn).not.toHaveBeenCalled()
    expect(localEvents[0].startDateBE).toBe('2026-03-04')
  })

  it('does nothing when dragged to the same date (same-day no-op)', async () => {
    // Event's startDateBE is '2026-03-04'; over.id is the same date string
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    localEvents = [event]
    globalEvents = [event]
    updateFn.mockResolvedValue(event)

    const handleDragEnd = buildHandleDragEnd(
      [event],
      setRealtimeEventsSpy,
      setGlobalEventsSpy,
      toastError,
      updateFn
    )
    await handleDragEnd(makeDragEvent('42', '2026-03-04', event))

    expect(updateFn).not.toHaveBeenCalled()
    expect(localEvents[0].startDateBE).toBe('2026-03-04')
  })

  it('does nothing when event is not found in events list', async () => {
    const event = makeEvent({ id: 99, startDateBE: '2026-03-04' })
    localEvents = [makeEvent({ id: 42 })]
    globalEvents = [makeEvent({ id: 42 })]
    updateFn.mockResolvedValue(event)

    // id=99 doesn't exist in localEvents
    const handleDragEnd = buildHandleDragEnd(
      localEvents,
      setRealtimeEventsSpy,
      setGlobalEventsSpy,
      toastError,
      updateFn
    )
    await handleDragEnd(makeDragEvent('99', '2026-03-05', event))

    expect(updateFn).not.toHaveBeenCalled()
  })
})

// ── Undo tests ─────────────────────────────────────────────────────────────

function buildHandleDragEndWithUndo(
  events: Event[],
  setRealtimeEvents: (fn: (prev: Event[]) => Event[]) => void,
  setGlobalEvents: (fn: (prev: Event[]) => Event[]) => void,
  toastError: (msg: string) => void,
  updateFn: (id: number, data: Partial<Event>) => Promise<Event>,
  onUndoReady: (eventId: number, previousDate: string, newDate: string) => void
) {
  return async ({ active, over }: DragEndEvent) => {
    if (!over) return
    const eventId = Number(active.id)
    const newDate = over.id as string
    const event = events.find(e => e.id === eventId)
    if (!event) return
    const currentDateStr = typeof event.startDateBE === 'string'
      ? event.startDateBE.slice(0, 10)
      : (event.startDateBE as Date).toISOString().slice(0, 10)
    if (newDate === currentDateStr) return
    const snapshot = event.startDateBE as string
    setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
    try {
      await updateFn(eventId, { ...event, startDateBE: newDate })
      setGlobalEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
      onUndoReady(eventId, snapshot, newDate)
    } catch {
      setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: snapshot } : e))
      toastError('Failed to reschedule event')
    }
  }
}

describe('handleDragEnd — undo callback', () => {
  const toastError = vi.fn()
  let localEvents: Event[]
  let globalEvents: Event[]
  let updateFn: ReturnType<typeof vi.fn>

  function setRealtimeEvents(fn: (prev: Event[]) => Event[]) {
    localEvents = fn(localEvents)
  }
  function setGlobalEvents(fn: (prev: Event[]) => Event[]) {
    globalEvents = fn(globalEvents)
  }

  const setRealtimeEventsSpy = vi.fn(setRealtimeEvents)
  const setGlobalEventsSpy = vi.fn(setGlobalEvents)

  beforeEach(() => {
    vi.clearAllMocks()
    updateFn = vi.fn()
    setRealtimeEventsSpy.mockImplementation(setRealtimeEvents)
    setGlobalEventsSpy.mockImplementation(setGlobalEvents)
  })

  it('calls onUndoReady with eventId and previousDate after successful drag', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    localEvents = [event]
    globalEvents = [event]
    updateFn.mockResolvedValue({ ...event, startDateBE: '2026-03-05' })

    const onUndoReady = vi.fn()
    const handleDragEnd = buildHandleDragEndWithUndo(
      [event], setRealtimeEventsSpy, setGlobalEventsSpy, toastError, updateFn, onUndoReady
    )
    await handleDragEnd(makeDragEvent('42', '2026-03-05', event))

    expect(onUndoReady).toHaveBeenCalledWith(42, '2026-03-04', '2026-03-05')
  })

  it('does not call onUndoReady on API failure', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    localEvents = [event]
    globalEvents = [event]
    updateFn.mockRejectedValue(new Error('Network error'))

    const onUndoReady = vi.fn()
    const handleDragEnd = buildHandleDragEndWithUndo(
      [event], setRealtimeEventsSpy, setGlobalEventsSpy, toastError, updateFn, onUndoReady
    )
    await handleDragEnd(makeDragEvent('42', '2026-03-05', event))

    expect(onUndoReady).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('Failed to reschedule event')
  })
})
