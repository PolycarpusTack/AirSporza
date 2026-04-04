import { useState, useMemo, useCallback, useRef } from 'react'
import { schedulesApi } from '../services/schedules'
import { useToast } from '../components/Toast'
import type { BroadcastSlot, ScheduleDraft } from '../data/types'

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type ScheduleOperation =
  | { type: 'CREATE_SLOT'; data: Partial<BroadcastSlot> & { id: string; channelId: number; plannedStartUtc: string; plannedEndUtc: string } }
  | { type: 'UPDATE_SLOT'; slotId: string; changes: Partial<BroadcastSlot> }
  | { type: 'MOVE_SLOT'; slotId: string; newChannelId?: number; newStartUtc: string; newEndUtc: string }
  | { type: 'RESIZE_SLOT'; slotId: string; newEndUtc: string }
  | { type: 'DELETE_SLOT'; slotId: string }
  | { type: 'DUPLICATE_SLOT'; sourceSlotId: string; newChannelId: number; newStartUtc: string }

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
        id: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

export function useScheduleEditor(draft: ScheduleDraft | null, baseSlots: BroadcastSlot[]) {
  const toast = useToast()

  const [operations, setOperations] = useState<ScheduleOperation[]>([])
  const [undoStack, setUndoStack] = useState<ScheduleOperation[][]>([])
  const [redoStack, setRedoStack] = useState<ScheduleOperation[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [draftVersion, setDraftVersion] = useState<number>(draft?.version ?? 0)

  const syncingRef = useRef(false)

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

  // Sync single op to server
  const syncOp = useCallback(async (op: ScheduleOperation) => {
    if (!draft) return
    if (syncingRef.current) return
    syncingRef.current = true
    try {
      const resp = await schedulesApi.appendOps(draft.id, draftVersion, [op])
      setDraftVersion(resp.version)
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      if (status === 409) {
        toast.warning('Draft was modified by another user. Please refresh.')
      } else {
        toast.error('Failed to sync edit to server.')
      }
    } finally {
      syncingRef.current = false
    }
  }, [draft, draftVersion, toast])

  // Dispatch a new operation
  const dispatch = useCallback((op: ScheduleOperation) => {
    setUndoStack(prev => [...prev, [op]])
    setRedoStack([])
    setOperations(prev => [...prev, op])
    syncOp(op)
  }, [syncOp])

  // Undo
  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setRedoStack(r => [...r, ...last])
      setOperations(ops => ops.slice(0, ops.length - last.length))
      return prev.slice(0, -1)
    })
  }, [])

  // Redo
  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev
      const op = prev[prev.length - 1]
      setUndoStack(u => [...u, [op]])
      setOperations(ops => [...ops, op])
      syncOp(op)
      return prev.slice(0, -1)
    })
  }, [syncOp])

  // Validate draft
  const validate = useCallback(async () => {
    if (!draft) return
    try {
      const resp = await schedulesApi.validateDraft(draft.id)
      setValidationResults(resp.results as ValidationResult[])
    } catch {
      toast.error('Validation request failed.')
    }
  }, [draft, toast])

  // Publish draft
  const publish = useCallback(async (acknowledgeWarnings?: boolean) => {
    if (!draft) return
    try {
      await schedulesApi.publishDraft(draft.id, acknowledgeWarnings)
      toast.success('Schedule published successfully.')
      // Reset all state
      setOperations([])
      setUndoStack([])
      setRedoStack([])
      setValidationResults([])
      setSelectedSlotId(null)
    } catch {
      toast.error('Publish failed.')
    }
  }, [draft, toast])

  // Reset all state
  const reset = useCallback(() => {
    setOperations([])
    setUndoStack([])
    setRedoStack([])
    setValidationResults([])
    setSelectedSlotId(null)
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
    dispatch,
    undo,
    redo,
    validate,
    publish,
    reset,
    setSelectedSlotId,
  }
}
