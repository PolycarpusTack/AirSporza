---
title: "Planner: Event Locking, Readiness Checklist, Vertical Drag Reschedule"
type: feat
date: 2026-03-06
---

# Planner: Event Locking, Readiness Checklist, Vertical Drag Reschedule

## Overview

Three targeted improvements to the Planner calendar view:

1. **Event locking / freeze windows** — prevent accidental edits on approved or near-air events
2. **Readiness checklist** — at-a-glance completeness indicators on each event card
3. **Vertical drag reschedule + resize** — drag to change start time, drag bottom edge to change duration

These are ordered by dependency: locking is foundational (features 2 and 3 must respect it), readiness is read-only and low-risk, vertical drag is the most complex.

## Key Design Decisions

- **Lock is soft**: admin override with confirmation, not a hard block. Forward status transitions (`approved -> published -> live -> completed`) bypass the lock.
- **Freeze window**: global `freezeWindowHours` in org config. Events within N hours of air time auto-lock regardless of status.
- **Readiness is client-side**: computed from data already in context (techPlans, contracts, events). No new API endpoint — avoids backend coupling.
- **Vertical drag uses raw pointer events** (like `useDrawToCreate`), NOT `@dnd-kit`. Direction detection: first 8px of movement determines vertical (time) vs horizontal (day) drag.
- **Resize updates `duration`** in SMPTE format via new `minutesToSmpte()` utility. Vertical drag updates `linearStartTime` (broadcast time), leaving `startTimeBE` (match time) unchanged.

---

## Phase 1: Event Locking / Freeze Windows

### Task 1.1 — `isEventLocked` utility + types

**File**: `src/utils/eventLock.ts` (new)

Create a shared utility:

```typescript
interface LockResult {
  locked: boolean
  reason: 'status' | 'freeze' | null
  canOverride: boolean  // true for admin role
}

function isEventLocked(event: Event, freezeWindowHours: number, userRole?: string): LockResult
```

Logic:
- `completed` / `cancelled` → locked, NO override (terminal states)
- `approved` / `published` / `live` → locked, override for admin
- Freeze window: `startDateBE + startTimeBE` minus now < `freezeWindowHours` → locked, override for admin
- `draft` / `ready` outside freeze → not locked

**Types change** in `src/data/types.ts`:
- Add `freezeWindowHours?: number` to `OrgConfig`

**Default**: `src/data/index.ts` → `DEFAULT_ORG_CONFIG.freezeWindowHours = 3`

### Task 1.2 — Lock enforcement across all edit paths

**Files to modify** (all add `isEventLocked` checks):

| File | What to gate |
|------|-------------|
| `PlannerView.tsx` line ~199 `DraggableEventCard` | Extend disabled check: `isEventLocked(event, ...).locked` |
| `PlannerView.tsx` `buildEventMenuItems()` | Disable edit/delete/status-change items when locked (keep "View Details") |
| `PlannerView.tsx` `handleDragEnd()` | Early return if locked |
| `BulkActionBar.tsx` | Pre-flight dialog: "N of M events are locked and will be skipped" |
| `EventDetailPanel.tsx` status dropdown | Disable backward transitions when locked; allow forward transitions |
| `App.tsx` `showEventForm` | Pass `readOnly` prop when event is locked + user is not admin |
| `DynamicEventForm.tsx` | Accept `readOnly?: boolean` prop, disable all inputs + show lock banner |

**Admin override pattern**: When an admin clicks a gated action on a locked event, show a confirmation:
> "This event is locked (approved / within freeze window). Changes may disrupt operations. Continue?"

On confirm, proceed normally. No state change needed — the override is per-action, not persisted.

### Task 1.3 — Lock visual indicators on calendar cards

**File**: `PlannerView.tsx` calendar event card rendering (~line 1374)

- Import `Lock` from `lucide-react`
- If locked: add `border-l-2 border-warning/60` to card (replaces sport-color left border)
- If card height > 30px: render `<Lock className="w-3 h-3 text-warning/70" />` in top-right corner
- If card height <= 30px: apply a subtle `opacity-80` + `bg-warning/5` to indicate locked state

**Context menu**: Show lock icon next to disabled items with tooltip "Event is locked"

### Task 1.4 — Freeze window configuration in Admin

**File**: `src/components/admin/OrgConfigPanel.tsx`

Add a "Freeze Window" field to the org config panel:
- Label: "Auto-lock events within"
- Input: number field (hours) with suffix "hours of air time"
- Default: 3
- Range: 0–72 (0 = disabled)
- Persists via existing `settingsApi.updateOrgConfig()`

---

## Phase 2: Readiness Checklist

### Task 2.1 — `computeReadiness` utility

**File**: `src/utils/eventReadiness.ts` (new)

```typescript
type CheckStatus = 'pass' | 'fail' | 'na'

interface ReadinessCheck {
  key: string
  label: string
  status: CheckStatus
}

interface ReadinessResult {
  checks: ReadinessCheck[]
  score: number   // count of pass
  total: number   // count of pass + fail (excludes na)
  ready: boolean  // score === total
}

function computeReadiness(
  event: Event,
  techPlans: TechPlan[],
  contracts: Contract[],
  crewFields: FieldConfig[]
): ReadinessResult
```

**Checks**:

| Key | Label | Pass | Fail | N/A |
|-----|-------|------|------|-----|
| `techPlan` | Tech Plan | `plans.length > 0` | no plans | — |
| `crew` | Crew Assigned | all required `crewFields` have values in ALL plans | any required field empty | no plans exist |
| `contract` | Rights / Contract | competition has contract with `status !== 'none'` | no contract or expired | competition has no contract record |
| `channel` | Channel | `linearChannel \|\| onDemandChannel \|\| radioChannel` | none set | — |
| `duration` | Duration | `duration` is truthy | empty/null | — |

### Task 2.2 — Readiness indicator on calendar event cards

**File**: `PlannerView.tsx` calendar card rendering

Add readiness dots to event cards — compact colored dots that show at a glance:

- **Card height > 50px**: Show dot row below participant name — one dot per check, colored green (pass) / red (fail) / gray (na)
- **Card height 30–50px**: Single summary dot — green (all pass), amber (partial), red (any fail)
- **Card height < 30px**: No indicator (too small)

The dots use existing design token colors:
- Pass: `bg-success` (green)
- Fail: `bg-danger` (red)
- N/A: `bg-text-3/30` (gray)

### Task 2.3 — Readiness checklist in EventDetailPanel

**File**: `src/components/planner/EventDetailPanel.tsx`

Add a "Readiness" section below event details:

```
Readiness  3/4
─────────────────
✓ Tech Plan        Camera Plan, Commentary Plan
✓ Crew Assigned    8/8 roles filled
✗ Channel          No channel assigned
✓ Duration         01:45:00;00
— Contract         N/A (friendly match)
```

Each row: icon (✓/✗/—) + label + detail text. Clicking a failing check could scroll to the relevant edit section (deferred).

### Task 2.4 — Readiness filter chip

**File**: `PlannerView.tsx` filter controls (~line 855)

Add a filter dropdown alongside existing sport/competition/status filters:

```
All readiness ▾  →  All | Ready | Not Ready | Partial
```

Implementation: compute readiness for each `filteredWeekEvent` and filter in `useMemo`. Since readiness is derived from data already in memory, this is cheap.

---

## Phase 3: Vertical Drag Reschedule + Resize

### Task 3.1 — `useVerticalDrag` hook

**File**: `src/hooks/useVerticalDrag.ts` (new)

A pointer-event based hook (same pattern as `useDrawToCreate`) for vertical time rescheduling:

```typescript
interface VerticalDragResult {
  isDragging: boolean
  eventId: number | null
  previewStartMin: number | null  // minutes from midnight
  previewEndMin: number | null
  mode: 'move' | 'resize' | null
}

function useVerticalDrag(opts: {
  enabled: boolean
  calStartHour: number
  calEndHour: number
  pxPerHour: number
  isLocked: (eventId: number) => boolean
  onComplete: (eventId: number, newStartMin: number, newDurationMin: number) => void
}): VerticalDragResult
```

**Interaction model**:
- `onPointerDown` on `[data-event-card]`: record anchor point (eventId, initial Y, initial startMin, initial durationMin)
- Detect mode: if pointer is within bottom 8px of the card → `resize` mode; else → `move` mode
- `onPointerMove`: compute delta in minutes (snapped to 5min), update preview
- `onPointerUp`: fire `onComplete` with final values
- Clamp: start >= `calStartHour * 60`, end <= `calEndHour * 60`
- Use `setPointerCapture` for reliable tracking (like `useDrawToCreate`)
- Store anchor in ref (not state) per the established ref-mirroring pattern

**Resize cursor**: Set `cursor: ns-resize` on hover when pointer is within bottom 8px of `[data-event-card]`.

### Task 3.2 — Direction-detection sensor for @dnd-kit coexistence

**File**: `PlannerView.tsx` sensor configuration

Replace the simple `PointerSensor` with a custom activation that detects initial direction:

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,
      // Only activate @dnd-kit when horizontal movement exceeds vertical
      tolerance: { x: 8 }  // Custom: require 8px horizontal before 8px vertical
    }
  })
)
```

If `@dnd-kit`'s `PointerSensor` doesn't support directional constraints natively, create a **custom sensor** that:
1. On pointer-down, records origin
2. On pointer-move, measures dx vs dy
3. If `|dx| > 8` before `|dy| > 8` → activate @dnd-kit (horizontal day-to-day drag)
4. If `|dy| > 8` before `|dx| > 8` → do NOT activate @dnd-kit (let `useVerticalDrag` handle it)

This approach cleanly separates the two drag systems without modifier keys or separate handles.

### Task 3.3 — `minutesToSmpte` utility

**File**: `src/utils/index.ts` (add to existing utils)

```typescript
function minutesToSmpte(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00;00`
}
```

Used when converting resize result back to duration format.

### Task 3.4 — Drag preview rendering

**File**: `PlannerView.tsx` calendar grid

During vertical drag, render a ghost overlay:

- **Move mode**: translucent copy of the card at the preview position. Original card stays in place with reduced opacity.
- **Resize mode**: original card with its bottom edge extended/contracted to preview position. Show duration label updating in real-time.
- Ghost uses `position: absolute` within the day column, same width as the original card
- Style: `bg-primary/10 border border-primary/30 rounded` with the event name inside
- No live overlap recalculation during drag (too expensive). Recalculate on drop.

### Task 3.5 — Wire vertical drag + resize into PlannerView

**File**: `PlannerView.tsx`

1. Initialize `useVerticalDrag` with:
   - `enabled: !selectionMode`
   - `isLocked`: uses `isEventLocked` from Phase 1
   - `onComplete`: optimistic update → API call → undo bar

2. `onComplete` handler:
   - For **move**: update `linearStartTime` (or `startTimeBE` if `linearStartTime` is empty)
   - For **resize**: update `duration` via `minutesToSmpte()`
   - Extend `lastDragRef` to store previous time/duration for undo
   - Show `UndoBar` with "Rescheduled to HH:MM" or "Duration changed to Xh Ym"

3. Event card changes:
   - Add `data-event-id={ev.id}` attribute for the hook to identify which event
   - Add `data-event-start-min` and `data-event-duration-min` attributes for the hook to read initial values without prop drilling
   - Add `data-event-bottom` detection zone: when pointer is within bottom 8px, add `cursor-ns-resize` class

4. Lock integration: `useVerticalDrag` calls `isLocked(eventId)` on pointer-down and early-returns if locked.

### Task 3.6 — Undo support for vertical operations

**File**: `PlannerView.tsx`

Extend the existing undo mechanism:

```typescript
const lastDragRef = useRef<{
  eventId: number
  previousDate?: string        // existing: for horizontal drag
  previousTime?: string        // new: for vertical drag
  previousDuration?: string    // new: for resize
} | null>(null)
```

`UndoBar` message:
- Horizontal: "Moved to Mon 5 Mar"
- Vertical: "Rescheduled to 14:30"
- Resize: "Duration changed to 1h 45m"

Undo calls `eventsApi.update()` with the previous values.

---

## Acceptance Criteria

### Locking
- [ ] Events with status `approved`/`published`/`live` cannot be edited, dragged, or deleted by non-admin users
- [ ] Events within `freezeWindowHours` of air time are auto-locked regardless of status
- [ ] Admin users see override confirmation dialog on locked events
- [ ] `completed`/`cancelled` events are permanently locked (no override)
- [ ] Forward status transitions bypass the lock (approved→published→live→completed)
- [ ] Bulk operations show pre-flight dialog listing skipped locked events
- [ ] Lock icon visible on calendar cards for locked events
- [ ] Freeze window configurable in Admin (0–72 hours, default 3)

### Readiness
- [ ] Each event card shows readiness dots (green/red/gray) when height allows
- [ ] EventDetailPanel shows full checklist with pass/fail/na per check
- [ ] 5 checks: tech plan, crew assigned, contract/rights, channel, duration
- [ ] Events without applicable contracts show "N/A" (not failing)
- [ ] Readiness filter chip in planner controls (All/Ready/Not Ready/Partial)

### Vertical Drag
- [ ] Drag event card body vertically to change start time (5-min snap)
- [ ] Drag event card bottom edge to resize duration (5-min snap, 15-min minimum)
- [ ] Horizontal drag (day-to-day) still works — direction detected by first 8px of movement
- [ ] Ghost preview during drag shows target position
- [ ] Locked events cannot be dragged or resized
- [ ] Undo bar appears after drag/resize with revert option
- [ ] Duration saved in SMPTE format after resize
- [ ] Calendar bounds enforced (08:00–23:00 clamp)

---

## Files Changed Summary

### New Files
| File | Purpose |
|------|---------|
| `src/utils/eventLock.ts` | `isEventLocked()` utility |
| `src/utils/eventReadiness.ts` | `computeReadiness()` utility |
| `src/hooks/useVerticalDrag.ts` | Vertical drag + resize hook |

### Modified Files
| File | Changes |
|------|---------|
| `src/data/types.ts` | Add `freezeWindowHours` to OrgConfig |
| `src/data/index.ts` | Default freeze window = 3 |
| `src/pages/PlannerView.tsx` | Lock checks, readiness dots, vertical drag wiring, direction sensor, undo extension |
| `src/components/planner/EventDetailPanel.tsx` | Readiness checklist section |
| `src/components/planner/BulkActionBar.tsx` | Lock-aware pre-flight dialog |
| `src/components/forms/DynamicEventForm.tsx` | `readOnly` prop + lock banner |
| `src/components/admin/OrgConfigPanel.tsx` | Freeze window hours setting |
| `src/utils/index.ts` | `minutesToSmpte()` helper |
| `src/App.tsx` | Pass readOnly to form when locked |

---

## Implementation Order

```
Phase 1 (Locking)  →  Phase 2 (Readiness)  →  Phase 3 (Vertical Drag)
   1.1  types + utility         2.1  utility           3.1  hook
   1.2  enforcement             2.2  card dots          3.2  direction sensor
   1.3  card visuals            2.3  detail panel       3.3  smpte utility
   1.4  admin config            2.4  filter chip        3.4  preview rendering
                                                        3.5  wiring
                                                        3.6  undo
```

Each phase can be committed independently. Phase 3 benefits from Phase 1 being in place (lock checks during drag).

## Open Questions (Deferred)

- Server-side lock enforcement (backend middleware returning 423) — currently frontend-only
- Per-sport freeze window overrides
- Per-sport/plan-type readiness profiles (which checks apply)
- Multi-select vertical drag (shift all selected events by same time delta)
- Notifications for "not ready" events approaching air time
