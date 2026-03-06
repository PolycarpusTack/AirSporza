# Planning Tab Enhancements — Design

## Goal
Give planners a faster workflow on the Planning tab: right-click context menus, event duplication, lock/pin protection, enriched detail panel, and richer saved views.

## Phasing

**Phase A (frontend-only, do first):**
1. ContextMenu component
2. Context menu wiring in PlannerView (calendar + list)
3. Duplicate event flow with clipboard
4. Enhanced EventDetailPanel (quick actions, tech plan links, conflict clicks)
5. Richer saved views (sport, competition, status, search, week offset)

**Phase B (requires migration):**
6. Lock/pin mechanism (isLocked field, soft lock with override)

## 1. ContextMenu Component

**New file:** `src/components/planner/ContextMenu.tsx`

Generic positioned menu rendered as a fixed div (z-50). Repositions near viewport edges. Dismisses on click-outside, Escape, or scroll.

**Menu item types:**
```
{ type: 'action', label, icon?, onClick, danger?, disabled? }
{ type: 'submenu', label, icon?, children: MenuItem[] }
{ type: 'separator' }
```

**Styling:** `bg-surface border border-border rounded-lg shadow-lg`. Items: `hover:bg-surface-2`. Danger items: `text-danger`. Submenus open to the right on hover.

## 2. Context Menu Wiring

**State in PlannerView:**
```typescript
const [ctxMenu, setCtxMenu] = useState<{
  x: number; y: number
  event?: Event
  date?: string    // YYYY-MM-DD
  time?: string    // HH:MM
} | null>(null)
```

**Trigger points:**
- Event card (calendar): `onContextMenu` — sets event, date, time
- Empty day slot (calendar): `onContextMenu` — sets date, time (from click Y)
- List view row: `onContextMenu` — sets event, date

**Event card menu (7 items):**
1. Open details
2. Edit event
3. Duplicate (opens date picker)
4. Status -> submenu (draft/ready/approved/published/live/completed/cancelled)
5. Tech plan -> submenu (Open in Sports / Create plan)
6. Lock / Unlock (Phase B — hidden until isLocked field exists)
7. Delete (danger, with confirmation)

**Empty slot menu (3 items):**
1. Create event here (prefills date + time)
2. Create multi-day event (only if header days selected)
3. Paste event (only if clipboard has event)

**List view:** Same as event card menu, minus "Open details".

## 3. Duplicate Event Flow

**Trigger:** Context menu -> Duplicate on event card.

**Popover with 3 options:**
- "Tomorrow" quick button
- "Next week, same day" quick button
- Custom date input

**Behavior:**
- Calls `eventsApi.create()` with event copy (strips id, seriesId)
- Sets status to `draft` on the copy
- Keeps time, channel, sport, competition, duration, phase
- Shows toast: "Event duplicated to {date}"
- Copies event to in-memory clipboard ref (`useRef<Event | null>`)

**Paste on empty slot:** Creates copy at slot's date + time.

## 4. Enhanced EventDetailPanel

**Quick actions row** (below header):
- Status dropdown (inline select, no edit form needed)
- Lock/Unlock toggle (Phase B)
- Duplicate button

**Tech plan section:**
- Has plans: clickable list -> navigate to `/sports` with event selected
- No plans: "Create Tech Plan" button -> navigate to Sports workspace

**Conflict section:**
- Shows conflict warnings from conflictMap as clickable badges
- Click -> highlights overlapping event in calendar

## 5. Richer Saved Views

**Expanded PlannerFilterState:**
```typescript
export interface PlannerFilterState {
  channelFilter?: string
  calendarMode?: 'calendar' | 'list'
  sportFilter?: number
  competitionFilter?: number
  statusFilter?: string
  searchText?: string
  weekOffset?: number
}
```

**New filter dropdowns** in controls row:
- Sport filter (from sports list)
- Competition filter (from competitions list)
- Status filter (from event statuses)

Backend already stores arbitrary JSON — no migration needed. Save serializes all current filter values. Load applies all values including weekOffset.

## 6. Lock/Pin Mechanism (Phase B)

**Data model:**
- New `isLocked Boolean @default(false)` on Event
- Migration: `add_event_locked.sql`
- Frontend type: `isLocked?: boolean` on Event

**Behavior (soft lock with override):**
- Drag: disabled when locked (same as completed/cancelled)
- Context menu actions: show "This event is locked. Proceed anyway?" confirmation
- Toggle: `eventsApi.update(id, { isLocked: !event.isLocked })`

**Visual:**
- Lock icon overlay on calendar card (top-right)
- Lock icon in list view row
- `border-2 border-warning/40` on locked cards
- Lock status + toggle in EventDetailPanel

## Access Control
- All context menu actions respect existing `canEdit` / role patterns
- Read-only users see "Open details" only

## Not Included (deferred)
- Time drag/resize — high complexity, conflicts with draw-to-create + DnD
- Undo for bulk actions — bulk actions already have confirmation dialogs
- Block slot / quick note — new data model, niche use case
