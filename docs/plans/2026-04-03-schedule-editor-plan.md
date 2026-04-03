# Rich Schedule Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform ScheduleView from a read-only monitoring surface into an interactive scheduling workstation with drag-to-move/resize, draft operations, undo/redo, and inline validation.

**Architecture:** Pure DOM grid with CSS absolute positioning. All edits produce immutable operations that accumulate in a draft. Slot positions are always computed from base + operations. Undo/redo via operation stack. Backend executes operations atomically on publish.

**Tech Stack:** React, TypeScript, CSS positioning, existing Express + Prisma + BullMQ backend

**Design spec:** `docs/plans/2026-04-03-schedule-editor-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `backend/src/services/scheduleOperations.ts` | Operation types, applyOperations (pure), executeOperations (transactional) |
| `backend/tests/scheduleOperations.test.ts` | Unit tests for operation application |
| `src/hooks/useScheduleEditor.ts` | Core state machine: operations, undo/redo, computed slots, server sync |
| `src/hooks/useSlotDrag.ts` | Mouse event handling for drag-move and drag-resize |
| `src/hooks/useSlotContextMenu.ts` | Right-click position + action dispatch |
| `src/components/schedule/ScheduleToolbar.tsx` | Date nav, timezone, undo/redo, draft info, validate/publish |
| `src/components/schedule/ChannelColumn.tsx` | Single channel column with click-to-create |
| `src/components/schedule/SlotBlock.tsx` | Draggable/resizable slot card (replaces SlotCard) |
| `src/components/schedule/DragGhost.tsx` | Semi-transparent preview during drag |
| `src/components/schedule/SlotEditorPanel.tsx` | Right panel form for editing slot properties |
| `src/components/schedule/SlotContextMenu.tsx` | Right-click menu (Edit, Delete, Duplicate, Copy Time) |
| `src/components/schedule/TimeGutter.tsx` | Left column with hour labels |

### Modified Files

| File | Change |
|------|--------|
| `backend/src/services/validation/regulatory.ts` | Implement watershed + accessibility checks |
| `backend/src/services/validation/business.ts` | Implement simultaneous overrun + prime match + DST checks |
| `backend/src/routes/schedules.ts` | Add validate-slot endpoint, wire operation executor into publish |
| `src/pages/ScheduleView.tsx` | Rewrite: wire useScheduleEditor, replace DraftToolbar, add SlotEditorPanel |
| `src/components/schedule/ScheduleGrid.tsx` | Rewrite: container for TimeGutter + ChannelColumns |
| `src/services/schedules.ts` | Add validateSlot method |

---

## Phase 1: Backend — Operations Engine

### Task 1: Schedule operation types and pure applicator

**Files:**
- Create: `backend/src/services/scheduleOperations.ts`
- Create: `backend/tests/scheduleOperations.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/tests/scheduleOperations.test.ts
import { describe, it, expect } from 'vitest'
import { applyOperations, type ScheduleOperation } from '../src/services/scheduleOperations'

const baseSlot = {
  id: 'slot-1', channelId: 1, plannedStartUtc: '2026-03-15T14:00:00Z',
  plannedEndUtc: '2026-03-15T16:00:00Z', schedulingMode: 'FIXED' as const,
  status: 'PLANNED' as const, overrunStrategy: 'EXTEND' as const,
  bufferBeforeMin: 15, bufferAfterMin: 10, anchorType: 'FIXED_TIME' as const,
  contentSegment: 'FULL' as const, sportMetadata: {},
}

describe('applyOperations', () => {
  it('CREATE_SLOT adds a slot', () => {
    const ops: ScheduleOperation[] = [{
      type: 'CREATE_SLOT',
      data: { ...baseSlot, id: 'slot-new', channelId: 2, plannedStartUtc: '2026-03-15T10:00:00Z', plannedEndUtc: '2026-03-15T12:00:00Z' },
    }]
    const result = applyOperations([], ops)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('slot-new')
  })

  it('MOVE_SLOT updates channel and times', () => {
    const ops: ScheduleOperation[] = [{
      type: 'MOVE_SLOT', slotId: 'slot-1',
      newChannelId: 2, newStartUtc: '2026-03-15T18:00:00Z', newEndUtc: '2026-03-15T20:00:00Z',
    }]
    const result = applyOperations([baseSlot], ops)
    expect(result[0].channelId).toBe(2)
    expect(result[0].plannedStartUtc).toBe('2026-03-15T18:00:00Z')
  })

  it('RESIZE_SLOT updates end time', () => {
    const ops: ScheduleOperation[] = [{
      type: 'RESIZE_SLOT', slotId: 'slot-1', newEndUtc: '2026-03-15T17:00:00Z',
    }]
    const result = applyOperations([baseSlot], ops)
    expect(result[0].plannedEndUtc).toBe('2026-03-15T17:00:00Z')
  })

  it('DELETE_SLOT removes a slot', () => {
    const ops: ScheduleOperation[] = [{ type: 'DELETE_SLOT', slotId: 'slot-1' }]
    const result = applyOperations([baseSlot], ops)
    expect(result).toHaveLength(0)
  })

  it('UPDATE_SLOT merges changes', () => {
    const ops: ScheduleOperation[] = [{
      type: 'UPDATE_SLOT', slotId: 'slot-1',
      changes: { overrunStrategy: 'HARD_CUT', bufferBeforeMin: 5 },
    }]
    const result = applyOperations([baseSlot], ops)
    expect(result[0].overrunStrategy).toBe('HARD_CUT')
    expect(result[0].bufferBeforeMin).toBe(5)
    expect(result[0].channelId).toBe(1) // unchanged
  })

  it('DUPLICATE_SLOT copies a slot with new id and position', () => {
    const ops: ScheduleOperation[] = [{
      type: 'DUPLICATE_SLOT', sourceSlotId: 'slot-1',
      newChannelId: 1, newStartUtc: '2026-03-15T16:30:00Z',
    }]
    const result = applyOperations([baseSlot], ops)
    expect(result).toHaveLength(2)
    const dup = result.find(s => s.id !== 'slot-1')!
    expect(dup.channelId).toBe(1)
    expect(dup.plannedStartUtc).toBe('2026-03-15T16:30:00Z')
  })

  it('applies multiple operations in sequence', () => {
    const ops: ScheduleOperation[] = [
      { type: 'CREATE_SLOT', data: { ...baseSlot, id: 'slot-2', channelId: 2, plannedStartUtc: '2026-03-15T10:00:00Z', plannedEndUtc: '2026-03-15T12:00:00Z' } },
      { type: 'MOVE_SLOT', slotId: 'slot-1', newStartUtc: '2026-03-15T18:00:00Z', newEndUtc: '2026-03-15T20:00:00Z' },
      { type: 'DELETE_SLOT', slotId: 'slot-2' },
    ]
    const result = applyOperations([baseSlot], ops)
    expect(result).toHaveLength(1)
    expect(result[0].plannedStartUtc).toBe('2026-03-15T18:00:00Z')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd backend && npx vitest run tests/scheduleOperations.test.ts`

- [ ] **Step 3: Implement scheduleOperations.ts**

```typescript
// backend/src/services/scheduleOperations.ts
import { v4 as uuid } from 'uuid'

export interface SlotState {
  id: string
  channelId: number
  eventId?: number
  schedulingMode: string
  plannedStartUtc: string
  plannedEndUtc: string
  estimatedStartUtc?: string
  estimatedEndUtc?: string
  bufferBeforeMin: number
  bufferAfterMin: number
  expectedDurationMin?: number
  overrunStrategy: string
  conditionalTriggerUtc?: string
  conditionalTargetChannelId?: number
  anchorType: string
  contentSegment: string
  status: string
  sportMetadata: Record<string, unknown>
}

export type ScheduleOperation =
  | { type: 'CREATE_SLOT'; data: SlotState }
  | { type: 'UPDATE_SLOT'; slotId: string; changes: Partial<SlotState> }
  | { type: 'MOVE_SLOT'; slotId: string; newChannelId?: number; newStartUtc: string; newEndUtc: string }
  | { type: 'RESIZE_SLOT'; slotId: string; newEndUtc: string }
  | { type: 'DELETE_SLOT'; slotId: string }
  | { type: 'DUPLICATE_SLOT'; sourceSlotId: string; newChannelId: number; newStartUtc: string }

function applySingle(slots: SlotState[], op: ScheduleOperation): SlotState[] {
  switch (op.type) {
    case 'CREATE_SLOT':
      return [...slots, op.data]
    case 'UPDATE_SLOT':
      return slots.map(s => s.id === op.slotId ? { ...s, ...op.changes } : s)
    case 'MOVE_SLOT':
      return slots.map(s => {
        if (s.id !== op.slotId) return s
        const duration = new Date(s.plannedEndUtc).getTime() - new Date(s.plannedStartUtc).getTime()
        return {
          ...s,
          channelId: op.newChannelId ?? s.channelId,
          plannedStartUtc: op.newStartUtc,
          plannedEndUtc: op.newEndUtc || new Date(new Date(op.newStartUtc).getTime() + duration).toISOString(),
        }
      })
    case 'RESIZE_SLOT':
      return slots.map(s => s.id === op.slotId ? { ...s, plannedEndUtc: op.newEndUtc } : s)
    case 'DELETE_SLOT':
      return slots.filter(s => s.id !== op.slotId)
    case 'DUPLICATE_SLOT': {
      const source = slots.find(s => s.id === op.sourceSlotId)
      if (!source) return slots
      const duration = new Date(source.plannedEndUtc).getTime() - new Date(source.plannedStartUtc).getTime()
      const dup: SlotState = {
        ...source,
        id: `draft-${uuid()}`,
        channelId: op.newChannelId,
        plannedStartUtc: op.newStartUtc,
        plannedEndUtc: new Date(new Date(op.newStartUtc).getTime() + duration).toISOString(),
      }
      return [...slots, dup]
    }
  }
}

export function applyOperations(baseSlots: SlotState[], operations: ScheduleOperation[]): SlotState[] {
  let slots = [...baseSlots]
  for (const op of operations) {
    slots = applySingle(slots, op)
  }
  return slots
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd backend && npx vitest run tests/scheduleOperations.test.ts`

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/scheduleOperations.ts backend/tests/scheduleOperations.test.ts
git commit -m "feat(schedule): add operation types and pure applicator"
```

---

### Task 2: Validation stubs — regulatory and business rules

**Files:**
- Modify: `backend/src/services/validation/regulatory.ts`
- Modify: `backend/src/services/validation/business.ts`

- [ ] **Step 1: Implement regulatory checks**

```typescript
// backend/src/services/validation/regulatory.ts
import type { ValidationResult } from './types.js'

export function validateRegulatory(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []
  results.push(...checkWatershedViolation(slots))
  results.push(...checkAccessibilityMissing(slots))
  return results
}

function checkWatershedViolation(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []
  for (const slot of slots) {
    const meta = slot.sportMetadata || {}
    const contentRating = meta.contentRating as string | undefined
    if (!contentRating || !['adult', 'mature'].includes(contentRating)) continue

    const startUtc = slot.plannedStartUtc || slot.estimatedStartUtc
    if (!startUtc) continue

    // Check if before 21:00 in channel timezone (default UTC)
    const channelTz = slot.channel?.timezone || 'UTC'
    const localHour = getLocalHour(startUtc, channelTz)
    if (localHour < 21) {
      results.push({
        severity: 'ERROR',
        code: 'WATERSHED_VIOLATION',
        scope: [slot.id],
        message: `"${slot.event?.participants || 'Slot'}" rated ${contentRating} is scheduled before 21:00 watershed`,
        remediation: 'Move to after 21:00 or remove content rating',
      })
    }
  }
  return results
}

function checkAccessibilityMissing(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []
  for (const slot of slots) {
    const meta = slot.sportMetadata || {}
    if (!meta.hasSubtitles && !meta.hasAudioDescription) {
      results.push({
        severity: 'WARNING',
        code: 'ACCESSIBILITY_MISSING',
        scope: [slot.id],
        message: `"${slot.event?.participants || 'Slot'}" has no accessibility metadata (subtitles/audio description)`,
      })
    }
  }
  return results
}

function getLocalHour(utcStr: string, timezone: string): number {
  try {
    const date = new Date(utcStr)
    const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone })
    return parseInt(formatter.format(date), 10)
  } catch {
    return new Date(utcStr).getUTCHours()
  }
}
```

- [ ] **Step 2: Implement business checks**

```typescript
// backend/src/services/validation/business.ts
import type { ValidationResult, ValidationContext } from './types.js'

export function validateBusiness(slots: any[], context: ValidationContext): ValidationResult[] {
  const results: ValidationResult[] = []
  results.push(...checkSimultaneousOverrunRisk(slots, context))
  results.push(...checkPrimeMatchLate(slots, context))
  results.push(...checkDstKickoffAmbiguous(slots))
  return results
}

function checkSimultaneousOverrunRisk(slots: any[], _context: ValidationContext): ValidationResult[] {
  const results: ValidationResult[] = []
  const floatingSlots = slots.filter(s => s.schedulingMode === 'FLOATING' || s.schedulingMode === 'WINDOW')

  // Group overlapping floating slots by time window
  for (let i = 0; i < floatingSlots.length; i++) {
    const overlapping: string[] = [floatingSlots[i].id]
    const aStart = new Date(floatingSlots[i].estimatedStartUtc || floatingSlots[i].plannedStartUtc).getTime()
    const aEnd = new Date(floatingSlots[i].estimatedEndUtc || floatingSlots[i].plannedEndUtc).getTime()

    for (let j = i + 1; j < floatingSlots.length; j++) {
      if (floatingSlots[j].channelId === floatingSlots[i].channelId) continue // same channel is fine
      const bStart = new Date(floatingSlots[j].estimatedStartUtc || floatingSlots[j].plannedStartUtc).getTime()
      const bEnd = new Date(floatingSlots[j].estimatedEndUtc || floatingSlots[j].plannedEndUtc).getTime()
      if (aStart < bEnd && bStart < aEnd) overlapping.push(floatingSlots[j].id)
    }

    if (overlapping.length >= 3) {
      results.push({
        severity: 'WARNING',
        code: 'SIMULTANEOUS_OVERRUN_RISK',
        scope: overlapping,
        message: `${overlapping.length} floating slots on different channels have overlapping estimated windows — resource contention risk`,
      })
      break // report once
    }
  }
  return results
}

function checkPrimeMatchLate(slots: any[], _context: ValidationContext): ValidationResult[] {
  const results: ValidationResult[] = []
  const PRIME_CUTOFF_HOUR = 21.5 // 21:30

  for (const slot of slots) {
    const meta = slot.sportMetadata || {}
    if (!meta.isPremium) continue

    const startUtc = slot.plannedStartUtc || slot.estimatedStartUtc
    if (!startUtc) continue

    const hour = new Date(startUtc).getUTCHours() + new Date(startUtc).getUTCMinutes() / 60
    if (hour > PRIME_CUTOFF_HOUR) {
      results.push({
        severity: 'WARNING',
        code: 'PRIME_MATCH_LATE',
        scope: [slot.id],
        message: `Premium event "${slot.event?.participants || 'Slot'}" starts after 21:30 — audience risk`,
      })
    }
  }
  return results
}

function checkDstKickoffAmbiguous(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  for (const slot of slots) {
    const startUtc = slot.plannedStartUtc || slot.estimatedStartUtc
    if (!startUtc) continue

    const date = new Date(startUtc)
    const month = date.getUTCMonth()
    const dayOfWeek = date.getUTCDay()
    const dayOfMonth = date.getUTCDate()

    // EU DST transitions: last Sunday of March and October
    const isLastSundayOfMarchOrOct =
      (month === 2 || month === 9) && dayOfWeek === 0 && dayOfMonth >= 25

    if (isLastSundayOfMarchOrOct) {
      const hour = date.getUTCHours()
      if (hour >= 0 && hour <= 3) {
        results.push({
          severity: 'INFO',
          code: 'DST_KICKOFF_AMBIGUOUS',
          scope: [slot.id],
          message: `"${slot.event?.participants || 'Slot'}" falls within DST transition window — verify local times`,
        })
      }
    }
  }
  return results
}
```

- [ ] **Step 3: Run backend TS check**

Run: `cd backend && npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/validation/regulatory.ts backend/src/services/validation/business.ts
git commit -m "feat(schedule): implement regulatory and business validation rules"
```

---

### Task 3: Validate-slot endpoint

**Files:**
- Modify: `backend/src/routes/schedules.ts`
- Modify: `src/services/schedules.ts`

- [ ] **Step 1: Add validate-slot route**

Add before the publish route in `backend/src/routes/schedules.ts`:

```typescript
// POST /schedule-drafts/:id/validate-slot
router.post('/:id/validate-slot', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const draft = await prisma.scheduleDraft.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
    })
    if (!draft) return next(createError(404, 'Draft not found'))

    const { slot } = req.body as { slot: any }
    if (!slot) return next(createError(400, 'slot is required'))

    // Run validation on just this slot with full context
    const allSlots = await prisma.broadcastSlot.findMany({
      where: { tenantId: req.tenantId, channelId: draft.channelId },
      include: { event: true, channel: true },
    })

    // Replace/add the slot being validated
    const slotsForValidation = allSlots
      .filter(s => s.id !== slot.id)
      .concat([slot])

    const results = validateSchedule(slotsForValidation, { rightsPolicies: [], events: [] })
    const slotResults = results.filter(r => r.scope.includes(slot.id))

    res.json({ results: slotResults })
  } catch (err) { next(err) }
})
```

- [ ] **Step 2: Add client method**

Add to `src/services/schedules.ts`:

```typescript
validateSlot: (draftId: string, slot: Partial<BroadcastSlot>) =>
  api.post<{ results: any[] }>(`/schedule-drafts/${draftId}/validate-slot`, { slot }),
```

- [ ] **Step 3: Run TS check**

Run: `cd backend && npx tsc --noEmit && cd .. && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/schedules.ts src/services/schedules.ts
git commit -m "feat(schedule): add validate-slot endpoint for inline feedback"
```

---

## Phase 2: Frontend — Core Hooks

### Task 4: useScheduleEditor hook

The central state machine. All other components read from and write through this hook.

**Files:**
- Create: `src/hooks/useScheduleEditor.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useScheduleEditor.ts
import { useState, useCallback, useMemo, useRef } from 'react'
import { schedulesApi } from '../services/schedules'
import type { BroadcastSlot, ScheduleDraft } from '../data/types'
import { useToast } from '../components/Toast'

export type ScheduleOperation =
  | { type: 'CREATE_SLOT'; data: Partial<BroadcastSlot> & { id: string; channelId: number; plannedStartUtc: string; plannedEndUtc: string } }
  | { type: 'UPDATE_SLOT'; slotId: string; changes: Partial<BroadcastSlot> }
  | { type: 'MOVE_SLOT'; slotId: string; newChannelId?: number; newStartUtc: string; newEndUtc: string }
  | { type: 'RESIZE_SLOT'; slotId: string; newEndUtc: string }
  | { type: 'DELETE_SLOT'; slotId: string }
  | { type: 'DUPLICATE_SLOT'; sourceSlotId: string; newChannelId: number; newStartUtc: string }

function applySingle(slots: BroadcastSlot[], op: ScheduleOperation): BroadcastSlot[] {
  switch (op.type) {
    case 'CREATE_SLOT':
      return [...slots, { ...op.data, status: 'PLANNED', overrunStrategy: 'EXTEND', bufferBeforeMin: 15, bufferAfterMin: 10, schedulingMode: 'FIXED', anchorType: 'FIXED_TIME', contentSegment: 'FULL', sportMetadata: {}, tenantId: '' } as BroadcastSlot]
    case 'UPDATE_SLOT':
      return slots.map(s => s.id === op.slotId ? { ...s, ...op.changes } : s)
    case 'MOVE_SLOT':
      return slots.map(s => {
        if (s.id !== op.slotId) return s
        return { ...s, channelId: op.newChannelId ?? s.channelId, plannedStartUtc: op.newStartUtc, plannedEndUtc: op.newEndUtc }
      })
    case 'RESIZE_SLOT':
      return slots.map(s => s.id === op.slotId ? { ...s, plannedEndUtc: op.newEndUtc } : s)
    case 'DELETE_SLOT':
      return slots.filter(s => s.id !== op.slotId)
    case 'DUPLICATE_SLOT': {
      const source = slots.find(s => s.id === op.sourceSlotId)
      if (!source) return slots
      const dur = new Date(source.plannedEndUtc!).getTime() - new Date(source.plannedStartUtc!).getTime()
      return [...slots, { ...source, id: `draft-${Date.now()}`, channelId: op.newChannelId, plannedStartUtc: op.newStartUtc, plannedEndUtc: new Date(new Date(op.newStartUtc).getTime() + dur).toISOString() }]
    }
  }
}

function applyAll(base: BroadcastSlot[], ops: ScheduleOperation[]): BroadcastSlot[] {
  let slots = [...base]
  for (const op of ops) slots = applySingle(slots, op)
  return slots
}

export interface ValidationResult {
  severity: 'ERROR' | 'WARNING' | 'INFO'
  code: string
  scope: string[]
  message: string
  remediation?: string
}

export function useScheduleEditor(draft: ScheduleDraft | null, baseSlots: BroadcastSlot[]) {
  const toast = useToast()
  const [operations, setOperations] = useState<ScheduleOperation[]>([])
  const [undoStack, setUndoStack] = useState<ScheduleOperation[][]>([])
  const [redoStack, setRedoStack] = useState<ScheduleOperation[][]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const versionRef = useRef(draft?.version ?? 0)
  const syncingRef = useRef(false)

  const computedSlots = useMemo(() => applyAll(baseSlots, operations), [baseSlots, operations])

  const selectedSlot = useMemo(
    () => computedSlots.find(s => s.id === selectedSlotId) ?? null,
    [computedSlots, selectedSlotId]
  )

  const validationBySlot = useMemo(() => {
    const map = new Map<string, ValidationResult[]>()
    for (const r of validationResults) {
      for (const slotId of r.scope) {
        const existing = map.get(slotId) || []
        existing.push(r)
        map.set(slotId, existing)
      }
    }
    return map
  }, [validationResults])

  const syncToServer = useCallback(async (ops: ScheduleOperation[]) => {
    if (!draft || syncingRef.current) return
    syncingRef.current = true
    try {
      const result = await schedulesApi.appendOps(draft.id, versionRef.current, ops as unknown[])
      versionRef.current = result.version
    } catch (err: any) {
      if (err.status === 409) {
        toast.warning('Draft was modified elsewhere — refreshing')
        // Caller should refetch
      } else {
        toast.error('Failed to save changes')
      }
    } finally {
      syncingRef.current = false
    }
  }, [draft, toast])

  const dispatch = useCallback((op: ScheduleOperation) => {
    setOperations(prev => {
      const next = [...prev, op]
      syncToServer([op])
      return next
    })
    setUndoStack(prev => [...prev, operations])
    setRedoStack([])
  }, [operations, syncToServer])

  const undo = useCallback(() => {
    if (undoStack.length === 0) return
    setRedoStack(prev => [...prev, operations])
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    setOperations(prev)
  }, [operations, undoStack])

  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    setUndoStack(prev => [...prev, operations])
    const next = redoStack[redoStack.length - 1]
    setRedoStack(s => s.slice(0, -1))
    setOperations(next)
  }, [operations, redoStack])

  const validate = useCallback(async () => {
    if (!draft) return []
    try {
      const { results } = await schedulesApi.validateDraft(draft.id)
      setValidationResults(results)
      return results
    } catch {
      toast.error('Validation failed')
      return []
    }
  }, [draft, toast])

  const publish = useCallback(async (acknowledgeWarnings = false) => {
    if (!draft) return false
    try {
      await schedulesApi.publishDraft(draft.id, acknowledgeWarnings)
      setOperations([])
      setUndoStack([])
      setRedoStack([])
      setValidationResults([])
      toast.success('Schedule published')
      return true
    } catch (err: any) {
      toast.error(err.message || 'Publish failed')
      return false
    }
  }, [draft, toast])

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
```

- [ ] **Step 2: Run TS check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScheduleEditor.ts
git commit -m "feat(schedule): add useScheduleEditor state machine hook"
```

---

### Task 5: useSlotDrag hook

Ref-based drag handling for move and resize. No React state during mousemove to avoid re-render per pixel.

**Files:**
- Create: `src/hooks/useSlotDrag.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useSlotDrag.ts
import { useRef, useCallback, useEffect } from 'react'

const SNAP_MINUTES = 5
const PX_PER_HOUR = 30
const PX_PER_MINUTE = PX_PER_HOUR / 60
const SNAP_PX = SNAP_MINUTES * PX_PER_MINUTE // 2.5px

export interface DragResult {
  slotId: string
  type: 'move' | 'resize'
  deltaMinutes: number
  newChannelId?: number
}

interface DragState {
  active: boolean
  slotId: string
  type: 'move' | 'resize'
  startY: number
  startX: number
  originalChannelId: number
  channelIds: number[]
  channelWidth: number
  gridLeft: number
  ghostEl: HTMLElement | null
}

export function useSlotDrag(onComplete: (result: DragResult) => void) {
  const stateRef = useRef<DragState | null>(null)

  const startDrag = useCallback((
    e: React.MouseEvent,
    slotId: string,
    type: 'move' | 'resize',
    channelId: number,
    channelIds: number[],
    channelWidth: number,
    gridLeft: number,
    ghostEl: HTMLElement | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    stateRef.current = {
      active: true, slotId, type,
      startY: e.clientY, startX: e.clientX,
      originalChannelId: channelId, channelIds, channelWidth, gridLeft,
      ghostEl,
    }
    document.body.style.cursor = type === 'resize' ? 'ns-resize' : 'grabbing'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const s = stateRef.current
      if (!s?.active || !s.ghostEl) return
      const deltaY = e.clientY - s.startY
      const snappedY = Math.round(deltaY / SNAP_PX) * SNAP_PX
      s.ghostEl.style.transform = `translateY(${snappedY}px)`
      s.ghostEl.style.opacity = '0.7'
    }

    const onMouseUp = (e: MouseEvent) => {
      const s = stateRef.current
      if (!s?.active) return
      const deltaY = e.clientY - s.startY
      const snappedMinutes = Math.round(deltaY / PX_PER_MINUTE / SNAP_MINUTES) * SNAP_MINUTES

      let newChannelId: number | undefined
      if (s.type === 'move') {
        const deltaX = e.clientX - s.startX
        const channelOffset = Math.round(deltaX / s.channelWidth)
        const origIdx = s.channelIds.indexOf(s.originalChannelId)
        const newIdx = Math.max(0, Math.min(s.channelIds.length - 1, origIdx + channelOffset))
        if (newIdx !== origIdx) newChannelId = s.channelIds[newIdx]
      }

      if (s.ghostEl) {
        s.ghostEl.style.transform = ''
        s.ghostEl.style.opacity = ''
      }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      stateRef.current = null

      if (snappedMinutes !== 0 || newChannelId !== undefined) {
        onComplete({ slotId: s.slotId, type: s.type, deltaMinutes: snappedMinutes, newChannelId })
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onComplete])

  return { startDrag, isDragging: () => stateRef.current?.active ?? false }
}
```

- [ ] **Step 2: Run TS check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSlotDrag.ts
git commit -m "feat(schedule): add useSlotDrag hook for move and resize"
```

---

### Task 6: useSlotContextMenu hook

**Files:**
- Create: `src/hooks/useSlotContextMenu.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useSlotContextMenu.ts
import { useState, useCallback, useEffect } from 'react'

export interface ContextMenuState {
  x: number
  y: number
  slotId: string
}

export function useSlotContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  const openMenu = useCallback((e: React.MouseEvent, slotId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, slotId })
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])

  // Close on any click or escape
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  return { menu, openMenu, closeMenu }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSlotContextMenu.ts
git commit -m "feat(schedule): add useSlotContextMenu hook"
```

---

## Phase 3: Frontend — Grid Components

### Task 7: TimeGutter, ChannelColumn, and SlotBlock components

These are the building blocks of the new grid.

**Files:**
- Create: `src/components/schedule/TimeGutter.tsx`
- Create: `src/components/schedule/ChannelColumn.tsx`
- Create: `src/components/schedule/SlotBlock.tsx`

- [ ] **Step 1: Create TimeGutter**

```typescript
// src/components/schedule/TimeGutter.tsx
interface TimeGutterProps {
  dayStartHour: number
  dayEndHour: number
  pxPerHour: number
}

export function TimeGutter({ dayStartHour, dayEndHour, pxPerHour }: TimeGutterProps) {
  const hours: number[] = []
  for (let h = dayStartHour; h < dayEndHour; h++) hours.push(h)

  return (
    <div className="flex-shrink-0 w-14 border-r border-border">
      <div className="h-10 border-b border-border" />
      <div style={{ height: hours.length * pxPerHour }} className="relative">
        {hours.map(h => (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-border/30 px-1.5 text-[10px] text-text-3 font-mono"
            style={{ top: (h - dayStartHour) * pxPerHour }}
          >
            {String(h % 24).padStart(2, '0')}:00
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create SlotBlock**

```typescript
// src/components/schedule/SlotBlock.tsx
import { useRef } from 'react'
import { Clock, Zap, Tv, Radio, AlertTriangle, AlertCircle } from 'lucide-react'
import type { BroadcastSlot } from '../../data/types'
import type { ValidationResult } from '../../hooks/useScheduleEditor'

interface SlotBlockProps {
  slot: BroadcastSlot
  pxPerHour: number
  dayStartHour: number
  isSelected: boolean
  validations: ValidationResult[]
  onClick: (slotId: string) => void
  onDoubleClick: (slotId: string) => void
  onContextMenu: (e: React.MouseEvent, slotId: string) => void
  onDragStart: (e: React.MouseEvent, slotId: string, type: 'move' | 'resize') => void
}

const STRATEGY_ICONS: Record<string, typeof Clock> = {
  EXTEND: Clock, CONDITIONAL_SWITCH: Zap, HARD_CUT: Tv, SIMULCAST: Radio,
}

function parseHour(utcStr?: string): number {
  if (!utcStr) return 0
  const d = new Date(utcStr)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}

function fmtTime(utcStr?: string): string {
  if (!utcStr) return '--:--'
  const d = new Date(utcStr)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function SlotBlock({
  slot, pxPerHour, dayStartHour, isSelected, validations,
  onClick, onDoubleClick, onContextMenu, onDragStart,
}: SlotBlockProps) {
  const ref = useRef<HTMLDivElement>(null)
  const startH = parseHour(slot.plannedStartUtc || slot.estimatedStartUtc)
  const endH = parseHour(slot.plannedEndUtc || slot.estimatedEndUtc)
  const top = (startH - dayStartHour) * pxPerHour
  const height = Math.max((endH - startH) * pxPerHour, 15)

  const hasError = validations.some(v => v.severity === 'ERROR')
  const hasWarning = validations.some(v => v.severity === 'WARNING')
  const borderClass = hasError ? 'border-red-500' : hasWarning ? 'border-amber-500' : isSelected ? 'border-primary' : 'border-blue-500/40'
  const StrategyIcon = STRATEGY_ICONS[slot.overrunStrategy] || Clock
  const isFloating = slot.schedulingMode === 'FLOATING' || slot.schedulingMode === 'WINDOW'

  return (
    <div
      ref={ref}
      className={`absolute left-1 right-1 rounded-md border-2 px-2 py-1 cursor-grab select-none overflow-hidden bg-blue-500/15 hover:bg-blue-500/25 transition-colors ${borderClass} ${isFloating ? 'border-dashed' : ''}`}
      style={{ top, height, minHeight: 15 }}
      onClick={e => { e.stopPropagation(); onClick(slot.id) }}
      onDoubleClick={() => onDoubleClick(slot.id)}
      onContextMenu={e => onContextMenu(e, slot.id)}
      onMouseDown={e => { if (e.button === 0) onDragStart(e, slot.id, 'move') }}
    >
      <div className="flex items-center gap-1 text-xs font-medium truncate">
        <StrategyIcon className="w-3 h-3 flex-shrink-0 opacity-60" />
        <span className="truncate">{slot.event?.participants || `Slot ${slot.id.slice(0, 8)}`}</span>
        {hasError && <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
        {hasWarning && !hasError && <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />}
      </div>
      {height > 30 && (
        <div className="text-[10px] text-text-3 mt-0.5">
          {fmtTime(slot.plannedStartUtc)} – {fmtTime(slot.plannedEndUtc)} {slot.schedulingMode}
        </div>
      )}
      {isFloating && height > 45 && (
        <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${((slot.sportMetadata as any)?.confidenceScore || 0.5) * 100}%` }} />
        </div>
      )}
      {/* Resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-white/20"
        onMouseDown={e => { e.stopPropagation(); onDragStart(e, slot.id, 'resize') }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Create ChannelColumn**

```typescript
// src/components/schedule/ChannelColumn.tsx
import { SlotBlock } from './SlotBlock'
import type { BroadcastSlot, Channel } from '../../data/types'
import type { ValidationResult } from '../../hooks/useScheduleEditor'

interface ChannelColumnProps {
  channel: Channel
  slots: BroadcastSlot[]
  dayStartHour: number
  dayEndHour: number
  pxPerHour: number
  selectedSlotId: string | null
  validationBySlot: Map<string, ValidationResult[]>
  onSlotClick: (slotId: string) => void
  onSlotDoubleClick: (slotId: string) => void
  onSlotContextMenu: (e: React.MouseEvent, slotId: string) => void
  onSlotDragStart: (e: React.MouseEvent, slotId: string, type: 'move' | 'resize') => void
  onEmptyClick: (channelId: number, hour: number) => void
}

export function ChannelColumn({
  channel, slots, dayStartHour, dayEndHour, pxPerHour,
  selectedSlotId, validationBySlot,
  onSlotClick, onSlotDoubleClick, onSlotContextMenu, onSlotDragStart, onEmptyClick,
}: ChannelColumnProps) {
  const totalHeight = (dayEndHour - dayStartHour) * pxPerHour
  const hours: number[] = []
  for (let h = dayStartHour; h < dayEndHour; h++) hours.push(h)

  const handleEmptyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const hour = dayStartHour + y / pxPerHour
    const snapped = Math.round(hour * 12) / 12 // 5-min snap
    onEmptyClick(channel.id, snapped)
  }

  return (
    <div className="flex-1 min-w-[140px] border-r border-border last:border-r-0">
      <div className="h-10 border-b border-border flex items-center justify-center px-2 gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: channel.color || '#6B7280' }} />
        <span className="text-xs font-semibold truncate">{channel.name}</span>
      </div>
      <div style={{ height: totalHeight }} className="relative" onClick={handleEmptyClick}>
        {hours.map(h => (
          <div key={h} className="absolute left-0 right-0 border-t border-border/15" style={{ top: (h - dayStartHour) * pxPerHour }} />
        ))}
        {slots.map(slot => (
          <SlotBlock
            key={slot.id}
            slot={slot}
            pxPerHour={pxPerHour}
            dayStartHour={dayStartHour}
            isSelected={slot.id === selectedSlotId}
            validations={validationBySlot.get(slot.id) || []}
            onClick={onSlotClick}
            onDoubleClick={onSlotDoubleClick}
            onContextMenu={onSlotContextMenu}
            onDragStart={onSlotDragStart}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run TS check**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TimeGutter.tsx src/components/schedule/SlotBlock.tsx src/components/schedule/ChannelColumn.tsx
git commit -m "feat(schedule): add TimeGutter, SlotBlock, and ChannelColumn components"
```

---

### Task 8: SlotEditorPanel, SlotContextMenu, and ScheduleToolbar

**Files:**
- Create: `src/components/schedule/SlotEditorPanel.tsx`
- Create: `src/components/schedule/SlotContextMenu.tsx`
- Create: `src/components/schedule/ScheduleToolbar.tsx`

- [ ] **Step 1: Create SlotEditorPanel**

The right-panel form. Receives the selected slot from `useScheduleEditor`, emits `UPDATE_SLOT` operations.

```typescript
// src/components/schedule/SlotEditorPanel.tsx
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { BroadcastSlot } from '../../data/types'
import type { ScheduleOperation, ValidationResult } from '../../hooks/useScheduleEditor'

interface SlotEditorPanelProps {
  slot: BroadcastSlot
  validations: ValidationResult[]
  onDispatch: (op: ScheduleOperation) => void
  onDelete: (slotId: string) => void
  onClose: () => void
}

export function SlotEditorPanel({ slot, validations, onDispatch, onDelete, onClose }: SlotEditorPanelProps) {
  const [startTime, setStartTime] = useState('')
  const [durationMin, setDurationMin] = useState(120)
  const [mode, setMode] = useState(slot.schedulingMode)
  const [strategy, setStrategy] = useState(slot.overrunStrategy)
  const [bufferBefore, setBufferBefore] = useState(slot.bufferBeforeMin)
  const [bufferAfter, setBufferAfter] = useState(slot.bufferAfterMin)

  useEffect(() => {
    const start = slot.plannedStartUtc ? new Date(slot.plannedStartUtc) : null
    const end = slot.plannedEndUtc ? new Date(slot.plannedEndUtc) : null
    if (start) setStartTime(`${String(start.getUTCHours()).padStart(2, '0')}:${String(start.getUTCMinutes()).padStart(2, '0')}`)
    if (start && end) setDurationMin(Math.round((end.getTime() - start.getTime()) / 60000))
    setMode(slot.schedulingMode)
    setStrategy(slot.overrunStrategy)
    setBufferBefore(slot.bufferBeforeMin)
    setBufferAfter(slot.bufferAfterMin)
  }, [slot])

  const handleSave = () => {
    const [h, m] = startTime.split(':').map(Number)
    const base = new Date(slot.plannedStartUtc || new Date().toISOString())
    base.setUTCHours(h, m, 0, 0)
    const end = new Date(base.getTime() + durationMin * 60000)

    onDispatch({
      type: 'UPDATE_SLOT',
      slotId: slot.id,
      changes: {
        plannedStartUtc: base.toISOString(),
        plannedEndUtc: end.toISOString(),
        schedulingMode: mode as any,
        overrunStrategy: strategy as any,
        bufferBeforeMin: bufferBefore,
        bufferAfterMin: bufferAfter,
      },
    })
  }

  const errors = validations.filter(v => v.severity === 'ERROR')
  const warnings = validations.filter(v => v.severity === 'WARNING')

  return (
    <div className="fixed right-0 top-14 bottom-0 w-72 bg-surface border-l border-border p-4 shadow-xl overflow-y-auto z-30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Edit Slot</h3>
        <button onClick={onClose} className="text-text-3 hover:text-text"><X className="w-4 h-4" /></button>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <label className="text-text-3 text-xs block mb-1">Event</label>
          <div className="input px-2 py-1.5 text-xs">{slot.event?.participants || 'Unlinked'}</div>
        </div>
        <div>
          <label className="text-text-3 text-xs block mb-1">Start Time (UTC)</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input w-full px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="text-text-3 text-xs block mb-1">Duration (min)</label>
          <input type="number" value={durationMin} onChange={e => setDurationMin(Number(e.target.value))} min={30} step={5} className="input w-full px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="text-text-3 text-xs block mb-1">Mode</label>
          <select value={mode} onChange={e => setMode(e.target.value as any)} className="input w-full px-2 py-1.5 text-xs">
            <option value="FIXED">FIXED</option>
            <option value="FLOATING">FLOATING</option>
            <option value="WINDOW">WINDOW</option>
          </select>
        </div>
        <div>
          <label className="text-text-3 text-xs block mb-1">Overrun Strategy</label>
          <select value={strategy} onChange={e => setStrategy(e.target.value as any)} className="input w-full px-2 py-1.5 text-xs">
            <option value="EXTEND">EXTEND</option>
            <option value="CONDITIONAL_SWITCH">CONDITIONAL_SWITCH</option>
            <option value="HARD_CUT">HARD_CUT</option>
            <option value="SIMULCAST">SIMULCAST</option>
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-text-3 text-xs block mb-1">Buffer Before</label>
            <input type="number" value={bufferBefore} onChange={e => setBufferBefore(Number(e.target.value))} min={0} step={5} className="input w-full px-2 py-1.5 text-xs" />
          </div>
          <div className="flex-1">
            <label className="text-text-3 text-xs block mb-1">Buffer After</label>
            <input type="number" value={bufferAfter} onChange={e => setBufferAfter(Number(e.target.value))} min={0} step={5} className="input w-full px-2 py-1.5 text-xs" />
          </div>
        </div>

        {errors.map((e, i) => (
          <div key={i} className="bg-red-500/10 border border-red-500/30 rounded-md p-2">
            <div className="text-red-400 text-xs font-bold">{e.code}</div>
            <div className="text-text-3 text-xs mt-0.5">{e.message}</div>
          </div>
        ))}
        {warnings.map((w, i) => (
          <div key={i} className="bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
            <div className="text-amber-400 text-xs font-bold">{w.code}</div>
            <div className="text-text-3 text-xs mt-0.5">{w.message}</div>
          </div>
        ))}

        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} className="btn btn-p btn-sm flex-1">Save</button>
          <button onClick={() => onDelete(slot.id)} className="btn btn-sm flex-1 text-red-400 border-red-500/30 hover:bg-red-500/10">Delete</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create SlotContextMenu**

```typescript
// src/components/schedule/SlotContextMenu.tsx
import { Pencil, Trash2, Copy, Clock } from 'lucide-react'

interface SlotContextMenuProps {
  x: number
  y: number
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onCopyTime: () => void
}

export function SlotContextMenu({ x, y, onEdit, onDelete, onDuplicate, onCopyTime }: SlotContextMenuProps) {
  const items = [
    { icon: Pencil, label: 'Edit', onClick: onEdit },
    { icon: Copy, label: 'Duplicate', onClick: onDuplicate },
    { icon: Clock, label: 'Copy Time', onClick: onCopyTime },
    { icon: Trash2, label: 'Delete', onClick: onDelete, danger: true },
  ]

  return (
    <div
      className="fixed z-50 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{ left: x, top: y }}
      onClick={e => e.stopPropagation()}
    >
      {items.map(item => (
        <button
          key={item.label}
          onClick={item.onClick}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors ${item.danger ? 'text-red-400' : ''}`}
        >
          <item.icon className="w-3.5 h-3.5" />
          {item.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create ScheduleToolbar**

```typescript
// src/components/schedule/ScheduleToolbar.tsx
import { ChevronLeft, ChevronRight, Undo2, Redo2, CheckCircle, Upload } from 'lucide-react'
import { Btn, Badge } from '../ui'
import type { ScheduleDraft } from '../../data/types'

interface ScheduleToolbarProps {
  date: string
  onPrevDay: () => void
  onNextDay: () => void
  onToday: () => void
  onDateChange: (date: string) => void
  timezone: string
  onTimezoneChange: (tz: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  draft: ScheduleDraft | null
  operationCount: number
  onValidate: () => void
  onPublish: () => void
  validating?: boolean
  publishing?: boolean
}

export function ScheduleToolbar({
  date, onPrevDay, onNextDay, onToday, onDateChange,
  timezone, onTimezoneChange,
  canUndo, canRedo, onUndo, onRedo,
  draft, operationCount, onValidate, onPublish,
  validating, publishing,
}: ScheduleToolbarProps) {
  const formatted = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <button onClick={onPrevDay} className="btn btn-s p-1.5"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={onToday} className="btn btn-s text-xs px-3">Today</button>
        <span className="font-semibold text-sm">{formatted}</span>
        <input type="date" value={date} onChange={e => onDateChange(e.target.value)} className="input text-xs px-2 py-1" />
        <button onClick={onNextDay} className="btn btn-s p-1.5"><ChevronRight className="w-4 h-4" /></button>
        <select value={timezone} onChange={e => onTimezoneChange(e.target.value)} className="input text-xs px-2 py-1">
          <option value="UTC">UTC</option>
          <option value="Europe/Brussels">CET</option>
          <option value="Europe/London">GMT</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onUndo} disabled={!canUndo} className="btn btn-s p-1.5 disabled:opacity-30" title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
        <button onClick={onRedo} disabled={!canRedo} className="btn btn-s p-1.5 disabled:opacity-30" title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>

        {draft && (
          <Badge variant="default">
            Draft v{draft.version} {operationCount > 0 && `• ${operationCount} ops`}
          </Badge>
        )}

        <Btn variant="secondary" size="sm" onClick={onValidate} disabled={validating}>
          <CheckCircle className="w-3.5 h-3.5 mr-1" />
          {validating ? 'Validating...' : 'Validate'}
        </Btn>
        <Btn variant="primary" size="sm" onClick={onPublish} disabled={publishing || !draft}>
          <Upload className="w-3.5 h-3.5 mr-1" />
          {publishing ? 'Publishing...' : 'Publish'}
        </Btn>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run TS check**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/SlotEditorPanel.tsx src/components/schedule/SlotContextMenu.tsx src/components/schedule/ScheduleToolbar.tsx
git commit -m "feat(schedule): add SlotEditorPanel, SlotContextMenu, and ScheduleToolbar"
```

---

## Phase 4: Frontend — Wire Everything Together

### Task 9: Rewrite ScheduleGrid

Replace the read-only grid with the interactive version using the new components.

**Files:**
- Modify: `src/components/schedule/ScheduleGrid.tsx`

- [ ] **Step 1: Rewrite ScheduleGrid**

```typescript
// src/components/schedule/ScheduleGrid.tsx
import { useMemo } from 'react'
import { TimeGutter } from './TimeGutter'
import { ChannelColumn } from './ChannelColumn'
import type { BroadcastSlot, Channel } from '../../data/types'
import type { ValidationResult } from '../../hooks/useScheduleEditor'

interface ScheduleGridProps {
  channels: Channel[]
  slots: BroadcastSlot[]
  dayStartHour?: number
  dayEndHour?: number
  pxPerHour?: number
  selectedSlotId: string | null
  validationBySlot: Map<string, ValidationResult[]>
  onSlotClick: (slotId: string) => void
  onSlotDoubleClick: (slotId: string) => void
  onSlotContextMenu: (e: React.MouseEvent, slotId: string) => void
  onSlotDragStart: (e: React.MouseEvent, slotId: string, type: 'move' | 'resize') => void
  onEmptyClick: (channelId: number, hour: number) => void
}

export function ScheduleGrid({
  channels, slots,
  dayStartHour = 6, dayEndHour = 30, pxPerHour = 30,
  selectedSlotId, validationBySlot,
  onSlotClick, onSlotDoubleClick, onSlotContextMenu, onSlotDragStart, onEmptyClick,
}: ScheduleGridProps) {
  const slotsByChannel = useMemo(() => {
    const map = new Map<number, BroadcastSlot[]>()
    for (const ch of channels) map.set(ch.id, [])
    for (const slot of slots) {
      const arr = map.get(slot.channelId) || []
      arr.push(slot)
      map.set(slot.channelId, arr)
    }
    return map
  }, [channels, slots])

  return (
    <div className="flex overflow-auto border border-border rounded-xl bg-surface">
      <TimeGutter dayStartHour={dayStartHour} dayEndHour={dayEndHour} pxPerHour={pxPerHour} />
      {channels.map(ch => (
        <ChannelColumn
          key={ch.id}
          channel={ch}
          slots={slotsByChannel.get(ch.id) || []}
          dayStartHour={dayStartHour}
          dayEndHour={dayEndHour}
          pxPerHour={pxPerHour}
          selectedSlotId={selectedSlotId}
          validationBySlot={validationBySlot}
          onSlotClick={onSlotClick}
          onSlotDoubleClick={onSlotDoubleClick}
          onSlotContextMenu={onSlotContextMenu}
          onSlotDragStart={onSlotDragStart}
          onEmptyClick={onEmptyClick}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Run TS check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/ScheduleGrid.tsx
git commit -m "feat(schedule): rewrite ScheduleGrid with interactive components"
```

---

### Task 10: Rewrite ScheduleView — wire everything together

This is the main integration task. Connects `useScheduleEditor`, `useSlotDrag`, `useSlotContextMenu`, keyboard shortcuts, and all new components.

**Files:**
- Modify: `src/pages/ScheduleView.tsx`

- [ ] **Step 1: Rewrite ScheduleView**

```typescript
// src/pages/ScheduleView.tsx
import { useState, useEffect, useCallback } from 'react'
import { ScheduleGrid } from '../components/schedule/ScheduleGrid'
import { ScheduleToolbar } from '../components/schedule/ScheduleToolbar'
import { SlotEditorPanel } from '../components/schedule/SlotEditorPanel'
import { SlotContextMenu } from '../components/schedule/SlotContextMenu'
import { SwitchConfirmModal } from '../components/schedule/SwitchConfirmModal'
import { CascadeDashboard } from '../components/schedule/CascadeDashboard'
import { schedulesApi } from '../services/schedules'
import { channelsApi } from '../services/channels'
import { useScheduleEditor } from '../hooks/useScheduleEditor'
import { useSlotDrag } from '../hooks/useSlotDrag'
import { useSlotContextMenu } from '../hooks/useSlotContextMenu'
import { useToast } from '../components/Toast'
import type { Channel, BroadcastSlot, ScheduleDraft, Alert } from '../data/types'
import { Grid2X2, Activity } from 'lucide-react'

export function ScheduleView() {
  const toast = useToast()
  const [channels, setChannels] = useState<Channel[]>([])
  const [baseSlots, setBaseSlots] = useState<BroadcastSlot[]>([])
  const [activeDraft, setActiveDraft] = useState<ScheduleDraft | null>(null)
  const [date, setDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'grid' | 'cascade'>('grid')
  const [switchAlert, setSwitchAlert] = useState<Alert | null>(null)
  const [timezone, setTimezone] = useState('UTC')
  const [validating, setValidating] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const editor = useScheduleEditor(activeDraft, baseSlots)
  const { menu, openMenu, closeMenu } = useSlotContextMenu()

  const handleDragComplete = useCallback((result: import('../hooks/useSlotDrag').DragResult) => {
    const slot = editor.computedSlots.find(s => s.id === result.slotId)
    if (!slot) return
    if (result.type === 'resize') {
      const endMs = new Date(slot.plannedEndUtc!).getTime() + result.deltaMinutes * 60000
      editor.dispatch({ type: 'RESIZE_SLOT', slotId: result.slotId, newEndUtc: new Date(endMs).toISOString() })
    } else {
      const startMs = new Date(slot.plannedStartUtc!).getTime() + result.deltaMinutes * 60000
      const endMs = new Date(slot.plannedEndUtc!).getTime() + result.deltaMinutes * 60000
      editor.dispatch({
        type: 'MOVE_SLOT', slotId: result.slotId,
        newChannelId: result.newChannelId,
        newStartUtc: new Date(startMs).toISOString(),
        newEndUtc: new Date(endMs).toISOString(),
      })
    }
  }, [editor])

  const { startDrag } = useSlotDrag(handleDragComplete)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [ch, sl, dr] = await Promise.all([
        channelsApi.list(),
        schedulesApi.listSlots({ date }),
        schedulesApi.listDrafts(),
      ])
      setChannels(ch)
      setBaseSlots(sl)
      if (dr.length) {
        setActiveDraft(dr.find(d => d.status !== 'PUBLISHED') || dr[0])
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load schedule data')
    } finally {
      setLoading(false)
    }
  }, [date, toast])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { editor.reset() }, [date])

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); editor.undo() }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); editor.redo() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selectedSlotId) {
        e.preventDefault(); editor.dispatch({ type: 'DELETE_SLOT', slotId: editor.selectedSlotId })
        editor.setSelectedSlotId(null)
      }
      if (e.key === 'Escape') { editor.setSelectedSlotId(null); closeMenu() }
      if (e.ctrlKey && e.key === 'd' && editor.selectedSlot) {
        e.preventDefault()
        const s = editor.selectedSlot
        const endMs = new Date(s.plannedEndUtc!).getTime() + 30 * 60000
        editor.dispatch({ type: 'DUPLICATE_SLOT', sourceSlotId: s.id, newChannelId: s.channelId, newStartUtc: new Date(endMs).toISOString() })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor, closeMenu])

  const handleEmptyClick = useCallback((channelId: number, hour: number) => {
    const h = Math.floor(hour)
    const m = Math.round((hour - h) * 60)
    const base = new Date(`${date}T00:00:00Z`)
    base.setUTCHours(h, m, 0, 0)
    const end = new Date(base.getTime() + 120 * 60000) // 2h default
    editor.dispatch({
      type: 'CREATE_SLOT',
      data: {
        id: `draft-${Date.now()}`, channelId,
        plannedStartUtc: base.toISOString(), plannedEndUtc: end.toISOString(),
        schedulingMode: 'FIXED', status: 'PLANNED', overrunStrategy: 'EXTEND',
        bufferBeforeMin: 15, bufferAfterMin: 10, anchorType: 'FIXED_TIME',
        contentSegment: 'FULL', sportMetadata: {}, tenantId: '',
      },
    })
  }, [date, editor])

  const handleDragStart = useCallback((e: React.MouseEvent, slotId: string, type: 'move' | 'resize') => {
    const slot = editor.computedSlots.find(s => s.id === slotId)
    if (!slot) return
    const target = e.currentTarget as HTMLElement
    startDrag(e, slotId, type, slot.channelId, channels.map(c => c.id), 160, 0, target.closest('[data-slot-block]') as HTMLElement || target)
  }, [editor.computedSlots, channels, startDrag])

  const handleValidate = useCallback(async () => {
    setValidating(true)
    const results = await editor.validate()
    setValidating(false)
    const errors = results.filter((r: any) => r.severity === 'ERROR')
    if (errors.length === 0) toast.success('Validation passed')
    else toast.warning(`${errors.length} error(s) found`)
  }, [editor, toast])

  const handlePublish = useCallback(async () => {
    setPublishing(true)
    const ok = await editor.publish()
    setPublishing(false)
    if (ok) fetchData()
  }, [editor, fetchData])

  const localDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const prevDay = () => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 1); setDate(localDateStr(d)) }
  const nextDay = () => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + 1); setDate(localDateStr(d)) }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold font-head">Schedule</h1>
          <p className="text-xs text-text-3 mt-0.5">Broadcast schedule editor</p>
        </div>
        <div className="flex gap-1 border border-border rounded-lg p-0.5 bg-surface-2 w-fit">
          <button onClick={() => setActiveTab('grid')} className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === 'grid' ? 'bg-surface text-text shadow-sm' : 'text-text-3 hover:text-text-2'}`}>
            <Grid2X2 className="w-3.5 h-3.5" /> Grid
          </button>
          <button onClick={() => setActiveTab('cascade')} className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === 'cascade' ? 'bg-surface text-text shadow-sm' : 'text-text-3 hover:text-text-2'}`}>
            <Activity className="w-3.5 h-3.5" /> Cascade
          </button>
        </div>
      </div>

      {activeTab === 'grid' ? (
        <>
          <ScheduleToolbar
            date={date} onPrevDay={prevDay} onNextDay={nextDay} onToday={() => setDate(localDateStr(new Date()))} onDateChange={setDate}
            timezone={timezone} onTimezoneChange={setTimezone}
            canUndo={editor.canUndo} canRedo={editor.canRedo} onUndo={editor.undo} onRedo={editor.redo}
            draft={activeDraft} operationCount={editor.operations.length}
            onValidate={handleValidate} onPublish={handlePublish}
            validating={validating} publishing={publishing}
          />

          {loading ? (
            <div className="h-96 bg-surface-2 rounded-xl animate-pulse" />
          ) : channels.length === 0 ? (
            <div className="text-center py-20 text-text-3">
              <p className="text-sm">No channels configured yet.</p>
              <p className="text-xs mt-1">Add channels in Settings → Organisation</p>
            </div>
          ) : (
            <ScheduleGrid
              channels={channels}
              slots={editor.computedSlots}
              selectedSlotId={editor.selectedSlotId}
              validationBySlot={editor.validationBySlot}
              onSlotClick={editor.setSelectedSlotId}
              onSlotDoubleClick={editor.setSelectedSlotId}
              onSlotContextMenu={openMenu}
              onSlotDragStart={handleDragStart}
              onEmptyClick={handleEmptyClick}
            />
          )}
        </>
      ) : (
        <CascadeDashboard date={date} onDateChange={setDate} onSwitchAction={setSwitchAlert} />
      )}

      {editor.selectedSlot && (
        <SlotEditorPanel
          slot={editor.selectedSlot}
          validations={editor.validationBySlot.get(editor.selectedSlotId!) || []}
          onDispatch={editor.dispatch}
          onDelete={slotId => { editor.dispatch({ type: 'DELETE_SLOT', slotId }); editor.setSelectedSlotId(null) }}
          onClose={() => editor.setSelectedSlotId(null)}
        />
      )}

      {menu && (
        <SlotContextMenu
          x={menu.x} y={menu.y}
          onEdit={() => { editor.setSelectedSlotId(menu.slotId); closeMenu() }}
          onDelete={() => { editor.dispatch({ type: 'DELETE_SLOT', slotId: menu.slotId }); closeMenu() }}
          onDuplicate={() => {
            const s = editor.computedSlots.find(sl => sl.id === menu.slotId)
            if (s) {
              const endMs = new Date(s.plannedEndUtc!).getTime() + 30 * 60000
              editor.dispatch({ type: 'DUPLICATE_SLOT', sourceSlotId: s.id, newChannelId: s.channelId, newStartUtc: new Date(endMs).toISOString() })
            }
            closeMenu()
          }}
          onCopyTime={() => {
            const s = editor.computedSlots.find(sl => sl.id === menu.slotId)
            if (s?.plannedStartUtc) navigator.clipboard.writeText(new Date(s.plannedStartUtc).toISOString())
            closeMenu()
          }}
        />
      )}

      {switchAlert && <SwitchConfirmModal alert={switchAlert} onClose={() => setSwitchAlert(null)} onConfirmed={fetchData} />}
    </div>
  )
}
```

- [ ] **Step 2: Run TS check (frontend + backend)**

Run: `npx tsc --noEmit && cd backend && npx tsc --noEmit`

- [ ] **Step 3: Run full test suite**

Run: `cd backend && npx vitest run`
Expected: all existing tests still pass (143/143)

- [ ] **Step 4: Commit**

```bash
git add src/pages/ScheduleView.tsx src/components/schedule/ScheduleGrid.tsx
git commit -m "feat(schedule): rewrite ScheduleView as interactive editor with all 10 interactions"
```

---

## Phase 5: Final Verification

### Task 11: Full TypeScript check and test run

- [ ] **Step 1: Backend TS check**

Run: `cd backend && npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 2: Frontend TS check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && npx vitest run`
Expected: all tests pass (143+ including new scheduleOperations tests)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Rich Schedule Editor — complete implementation

Interactive scheduling workstation with drag-to-move/resize, draft
operations model, undo/redo, inline validation, and keyboard shortcuts.
Pure DOM grid, slot-only mutations (events untouched)."
```
