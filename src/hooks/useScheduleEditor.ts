import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { schedulesApi } from '../services/schedules'
import { useToast } from '../components/Toast'
import type { BroadcastSlot, ScheduleDraft } from '../data/types'
import { computeInverse } from './scheduleInverseOps'

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type ScheduleOperation =
  | { type: 'CREATE_SLOT'; data: Partial<BroadcastSlot> & { id: string; channelId: number; plannedStartUtc: string; plannedEndUtc: string } }
  | { type: 'UPDATE_SLOT'; slotId: string; changes: Partial<BroadcastSlot> }
  | { type: 'MOVE_SLOT'; slotId: string; newChannelId?: number; newStartUtc: string; newEndUtc: string }
  | { type: 'RESIZE_SLOT'; slotId: string; newEndUtc: string }
  | { type: 'DELETE_SLOT'; slotId: string }
  | { type: 'DUPLICATE_SLOT'; sourceSlotId: string; newChannelId: number; newStartUtc: string; newSlotId?: string }

export interface ValidationResult {
  severity: 'ERROR' | 'WARNING' | 'INFO'
  code: string
  scope: string[]
  message: string
  remediation?: string
}

/* ------------------------------------------------------------------ */
/*  Internal helpers — apply operations to slots (frontend-only)       */
/* ------------------------------------------------------------------ */

function applySingle(slots: BroadcastSlot[], op: ScheduleOperation): BroadcastSlot[] {
  switch (op.type) {
    case 'CREATE_SLOT':
      return [...slots, { ...op.data } as BroadcastSlot]

    case 'UPDATE_SLOT':
      return slots.map(s => s.id === op.slotId ? { ...s, ...op.changes } : s)

    case 'MOVE_SLOT':
      return slots.map(s => {
        if (s.id !== op.slotId) return s
        return {
          ...s,
          ...(op.newChannelId != null ? { channelId: op.newChannelId } : {}),
          plannedStartUtc: op.newStartUtc,
          plannedEndUtc: op.newEndUtc,
        }
      })

    case 'RESIZE_SLOT':
      return slots.map(s => s.id === op.slotId ? { ...s, plannedEndUtc: op.newEndUtc } : s)

    case 'DELETE_SLOT':
      return slots.filter(s => s.id !== op.slotId)

    case 'DUPLICATE_SLOT': {
      const source = slots.find(s => s.id === op.sourceSlotId)
      if (!source) return slots
      const durationMs = source.plannedEndUtc && source.plannedStartUtc
        ? new Date(source.plannedEndUtc).getTime() - new Date(source.plannedStartUtc).getTime()
        : 60 * 60 * 1000 // fallback 1h
      const newEnd = new Date(new Date(op.newStartUtc).getTime() + durationMs).toISOString()
      const dup: BroadcastSlot = {
        ...source,
        // Fall back to a timestamp-random id only if the caller didn't mint
        // one. `dispatchDuplicate()` below always supplies newSlotId so the
        // client-local id and the server row match (crucial for undo).
        id: op.newSlotId ?? `dup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        channelId: op.newChannelId,
        plannedStartUtc: op.newStartUtc,
        plannedEndUtc: newEnd,
      }
      return [...slots, dup]
    }

    default:
      return slots
  }
}

function applyAll(baseSlots: BroadcastSlot[], ops: ScheduleOperation[]): BroadcastSlot[] {
  return ops.reduce((acc, op) => applySingle(acc, op), baseSlots)
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

interface UndoEntry {
  forward: ScheduleOperation
  inverse: ScheduleOperation
}

export function useScheduleEditor(draft: ScheduleDraft | null, baseSlots: BroadcastSlot[]) {
  const toast = useToast()

  const [operations, setOperations] = useState<ScheduleOperation[]>([])
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [draftVersion, setDraftVersion] = useState<number>(draft?.version ?? 0)
  const [isStale, setIsStale] = useState(false)

  // Refs used by the async sync loop. Keeping the mutable draft version
  // in a ref means the loop reads the latest value each iteration instead
  // of closing over a stale copy.
  const draftVersionRef = useRef<number>(draft?.version ?? 0)
  const isSyncingRef = useRef(false)
  const syncQueueRef = useRef<ScheduleOperation[]>([])
  const isStaleRef = useRef(false)

  // Keep draftVersionRef in sync with the draftVersion state.
  useEffect(() => { draftVersionRef.current = draftVersion }, [draftVersion])

  // Derived: computed slots
  const computedSlots = useMemo(
    () => applyAll(baseSlots, operations),
    [baseSlots, operations],
  )

  // Derived: validation by slot
  const validationBySlot = useMemo(() => {
    const map: Record<string, ValidationResult[]> = {}
    for (const r of validationResults) {
      for (const slotId of r.scope) {
        if (!map[slotId]) map[slotId] = []
        map[slotId].push(r)
      }
    }
    return map
  }, [validationResults])

  // Derived: selected slot object
  const selectedSlot = useMemo(
    () => (selectedSlotId ? computedSlots.find(s => s.id === selectedSlotId) ?? null : null),
    [computedSlots, selectedSlotId],
  )

  /* ---- sync loop -------------------------------------------------- */

  const drainQueue = useCallback(async () => {
    if (isSyncingRef.current) return
    if (!draft) return
    isSyncingRef.current = true
    try {
      while (syncQueueRef.current.length > 0 && !isStaleRef.current) {
        const op = syncQueueRef.current.shift()!
        try {
          const resp = await schedulesApi.appendOps(draft.id, draftVersionRef.current, [op])
          draftVersionRef.current = resp.version
          setDraftVersion(resp.version)
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status
          if (status === 409) {
            // Another client has advanced the draft. Freeze further edits
            // and let the parent decide whether to re-fetch. Drop the
            // remainder of the queue — replaying would just widen the gap.
            isStaleRef.current = true
            setIsStale(true)
            syncQueueRef.current = []
            toast.warning('Draft was modified elsewhere. Refresh to continue editing.')
            break
          }
          // Non-stale failure — surface once and keep draining. Local state
          // is already optimistic so the user sees their edit; the next
          // successful sync will carry them forward.
          toast.error('Failed to sync edit to server.')
        }
      }
    } finally {
      isSyncingRef.current = false
    }
  }, [draft, toast])

  const enqueueSync = useCallback((op: ScheduleOperation) => {
    syncQueueRef.current.push(op)
    void drainQueue()
  }, [drainQueue])

  /* ---- dispatch + undo/redo -------------------------------------- */

  const dispatch = useCallback((op: ScheduleOperation) => {
    if (isStaleRef.current) {
      toast.warning('Draft is out of date — refresh before editing.')
      return
    }
    const slotsBeforeOp = computedSlots
    const inverse = computeInverse(op, slotsBeforeOp)
    setOperations(prev => [...prev, op])
    if (inverse) {
      setUndoStack(prev => [...prev, { forward: op, inverse }])
      setRedoStack([])
    } else {
      // Op isn't reversibly expressible (e.g. DELETE of a slot that
      // hadn't been fetched). Still dispatch it, but record no undo
      // entry so pressing Ctrl-Z doesn't silently skip it.
      setUndoStack(prev => [...prev, { forward: op, inverse: op }])
      setRedoStack([])
    }
    enqueueSync(op)
  }, [computedSlots, enqueueSync, toast])

  /** Convenience wrapper for duplicate: mints the newSlotId so the
   *  client-local slot and the eventual server row share the same id,
   *  which is what makes the inverse (DELETE_SLOT on that id) work. */
  const dispatchDuplicate = useCallback((sourceSlotId: string, newChannelId: number, newStartUtc: string) => {
    const newSlotId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    dispatch({ type: 'DUPLICATE_SLOT', sourceSlotId, newChannelId, newStartUtc, newSlotId })
  }, [dispatch])

  const undo = useCallback(() => {
    if (isStaleRef.current) {
      toast.warning('Draft is out of date — refresh before editing.')
      return
    }
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const entry = prev[prev.length - 1]
      // Apply inverse locally AND sync it — this is the fix the old
      // implementation was missing. Previously undo only trimmed local
      // state, leaving the server ahead of the client.
      setOperations(ops => [...ops, entry.inverse])
      setRedoStack(r => [...r, entry])
      enqueueSync(entry.inverse)
      return prev.slice(0, -1)
    })
  }, [enqueueSync, toast])

  const redo = useCallback(() => {
    if (isStaleRef.current) {
      toast.warning('Draft is out of date — refresh before editing.')
      return
    }
    setRedoStack(prev => {
      if (prev.length === 0) return prev
      const entry = prev[prev.length - 1]
      setOperations(ops => [...ops, entry.forward])
      setUndoStack(u => [...u, entry])
      enqueueSync(entry.forward)
      return prev.slice(0, -1)
    })
  }, [enqueueSync, toast])

  /* ---- validate / publish / reset -------------------------------- */

  /**
   * Re-run schedule validation. Returns the fresh results alongside
   * setting state, so callers that need to gate on validation (e.g.
   * publish confirmation) don't race the React state update.
   */
  const validate = useCallback(async (): Promise<ValidationResult[]> => {
    if (!draft) return []
    try {
      const resp = await schedulesApi.validateDraft(draft.id)
      const results = resp.results as ValidationResult[]
      setValidationResults(results)
      return results
    } catch {
      toast.error('Validation request failed.')
      return []
    }
  }, [draft, toast])

  const publish = useCallback(async (acknowledgeWarnings?: boolean) => {
    if (!draft) return
    try {
      await schedulesApi.publishDraft(draft.id, acknowledgeWarnings)
      toast.success('Schedule published successfully.')
      setOperations([])
      setUndoStack([])
      setRedoStack([])
      setValidationResults([])
      setSelectedSlotId(null)
    } catch {
      toast.error('Publish failed.')
    }
  }, [draft, toast])

  const reset = useCallback(() => {
    setOperations([])
    setUndoStack([])
    setRedoStack([])
    setValidationResults([])
    setSelectedSlotId(null)
    // Clear sync queue and stale flag so the parent can reuse the hook
    // after a refresh without remounting.
    syncQueueRef.current = []
    isStaleRef.current = false
    setIsStale(false)
  }, [])

  return {
    computedSlots,
    operations,
    selectedSlot,
    selectedSlotId,
    validationBySlot,
    validationResults,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    isStale,
    dispatch,
    dispatchDuplicate,
    undo,
    redo,
    validate,
    publish,
    reset,
    setSelectedSlotId,
  }
}
