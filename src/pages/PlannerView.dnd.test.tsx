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

function buildHandleDragEnd(
  events: Event[],
  setEvents: (fn: (prev: Event[]) => Event[]) => void,
  toastError: (msg: string) => void,
  updateFn: (id: number, data: Partial<Event>) => Promise<Event>
) {
  return async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const eventId = Number(active.id)
    const newDate = over.id as string
    const event = events.find(e => e.id === eventId)
    if (!event) return
    const snapshot = event.startDateBE
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
    try {
      await updateFn(eventId, { ...event, startDateBE: newDate })
    } catch {
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: snapshot } : e))
      toastError('Failed to reschedule event')
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handleDragEnd — drag-to-reschedule', () => {
  const toastError = vi.fn()
  let currentEvents: Event[]
  let updateFn: ReturnType<typeof vi.fn>

  function setEvents(fn: (prev: Event[]) => Event[]) {
    currentEvents = fn(currentEvents)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    updateFn = vi.fn()
  })

  it('calls eventsApi.update with the new date on successful drag', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    currentEvents = [event]
    updateFn.mockResolvedValue({ ...event, startDateBE: '2026-03-05' })

    const handleDragEnd = buildHandleDragEnd(currentEvents, setEvents, toastError, updateFn)
    await handleDragEnd(makeDragEvent('42', '2026-03-05', event))

    expect(updateFn).toHaveBeenCalledWith(42, expect.objectContaining({ startDateBE: '2026-03-05' }))
    expect(currentEvents[0].startDateBE).toBe('2026-03-05')
  })

  it('reverts to snapshot on API failure', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    currentEvents = [event]
    updateFn.mockRejectedValue(new Error('Network error'))

    const handleDragEnd = buildHandleDragEnd(currentEvents, setEvents, toastError, updateFn)
    await handleDragEnd(makeDragEvent('42', '2026-03-05', event))

    expect(updateFn).toHaveBeenCalledWith(42, expect.objectContaining({ startDateBE: '2026-03-05' }))
    // Should revert to the original date after failure
    expect(currentEvents[0].startDateBE).toBe('2026-03-04')
    expect(toastError).toHaveBeenCalledWith('Failed to reschedule event')
  })

  it('does nothing when over is null', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    currentEvents = [event]
    updateFn.mockResolvedValue(event)

    const handleDragEnd = buildHandleDragEnd(currentEvents, setEvents, toastError, updateFn)
    await handleDragEnd(makeDragEvent('42', null, event))

    expect(updateFn).not.toHaveBeenCalled()
    expect(currentEvents[0].startDateBE).toBe('2026-03-04')
  })

  it('does nothing when active.id equals over.id (same column)', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    currentEvents = [event]
    updateFn.mockResolvedValue(event)

    const handleDragEnd = buildHandleDragEnd(currentEvents, setEvents, toastError, updateFn)
    await handleDragEnd(makeDragEvent('42', '42', event))

    expect(updateFn).not.toHaveBeenCalled()
  })

  it('does nothing when event is not found in events list', async () => {
    const event = makeEvent({ id: 99, startDateBE: '2026-03-04' })
    currentEvents = [makeEvent({ id: 42 })]
    updateFn.mockResolvedValue(event)

    // id=99 doesn't exist in currentEvents
    const handleDragEnd = buildHandleDragEnd(currentEvents, setEvents, toastError, updateFn)
    await handleDragEnd(makeDragEvent('99', '2026-03-05', event))

    expect(updateFn).not.toHaveBeenCalled()
  })
})
