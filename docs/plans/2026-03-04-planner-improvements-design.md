# Planner Improvements — Design Document
**Date:** 2026-03-04
**Status:** Approved
**Scope:** Three groups of improvements to PlannerView, delivered in sequence.

---

## Group 1 — Missing Features

### 1. Conflict Visualization

On week load, fire `POST /api/events/conflicts/bulk` with the IDs of all events currently in view. The endpoint returns `{ [eventId]: ConflictWarning[] }`. Event cards with one or more conflicts render a small ⚠️ badge. Clicking the badge opens an inline popover listing the conflict details — reusing the existing `ConflictWarning` type from `conflictService`.

**New backend endpoint:** `POST /api/events/conflicts/bulk`
- Body: `{ eventIds: number[] }`
- Returns: `Record<number, ConflictWarning[]>`
- Implementation: loop existing `checkConflicts()` per event, return map

**Frontend:**
- Call on week change (after events load)
- Store result in local `conflictMap` state in PlannerView
- Event card: show ⚠️ badge if `conflictMap[event.id]?.length > 0`
- Badge click: popover with conflict list

---

### 2. Bulk Operations

A **Select toggle** in the planner header switches the calendar into selection mode. In selection mode, event cards show checkboxes. Selecting one or more events reveals a **floating action bar** at the bottom of the viewport.

**Action bar actions:**
| Action | Input | Backend |
|--------|-------|---------|
| Delete | Confirm dialog | `DELETE /api/events/bulk` |
| Change status | Dropdown (draft→cancelled) | `PATCH /api/events/bulk/status` |
| Reschedule | ±N days number input | `PATCH /api/events/bulk/reschedule` |
| Assign channel | Dropdown from orgConfig.channels | `PATCH /api/events/bulk/assign` |
| Assign sport | Dropdown from sports list | `PATCH /api/events/bulk/assign` |
| Assign competition | Dropdown from competitions list | `PATCH /api/events/bulk/assign` |

**New backend endpoints (all require `authenticate` + `authorize('planner','admin')`):**
- `DELETE /api/events/bulk` — body: `{ ids: number[] }`
- `PATCH /api/events/bulk/status` — body: `{ ids: number[], status: EventStatus }`
- `PATCH /api/events/bulk/reschedule` — body: `{ ids: number[], shiftDays: number }`
- `PATCH /api/events/bulk/assign` — body: `{ ids: number[], field: 'linearChannel'|'sportId'|'competitionId', value: string|number }`

Each endpoint validates with Joi, runs in a Prisma transaction, emits socket events, and dispatches publish webhooks.

**Frontend state:**
- `selectionMode: boolean` — toggles checkbox visibility
- `selectedIds: Set<number>` — tracks checked events
- Exiting selection mode clears `selectedIds`

---

### 3. Undo for Drag-Reschedule

After a successful drag, the toast changes from "Event updated" to **"Moved to [Day D Mon] · Undo"** with a 5-second auto-dismiss. Clicking Undo calls `eventsApi.update()` with the original `startDateBE`, reverts both local and global state.

**Implementation:**
- Add `lastDrag: { eventId: number, previousDate: string } | null` ref in PlannerView
- On successful drag: set `lastDrag`, show undo toast
- On Undo click: call update with `previousDate`, clear `lastDrag`
- Toast dismiss / new drag: clear `lastDrag`
- Single-level only — only the most recent drag is undoable

---

## Group 2 — Technical Debt

### Dual Event State Consolidation

**Problem:** PlannerView maintains `realtimeEvents` (local) mirroring `events` (global context). Socket updates go to local state; optimistic updates touch both; the sync `useEffect` can overwrite in-flight optimistic changes.

**Fix:**
1. Add `applyOptimisticEvent(patch: Partial<Event> & { id: number })` and `revertOptimisticEvent(id: number)` to `AppProvider` context.
2. Internally, `AppProvider` stores an `optimisticPatches: Map<number, Partial<Event>>` in a ref. Consumers read a derived `events` array that merges base events with patches.
3. Move the three socket handlers (`event:created`, `event:updated`, `event:deleted`) from PlannerView into `AppProvider` — all pages benefit.
4. Remove `realtimeEvents` state and its sync `useEffect` from PlannerView. All reads use context `events` directly.
5. Update `PlannerView.dnd.test.tsx` to test against context instead of local state.

---

## Group 3 — UX Friction

### 1. Read-only Detail Panel

Clicking an event opens a **slide-in right panel** (not a modal). The panel shows all event fields read-only: sport, competition, participants, date/time, channels, status, duration, crew summary, custom fields. An **Edit** button opens the existing `DynamicEventForm` modal. The calendar stays visible and navigable while the panel is open.

**Component:** `src/components/planner/EventDetailPanel.tsx`
- Props: `event: Event | null`, `onClose: () => void`, `onEdit: (event: Event) => void`
- Positioned: fixed right panel, `w-80`, slides in with CSS transition
- Shows: sport icon, competition name, participants, date/time, status badge, all channel fields, duration, tech plan count

### 2. Date Jump

The week navigation bar gets a native `<input type="week">` between the prev/next arrows. Selecting a date computes `weekOffset` relative to today's Monday. Keyboard shortcut `T` jumps to today (sets `weekOffset = 0`).

### 3. Saved Views Completeness

`SavedView.filters` expands from `{ channelFilter: string }` to:
```typescript
{ channelFilter: string; calendarMode: 'calendar' | 'list' }
```
Backend schema unchanged (filters stored as JSON). Frontend save/load updated to include `calendarMode`.

### 4. Search Bar

A search `<input>` in the planner header filters the events list client-side. Matches against `participants`, `sport.name`, `competition.name`, `linearChannel`. Filtering happens in the existing `weekEvents` memo. Clears on week navigation. No backend change required.

### 5. Auto-scroll to Newly Created Event

After `handleSaveEvent` resolves on a **create** (not update), compute the target week offset from `created.startDateBE` and call `setWeekOffset(targetOffset)`. The calendar navigates automatically to the new event's week.

---

## Delivery Order

1. Group 1 (Missing Features) — conflict bulk endpoint → bulk ops backend → bulk ops frontend → undo toast
2. Group 2 (Technical Debt) — AppProvider optimistic API → migrate PlannerView → update tests
3. Group 3 (UX Friction) — detail panel → date jump → saved views → search → auto-scroll
