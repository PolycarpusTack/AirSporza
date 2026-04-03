---
title: "feat: Rich Schedule Editor"
type: feat
date: 2026-04-03
---

# Rich Schedule Editor — Design Spec

**Goal:** Transform the ScheduleView from a monitoring/validation surface into a rich interactive scheduling workstation where broadcast planners can create, move, resize, and delete broadcast slots directly on a channel×time grid, with full undo/redo and draft-based publishing.

**Approach:** Pure DOM grid (React + CSS absolute positioning), draft operations model for all edits, slot-only mutations (events untouched).

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Target persona | Both dedicated schedulers and planners | Tool supports creating slots from scratch AND pulling in existing events |
| Edit persistence | Draft operations (not direct mutation) | Broadcast is high-stakes; all edits accumulate in draft, nothing persists until publish |
| Time display | Single configurable timezone with UTC toggle | Simpler than per-channel zones; defaults to org primary timezone |
| Grid implementation | Pure DOM (React + CSS positioning) | Matches existing codebase patterns (useDrawToCreate), full control, zero deps |
| Event↔Slot coupling | Slot only — events untouched | Broadcast timing is independent of event timing (delayed broadcasts, replays, simulcasts) |

## V1 Interactions

All ten are in scope for V1:

1. **Click empty area** → create slot (opens editor panel at that time/channel)
2. **Click existing slot** → select and show editor panel
3. **Drag slot vertically** → move in time (same channel), 5-min snap
4. **Drag slot horizontally** → move to different channel
5. **Drag slot bottom edge** → resize duration, 5-min snap
6. **Double-click** → quick edit inline
7. **Right-click context menu** → Edit, Delete, Duplicate, Copy Time
8. **Multi-select** (Shift+click) → bulk operations
9. **Undo/Redo** → Ctrl+Z / Ctrl+Y via operation stack
10. **Validation indicators** → red border (ERROR), yellow border (WARNING) per slot

## Operation Model

Every edit produces an immutable operation record. Operations accumulate in the draft until publish.

### Operation Types

```typescript
type ScheduleOperation =
  | { type: 'CREATE_SLOT'; data: SlotCreatePayload }
  | { type: 'UPDATE_SLOT'; slotId: string; changes: Partial<SlotUpdatePayload> }
  | { type: 'MOVE_SLOT'; slotId: string; newChannelId?: number; newStartUtc: string; newEndUtc: string }
  | { type: 'RESIZE_SLOT'; slotId: string; newEndUtc: string }
  | { type: 'DELETE_SLOT'; slotId: string }
  | { type: 'DUPLICATE_SLOT'; sourceSlotId: string; newChannelId: number; newStartUtc: string } // defaults: same channel, 30min after source end
```

### Data Flow (drag-to-move example)

1. Planner drags slot → mouseup fires at new position
2. `useSlotDrag` hook computes snapped time from pixel offset
3. `MOVE_SLOT` operation created with new channel/time
4. `useScheduleEditor` appends operation to local array (optimistic)
5. Grid re-renders immediately from computed slot positions
6. `PATCH /schedule-drafts/:id` sent with version + new operations
7. On 409 (version conflict): toast, refetch draft, rebase local operations
8. Undo: pop last operation from stack, push to redo stack, recompute positions

### Computed State

Slot positions are always computed, never stored during editing:

```
computedSlots = baseSlots (from last publish or empty)
  |> apply(operation[0])
  |> apply(operation[1])
  |> ...
  |> apply(operation[n])
```

This makes undo/redo trivial and ensures validation always runs against the full computed state.

## Grid Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ScheduleToolbar                                              │
│ [← Prev] Thu 15 Mar 2026 [Next →]  [CET ▾]  [↶][↷]  Draft │
│                                      v3 • 4 ops  [Validate] │
│                                                   [Publish]  │
├────┬──────────┬──────────┬──────────┬────────────────────────┤
│Time│ Sporza 1 │ Sporza 2 │ Sporza X │   SlotEditorPanel     │
│    │          │          │          │                        │
│0600│          │          │          │   Event: [search]      │
│    │┌────────┐│          │          │   Start: [14:00]       │
│0800││Morning ││          │          │   Duration: [120]      │
│    ││Recap   ││          │          │   Mode: [FLOATING ▾]   │
│1000│└────────┘│┌────────┐│          │   Strategy: [EXTEND ▾] │
│    │          ││Tennis  ││          │   Buffer: [15] [10]    │
│1200│          ││Roland  ││          │                        │
│    │          ││Garros  ││          │   ⚠ OVERLAP_PROBABLE   │
│1400│┌────────┐│└────────┘│          │   Estimated end may    │
│    ││Football││          │          │   overlap Evening News │
│1600││AND-CLB ││┌────────┐│          │                        │
│    │└────────┘││Cycling ││          │   [Save]    [Delete]   │
│1800│┌────────┐│└────────┘│          │                        │
│    ││Evening ││          │          │                        │
│    ││News    ││          │          │                        │
│2000│└────────┘│          │          │                        │
└────┴──────────┴──────────┴──────────┴────────────────────────┘
```

### Slot Card Rendering

Each slot block shows:
- Event name (bold, truncated)
- Time range + scheduling mode label
- Confidence bar for FLOATING/WINDOW slots (green = high, red = low)
- Validation badge: ⚠ (WARNING, yellow border) or ✕ (ERROR, red border)
- Bottom resize handle (4px high, `cursor: ns-resize`)
- Overrun strategy icon (if not EXTEND)

### Pixel Scaling

- 30px per hour (720px for 24h view, scrollable)
- 5-minute snap grid = 2.5px increments
- Minimum slot height = 15px (30 minutes)

## Component Architecture

### New Components

| Component | Purpose |
|-----------|---------|
| `ScheduleToolbar` | Date nav, timezone, undo/redo, draft info, validate/publish. Replaces DraftToolbar. |
| `ChannelColumn` | Single channel column — renders SlotBlocks, handles click-to-create on empty area |
| `SlotBlock` | Draggable/resizable slot card. Emits drag start/end, click, right-click events. |
| `DragGhost` | Semi-transparent preview following cursor during drag |
| `SlotEditorPanel` | Right panel form — event selector, timing, mode, strategy, buffers, validation inline |
| `SlotContextMenu` | Right-click menu — Edit, Delete, Duplicate, Copy Time |
| `TimeGutter` | Left column with hour labels |

### Modified Components

| Component | Change |
|-----------|--------|
| `ScheduleView` | Wire up `useScheduleEditor`, replace DraftToolbar with ScheduleToolbar, add SlotEditorPanel |
| `ScheduleGrid` | Rewrite — becomes a container for TimeGutter + ChannelColumns, handles multi-select |

### New Hooks

| Hook | Responsibility |
|------|---------------|
| `useScheduleEditor(draftId)` | Core state machine — operations array, undo/redo stacks, computed slot positions, optimistic server sync, validation state |
| `useSlotDrag()` | Mouse event handling for move/resize. Ref-based to avoid re-render per mousemove. Computes snapped position, emits MOVE_SLOT or RESIZE_SLOT on mouseup. |
| `useSlotContextMenu()` | Right-click position tracking + action dispatch |

### State Flow

```
useScheduleEditor (single source of truth)
  ├── operations: ScheduleOperation[]     ← all edits
  ├── undoStack: ScheduleOperation[][]    ← for undo
  ├── redoStack: ScheduleOperation[][]    ← for redo
  ├── computedSlots: BroadcastSlot[]      ← derived from base + operations
  ├── validationResults: Map<slotId, ValidationResult[]>
  ├── selectedSlotId: string | null
  ├── draftVersion: number                ← for optimistic locking
  │
  ├── dispatch(operation)                 → append to operations, clear redo, sync to server
  ├── undo()                              → pop last, push to redo, recompute
  ├── redo()                              → pop from redo, reapply, recompute
  ├── validate()                          → POST /validate against computed state
  └── publish()                           → POST /publish, reset operations on success
```

All grid components read from `useScheduleEditor`. All interactions write through it. No component calls the API directly.

## Backend Changes

### Existing (unchanged)

- `POST /broadcast-slots` — create slot
- `PUT /broadcast-slots/:id` — update slot
- `DELETE /broadcast-slots/:id` — delete slot
- `PATCH /schedule-drafts/:id` — append operations with optimistic locking
- `POST /schedule-drafts/:id/validate` — dry-run full validation
- `POST /schedule-drafts/:id/publish` — validate + create ScheduleVersion

### New

1. **Operation type definitions** — `backend/src/services/scheduleOperations.ts`
   - Typed discriminated union for 6 operation types
   - `applyOperations(baseSlots, operations)` — pure function that computes slot state
   - `executeOperations(tx, draftId, operations)` — applies operations to real BroadcastSlots in a transaction (called by publish)

2. **Inline slot validation** — `POST /schedule-drafts/:id/validate-slot`
   - Takes a single slot (or computed slot from operations)
   - Returns just that slot's validation results
   - Used by the editor panel for real-time feedback without running the full pipeline

3. **Regulatory validation** — `backend/src/services/validation/regulatory.ts`
   - `checkWatershedViolation(slots)` — ERROR if content flagged as `adult` or `mature` is scheduled before 21:00 in the channel's local timezone
   - `checkAccessibilityMissing(slots)` — WARNING if slot has no subtitles/audio-description metadata set (informational)

4. **Business validation** — `backend/src/services/validation/business.ts`
   - `checkSimultaneousOverrunRisk(slots)` — WARNING if 3+ FLOATING slots on different channels have overlapping estimated windows (resource contention risk)
   - `checkPrimeMatchLate(slots)` — WARNING if a premium competition's main event starts after 21:30 (audience risk)
   - `checkDstKickoffAmbiguous(slots)` — INFO during DST transition weekends, flags slots within the ambiguous hour

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo last operation |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Delete` / `Backspace` | Delete selected slot(s) |
| `Ctrl+D` | Duplicate selected slot |
| `Escape` | Deselect / close editor panel |
| `Ctrl+S` | Save editor panel changes (creates UPDATE_SLOT) |

## Scope Boundary

**In scope (V1):**
- All 10 grid interactions listed above
- Draft operations model with undo/redo
- Editor panel with full slot fields
- Validation indicators on slots
- Operation executor for publish
- Regulatory + business validation stubs filled
- Context menu
- Keyboard shortcuts

**Out of scope (later):**
- Per-channel timezone display
- Cascade "what-if" simulation
- Manual cascade override
- Drag from event list to grid (event→slot creation)
- Multi-day view
- Print/export schedule
- Collaborative editing (multiple planners on same draft)
