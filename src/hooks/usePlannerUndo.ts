import { useCallback, useRef, useState } from 'react'
import { eventsApi } from '../services'
import type { Event } from '../data/types'

/**
 * Single-slot undo for planner drag operations (extracted from PlannerView in
 * C-3 per the B-3-T3 PREP note; the undoRedo characterization suite is the net).
 * Design notes: one pending undo at a time, no redo, auto-dismiss handled by
 * the UndoBar component calling `dismiss`.
 */
export interface UndoSlot {
  eventId: number
  previousDate?: string // for horizontal drag
  previousTime?: string // for vertical drag (time reschedule)
  previousDuration?: string // for resize
}

interface UsePlannerUndoDeps {
  events: Event[]
  setEvents: (e: Event[] | ((prev: Event[]) => Event[])) => void
  applyOptimisticEvent: (patch: Partial<Event> & { id: number }) => void
  revertOptimisticEvent: (id: number) => void
  toast: { error: (msg: string) => void }
  /** TD-19 fix: undo must honor the same lock/freeze confirm flow as forward
   *  drags. Return false to abort (the pending undo is kept). */
  confirmMutate?: (ev: Event) => Promise<boolean>
}

export function usePlannerUndo({
  events,
  setEvents,
  applyOptimisticEvent,
  revertOptimisticEvent,
  toast,
  confirmMutate,
}: UsePlannerUndoDeps) {
  const slotRef = useRef<UndoSlot | null>(null)
  const [undoBar, setUndoBar] = useState<{ message: string } | null>(null)

  const armUndo = useCallback((slot: UndoSlot, message: string) => {
    slotRef.current = slot
    setUndoBar({ message })
  }, [])

  const handleUndo = useCallback(async () => {
    if (!slotRef.current) return
    const { eventId, previousDate, previousTime, previousDuration } = slotRef.current
    const ev = events.find(e => e.id === eventId)
    if (!ev) {
      // Event no longer exists — nothing to revert; drop the stale slot.
      slotRef.current = null
      setUndoBar(null)
      return
    }

    // TD-19 fix: locked/frozen events get the same override-confirm flow as a
    // forward drag. Declining keeps the pending undo (the user may dismiss it).
    if (confirmMutate && !(await confirmMutate(ev))) return

    // Build revert patch
    const patch: Partial<Event> = {}
    if (previousDate) patch.startDateBE = previousDate
    if (previousTime) {
      if (ev.linearStartTime) patch.linearStartTime = previousTime
      else patch.startTimeBE = previousTime
    }
    if (previousDuration) patch.duration = previousDuration

    applyOptimisticEvent({ id: eventId, ...patch })
    try {
      await eventsApi.update(eventId, { ...ev, ...patch })
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...patch } : e))
      revertOptimisticEvent(eventId)
      // TD-19 fix: consume the slot only on SUCCESS — a failed undo stays
      // retryable instead of silently standing (and no dangling no-op bar).
      slotRef.current = null
      setUndoBar(null)
    } catch {
      revertOptimisticEvent(eventId)
      toast.error('Undo failed — try again or dismiss')
    }
  }, [events, setEvents, toast, applyOptimisticEvent, revertOptimisticEvent, confirmMutate])

  const dismiss = useCallback(() => {
    setUndoBar(null)
    slotRef.current = null
  }, [])

  return { undoBar, armUndo, handleUndo, dismiss } as const
}
