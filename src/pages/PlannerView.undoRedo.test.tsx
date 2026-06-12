/**
 * Characterization tests for PlannerView's undo logic (B-3-T3).
 *
 * These tests PIN current behavior — they are not a spec of desired behavior.
 *
 * Architecture note (finding for EPIC C): PlannerView has NO undo/redo history
 * stack. "Undo" is a single-slot, single-level affordance:
 *   - `lastDragRef` (PlannerView.tsx:57-63) holds AT MOST ONE pending undo
 *     (the most recent successful drag: date move, time move, or resize).
 *   - There is NO redo: undoing clears the slot; nothing can reapply the change.
 *   - History bounds: depth 1 — every new drag overwrites the slot.
 *   - Interleaved-edit invalidation: dismissing the bar (button or 5s
 *     auto-dismiss in UndoBar.tsx:10-13) destroys the undo info; deleting the
 *     event makes undo a silent no-op.
 *
 * The handlers (handleDragEnd, handleVerticalDragComplete, handleUndoDrag,
 * dismissUndoBar) are inline useCallbacks — not exported and not extractable
 * read-only. So this suite renders the REAL PlannerView with heavy children
 * mocked, and drives the real handlers through:
 *   - the captured `onDragEnd` prop of the mocked DndContext (horizontal drag)
 *   - the captured `onVerticalDragComplete` prop of the mocked CalendarGrid
 *   - the REAL UndoBar (clicking its Undo button / its auto-dismiss timer)
 * Unlike PlannerView.dnd.test.tsx (which replicates handler logic in-test),
 * these tests fail if the src logic changes — a true safety net for TD-3.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { PlannerView } from './PlannerView'
import { eventsApi } from '../services'
import type { Event, DashboardWidget } from '../data/types'

// ── Hoisted shared state for mock factories ──────────────────────────────────

const H = vi.hoisted(() => ({
  initialEvents: [] as unknown[],
  latest: {
    events: [] as unknown[],
    setEvents: ((_u: unknown) => {}) as (updater: unknown) => void,
  },
  applyOptimistic: vi.fn(),
  revertOptimistic: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  confirm: vi.fn(async () => true),
  grid: { props: null as Record<string, unknown> | null },
  dnd: { onDragEnd: null as unknown },
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

// lucide-react is a huge icon barrel pulled in transitively — proxy-mock it to
// keep collection fast (same trick as DynamicEventForm.test.tsx).
vi.mock('lucide-react', () => {
  const Icon = () => null
  return new Proxy(
    {},
    {
      get: (_target, prop) => (prop === 'then' ? undefined : Icon),
      has: () => true,
    },
  )
})

// Capture the real handleDragEnd that PlannerView wires into DndContext.
vi.mock('@dnd-kit/core', () => ({
  DndContext: (props: { children?: ReactNode; onDragEnd?: unknown }) => {
    H.dnd.onDragEnd = props.onDragEnd
    return <>{props.children}</>
  },
  PointerSensor: function PointerSensor() {},
  useSensor: () => ({}),
  useSensors: () => [],
}))

// Stateful useApp mock: real useState so setEvents() re-renders PlannerView,
// exactly like the AppProvider contract. apply/revertOptimistic are spies
// (no-ops) — base state is authoritative once setEvents confirms.
vi.mock('../context/AppProvider', async () => {
  const { useState } = await import('react')
  return {
    useApp: () => {
      const [events, setEvents] = useState(H.initialEvents)
      H.latest.events = events
      H.latest.setEvents = setEvents as (u: unknown) => void
      return {
        sports: [],
        competitions: [],
        techPlans: [],
        crewFields: [],
        orgConfig: { freezeWindowHours: 3 },
        events,
        setEvents,
        applyOptimisticEvent: H.applyOptimistic,
        revertOptimisticEvent: H.revertOptimistic,
      }
    },
  }
})

vi.mock('../hooks', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'planner' } }),
}))
vi.mock('../components/Toast', () => ({ useToast: () => H.toast }))
vi.mock('../components/ui', () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}))
vi.mock('../components/ui/ConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm: H.confirm, dialog: null }),
}))
vi.mock('../components/ui/ChannelSelect', () => ({
  useChannelLookup: () => ({ channels: [], getChannel: () => undefined }),
}))
vi.mock('../hooks/useEventActions', () => ({
  useEventActions: () => ({
    handleCtxStatusChange: vi.fn(),
    handleCtxDelete: vi.fn(),
    handleCtxDuplicate: vi.fn(),
    handleCtxPaste: vi.fn(),
    clipboardRef: { current: null },
  }),
}))
// Pin the visible week wide open so fixture events always pass the week filter.
vi.mock('../hooks/useCalendarNavigation', () => ({
  useCalendarNavigation: () => ({
    weekOffset: 0,
    setWeekOffset: vi.fn(),
    calendarMode: true,
    setCalendarMode: vi.fn(),
    savedViews: [],
    saveViewName: '',
    setSaveViewName: vi.fn(),
    showSaveInput: false,
    setShowSaveInput: vi.fn(),
    monday: new Date('2027-06-28T00:00:00'),
    weekFromStr: '2000-01-01',
    weekToStr: '2099-12-31',
    weekDays: [],
    todayStr: '2027-07-01',
    weekLabel: 'test week',
    currentWeekValue: '2027-W26',
    handleSaveView: vi.fn(),
    handleLoadView: vi.fn(),
    handleDeleteView: vi.fn(),
    handleWeekPickerChange: vi.fn(),
  }),
}))
vi.mock('../services', () => ({
  eventsApi: {
    update: vi.fn(),
    checkBulkConflicts: vi.fn(async () => ({})),
    list: vi.fn(async () => []),
    bulkDelete: vi.fn(),
    bulkStatus: vi.fn(),
    bulkReschedule: vi.fn(),
    bulkAssign: vi.fn(),
  },
}))
vi.mock('../services/contracts', () => ({
  contractsApi: { list: vi.fn(async () => []) },
}))
// Heavy children — stubbed. CalendarGrid captures props so tests can invoke
// the real onVerticalDragComplete handler.
vi.mock('../components/planner/CalendarGrid', () => ({
  CalendarGrid: (props: Record<string, unknown>) => {
    H.grid.props = props
    return null
  },
}))
vi.mock('../components/planner/BulkActionBar', () => ({ BulkActionBar: () => null }))
vi.mock('../components/planner/EventDetailPanel', () => ({ EventDetailPanel: () => null }))
vi.mock('../components/planner/ContextMenu', () => ({ ContextMenu: () => null }))
vi.mock('../components/planner/DuplicatePopover', () => ({ DuplicatePopover: () => null }))
vi.mock('../components/planner/EventCard', () => ({ SkeletonCard: () => null }))
// NOTE: UndoBar is deliberately NOT mocked — it is part of the unit under test.

// ── Fixtures & helpers ────────────────────────────────────────────────────────

const update = vi.mocked(eventsApi.update)

const WIDGETS: DashboardWidget[] = [
  { id: 'channelTimeline', label: 'Timeline', visible: true, order: 0 },
]

/** Far-future draft event — outside the freeze window, so never locked. */
function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    sportId: 1,
    competitionId: 1,
    participants: 'Team A vs Team B',
    startDateBE: '2027-07-01',
    startTimeBE: '10:00',
    duration: '01:30:00;00',
    isLive: false,
    isDelayedLive: false,
    customFields: {},
    status: 'draft',
    ...overrides,
  }
}

const appEvents = () => H.latest.events as Event[]
const eventById = (id: number) => {
  const found = appEvents().find(e => e.id === id)
  if (!found) throw new Error(`event ${id} not in app state`)
  return found
}
const setAppEvents = (updater: (prev: Event[]) => Event[]) =>
  (H.latest.setEvents as (u: (prev: Event[]) => Event[]) => void)(updater)

async function renderPlanner(events: Event[]) {
  H.initialEvents = events
  const view = render(<PlannerView widgets={WIDGETS} />)
  // Flush mount-time effects (contractsApi.list, checkBulkConflicts)
  await act(async () => {})
  return view
}

/** Drive the real handleDragEnd captured from the mocked DndContext. */
async function dragEventTo(eventId: number, date: string) {
  const onDragEnd = H.dnd.onDragEnd as (e: {
    active: { id: string }
    over: { id: string } | null
  }) => Promise<void>
  await act(async () => {
    await onDragEnd({ active: { id: String(eventId) }, over: { id: date } })
  })
}

/** Drive the real handleVerticalDragComplete captured from CalendarGrid props. */
async function verticalDrag(result: { eventId: number; newStartMin: number; newDurationMin: number }) {
  const fn = H.grid.props?.onVerticalDragComplete as (r: unknown) => Promise<void>
  await act(async () => {
    await fn(result)
  })
}

const undoButton = () => screen.queryByRole('button', { name: 'Undo' })

async function clickUndo() {
  const btn = undoButton()
  if (!btn) throw new Error('Undo bar is not visible')
  await act(async () => {
    fireEvent.click(btn)
  })
  // Flush the conflict-refetch effect triggered by the state change
  await act(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  update.mockImplementation(async (_id, data) => data as Event)
  H.grid.props = null
  H.dnd.onDragEnd = null
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ── Horizontal drag (date move) ───────────────────────────────────────────────

describe('PlannerView undo — horizontal drag (date move)', () => {
  it('successful drag updates the event date and arms the undo bar', async () => {
    await renderPlanner([makeEvent()])

    await dragEventTo(1, '2027-07-02')

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ startDateBE: '2027-07-02' }))
    expect(eventById(1).startDateBE).toBe('2027-07-02')
    // Optimistic patch applied, then cleared after the base state was confirmed
    expect(H.applyOptimistic).toHaveBeenCalledWith({ id: 1, startDateBE: '2027-07-02' })
    expect(H.revertOptimistic).toHaveBeenCalledWith(1)
    // Undo bar shows the localized "Moved to <day>" message
    expect(screen.getByText(/^Moved to /)).toBeInTheDocument()
    expect(undoButton()).toBeInTheDocument()
  })

  it('clicking Undo restores the previous date via the API and dismisses the bar', async () => {
    await renderPlanner([makeEvent()])
    await dragEventTo(1, '2027-07-02')

    await clickUndo()

    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenLastCalledWith(1, expect.objectContaining({ startDateBE: '2027-07-01' }))
    expect(eventById(1).startDateBE).toBe('2027-07-01')
    expect(undoButton()).toBeNull()
  })

  it('PINNED: there is no redo — after undo, nothing can reapply the change', async () => {
    await renderPlanner([makeEvent()])
    await dragEventTo(1, '2027-07-02')
    await clickUndo()

    // The undo bar (the only undo/redo affordance) is gone; the slot is consumed.
    expect(undoButton()).toBeNull()
    expect(screen.queryByText(/^Moved to /)).toBeNull()
    expect(update).toHaveBeenCalledTimes(2) // drag + undo, nothing else possible
    expect(eventById(1).startDateBE).toBe('2027-07-01')
  })

  it('same-day drop is a no-op: no API call, no undo bar', async () => {
    await renderPlanner([makeEvent()])

    await dragEventTo(1, '2027-07-01')

    expect(update).not.toHaveBeenCalled()
    expect(undoButton()).toBeNull()
  })

  it('failed drag reverts optimistically, shows an error toast, and arms no undo', async () => {
    await renderPlanner([makeEvent()])
    update.mockRejectedValueOnce(new Error('Network error'))

    await dragEventTo(1, '2027-07-02')

    expect(eventById(1).startDateBE).toBe('2027-07-01') // base state never changed
    expect(H.revertOptimistic).toHaveBeenCalledWith(1)
    expect(H.toast.error).toHaveBeenCalledWith('Failed to reschedule event')
    expect(undoButton()).toBeNull()
  })

  it('PINNED: history depth is 1 — a second drag of the same event overwrites the undo slot', async () => {
    await renderPlanner([makeEvent()])

    await dragEventTo(1, '2027-07-02')
    await dragEventTo(1, '2027-07-03')
    await clickUndo()

    // Undo restores the INTERMEDIATE date, not the original
    expect(update).toHaveBeenLastCalledWith(1, expect.objectContaining({ startDateBE: '2027-07-02' }))
    expect(eventById(1).startDateBE).toBe('2027-07-02')
    // The original 2027-07-01 is unreachable — only one undo level exists
    expect(undoButton()).toBeNull()
  })

  it('PINNED: a drag on another event replaces the pending undo (interleaved-edit invalidation)', async () => {
    await renderPlanner([makeEvent({ id: 1 }), makeEvent({ id: 2, startDateBE: '2027-07-05' })])

    await dragEventTo(1, '2027-07-02')
    await dragEventTo(2, '2027-07-06')

    // Only one undo bar exists; it now belongs to event 2
    expect(screen.getAllByText(/^Moved to /)).toHaveLength(1)
    await clickUndo()

    expect(update).toHaveBeenLastCalledWith(2, expect.objectContaining({ startDateBE: '2027-07-05' }))
    expect(eventById(2).startDateBE).toBe('2027-07-05') // reverted
    expect(eventById(1).startDateBE).toBe('2027-07-02') // first drag is now permanent
  })

  it('PINNED: undo after the event disappears is a silent no-op (no API call, no error)', async () => {
    await renderPlanner([makeEvent()])
    await dragEventTo(1, '2027-07-02')

    // Interleaved edit: the event is removed (e.g. delete/socket) before undo
    await act(async () => {
      setAppEvents(prev => prev.filter(e => e.id !== 1))
    })

    await clickUndo()

    expect(update).toHaveBeenCalledTimes(1) // only the original drag
    expect(H.toast.error).not.toHaveBeenCalled()
    expect(undoButton()).toBeNull() // bar dismissed regardless
  })

  // TD-19 fix (C-3): a failed undo now KEEPS the pending undo — the bar stays
  // visible and a second click retries (was: slot consumed pre-API, no retry).
  it('failed undo keeps the bar and retries on a second click', async () => {
    await renderPlanner([makeEvent()])
    await dragEventTo(1, '2027-07-02')
    update.mockRejectedValueOnce(new Error('Network error'))

    await clickUndo()

    expect(H.toast.error).toHaveBeenCalledWith('Undo failed — try again or dismiss')
    expect(H.revertOptimistic).toHaveBeenLastCalledWith(1)
    expect(eventById(1).startDateBE).toBe('2027-07-02') // change stands for now
    expect(undoButton()).not.toBeNull() // bar persists — retry available

    await clickUndo() // retry succeeds (default mock resolves)
    expect(update).toHaveBeenCalledTimes(3)
    expect(eventById(1).startDateBE).toBe('2027-07-01')
    expect(undoButton()).toBeNull() // consumed on success
  })
})

// ── Vertical drag (time reschedule / resize) ──────────────────────────────────

describe('PlannerView undo — vertical drag (time/duration)', () => {
  it('time-only change arms undo with "Rescheduled to HH:MM"; undo restores startTimeBE', async () => {
    await renderPlanner([makeEvent()]) // 10:00, 90 min

    await verticalDrag({ eventId: 1, newStartMin: 720, newDurationMin: 90 })

    expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ startTimeBE: '12:00' }))
    expect(eventById(1).startTimeBE).toBe('12:00')
    expect(screen.getByText('Rescheduled to 12:00')).toBeInTheDocument()

    await clickUndo()

    expect(update).toHaveBeenLastCalledWith(1, expect.objectContaining({ startTimeBE: '10:00' }))
    expect(eventById(1).startTimeBE).toBe('10:00')
  })

  it('duration-only change arms undo with "Duration changed to Xh Ym"; undo restores duration', async () => {
    await renderPlanner([makeEvent()]) // 10:00, 01:30:00;00

    await verticalDrag({ eventId: 1, newStartMin: 600, newDurationMin: 120 })

    expect(eventById(1).duration).toBe('02:00:00;00')
    expect(screen.getByText('Duration changed to 2h 0m')).toBeInTheDocument()

    await clickUndo()

    expect(update).toHaveBeenLastCalledWith(1, expect.objectContaining({ duration: '01:30:00;00' }))
    expect(eventById(1).duration).toBe('01:30:00;00')
  })

  it('sub-hour duration label uses minutes only ("45m")', async () => {
    await renderPlanner([makeEvent()])

    await verticalDrag({ eventId: 1, newStartMin: 600, newDurationMin: 45 })

    expect(screen.getByText('Duration changed to 45m')).toBeInTheDocument()
  })

  it('PINNED: when both time and duration change, the message shows only the time; undo restores both', async () => {
    await renderPlanner([makeEvent()])

    await verticalDrag({ eventId: 1, newStartMin: 720, newDurationMin: 120 })

    expect(screen.getByText('Rescheduled to 12:00')).toBeInTheDocument()
    expect(eventById(1).startTimeBE).toBe('12:00')
    expect(eventById(1).duration).toBe('02:00:00;00')

    await clickUndo()

    expect(update).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ startTimeBE: '10:00', duration: '01:30:00;00' }),
    )
    expect(eventById(1).startTimeBE).toBe('10:00')
    expect(eventById(1).duration).toBe('01:30:00;00')
  })

  it('PINNED: linearStartTime takes precedence over startTimeBE for both change and undo', async () => {
    await renderPlanner([makeEvent({ linearStartTime: '11:00' })])

    await verticalDrag({ eventId: 1, newStartMin: 780, newDurationMin: 90 }) // 13:00

    expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ linearStartTime: '13:00' }))
    expect(eventById(1).linearStartTime).toBe('13:00')
    expect(eventById(1).startTimeBE).toBe('10:00') // untouched

    await clickUndo()

    expect(update).toHaveBeenLastCalledWith(1, expect.objectContaining({ linearStartTime: '11:00' }))
    expect(eventById(1).linearStartTime).toBe('11:00')
    expect(eventById(1).startTimeBE).toBe('10:00')
  })

  it('no-change vertical drag is a no-op: no API call, no undo bar', async () => {
    await renderPlanner([makeEvent()])

    await verticalDrag({ eventId: 1, newStartMin: 600, newDurationMin: 90 }) // 10:00 / 90min — unchanged

    expect(update).not.toHaveBeenCalled()
    expect(undoButton()).toBeNull()
  })
})

// ── UndoBar auto-dismiss ──────────────────────────────────────────────────────

describe('PlannerView undo — UndoBar auto-dismiss', () => {
  it('PINNED: the bar auto-dismisses after 5s, destroying the undo affordance', async () => {
    vi.useFakeTimers()
    await renderPlanner([makeEvent()])
    await dragEventTo(1, '2027-07-02')

    expect(undoButton()).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4999)
    })
    expect(undoButton()).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    // Bar gone — dismissUndoBar also nulled lastDragRef, so the move is final.
    expect(undoButton()).toBeNull()
    expect(eventById(1).startDateBE).toBe('2027-07-02')
    expect(update).toHaveBeenCalledTimes(1)
  })
})
