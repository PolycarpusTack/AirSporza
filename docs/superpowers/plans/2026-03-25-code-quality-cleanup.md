# Code Quality Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 1,854-line PlannerView into focused components, centralize duplicated utilities, add React.memo to list-item components, and standardize error handling across the frontend.

**Architecture:** Extract utilities first (dateTime, calendarLayout, apiError), then decompose PlannerView into 5 components + 2 hooks, add React.memo to high-frequency components, and sweep error handling last.

**Tech Stack:** React, TypeScript, @dnd-kit/core (existing)

**Spec:** `docs/superpowers/specs/2026-03-25-code-quality-cleanup-design.md`

---

## File Structure

### New files
```
src/utils/dateTime.ts            — Centralized date/time utilities (9 functions)
src/utils/calendarLayout.ts      — Calendar constants + layout functions
src/utils/apiError.ts            — handleApiError utility
src/components/planner/EventCard.tsx     — Single event card (React.memo)
src/components/planner/DayColumn.tsx     — Day column with DnD drop zone
src/components/planner/WeekHeader.tsx    — Date header row with drag selection
src/components/planner/TimeGutter.tsx    — Hour labels sidebar
src/components/planner/CalendarGrid.tsx  — Grid orchestrator (draw/drag state owner)
src/hooks/useCalendarNavigation.ts       — Date nav + saved views
src/hooks/useEventActions.ts             — Context menu CRUD callbacks
```

### Modified files
```
src/pages/PlannerView.tsx                    — Major reduction (1854 → ~500-550)
src/components/sports/ResourceTimeline.tsx    — Import from dateTime.ts
src/components/forms/RepeatSection.tsx        — Import from dateTime.ts
src/components/planner/DuplicatePopover.tsx   — Import from dateTime.ts
src/pages/ImportView.tsx                      — Import from dateTime.ts
src/components/sports/EventDetailCard.tsx     — Add React.memo
src/components/sports/TechPlanCard.tsx        — Add React.memo
src/pages/SportsWorkspace.tsx                 — Add useMemo, handleApiError
src/pages/ContractsView.tsx                   — handleApiError
src/pages/AdminView.tsx                       — handleApiError
src/components/settings/IntegrationsPanel.tsx — handleApiError
+ ~15 other files with silent catch blocks    — handleApiError or intentional comments
```

---

## Task 1: Create dateTime.ts Utility

**Files:**
- Create: `src/utils/dateTime.ts`

- [ ] **Step 1: Create the utility file**

Read each source file to get the exact implementations, then create `src/utils/dateTime.ts` with these functions extracted and deduplicated:

```typescript
// src/utils/dateTime.ts

/** Returns Monday 00:00 of the given date's week */
export function weekMonday(d: Date | number): Date {
  // If number, treat as week offset from today
  const base = typeof d === 'number' ? new Date() : new Date(d)
  if (typeof d === 'number') {
    const day = base.getDay()
    base.setDate(base.getDate() - (day === 0 ? 6 : day - 1) + d * 7)
  } else {
    const day = base.getDay()
    base.setDate(base.getDate() - (day === 0 ? 6 : day - 1))
  }
  base.setHours(0, 0, 0, 0)
  return base
}

/** Returns new Date offset by n days */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Returns YYYY-MM-DD string offset by n days (for string-based consumers) */
export function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return formatDateStr(d)
}

/** Returns YYYY-MM-DD string using local date (not toISOString to avoid timezone shift) */
export function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
// Alias for clarity
export const formatDateStr = dateStr

/** Extract YYYY-MM-DD from Date or ISO string */
export function getDateKey(date: Date | string): string {
  if (typeof date === 'string') return date.split('T')[0]
  return dateStr(date)
}

/** Parse HH:MM to minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Parse duration string to minutes. Returns fallback (default 90) if unparseable. */
export function parseDurationMin(duration?: string | null, fallback = 90): number {
  if (!duration) return fallback
  const n = Number(duration)
  if (!isNaN(n) && n > 0) return n
  const smpte = duration.match(/^(\d{1,2}):(\d{2}):(\d{2})[;:](\d{2})$/)
  if (smpte) return Number(smpte[1]) * 60 + Number(smpte[2])
  const hhmm = duration.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2])
  const match = duration.match(/(\d+)h\s*(\d+)?m?/)
  if (match) return Number(match[1]) * 60 + Number(match[2] || 0)
  return fallback
}

/** Relative time display (e.g., "2h ago", "3d ago") */
export function fmtAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Format date/time for UI display */
export function fmtDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
```

IMPORTANT: Read the actual implementations from PlannerView.tsx (lines 39-92), ResourceTimeline.tsx, RepeatSection.tsx, DuplicatePopover.tsx, and ImportView.tsx to get the exact behavior. The code above is a guide — match the existing logic precisely.

- [ ] **Step 2: Update consumers — remove local defs, add imports**

For each file that has duplicated functions:
1. Read the file
2. Identify which functions it defines locally
3. Remove the local definitions
4. Add `import { weekMonday, addDays, dateStr, ... } from '../utils/dateTime'`
5. For DuplicatePopover: replace `toDateStr` calls with `dateStr`, replace string-based `addDays` with `addDaysStr`

Files to update:
- `src/pages/PlannerView.tsx` — remove lines 39-92 (weekMonday, addDays, dateStr, getDateKey, timeToMinutes, parseDurationMin)
- `src/components/sports/ResourceTimeline.tsx` — remove local weekMonday, addDays, dateStr, timeToMinutes
- `src/components/forms/RepeatSection.tsx` — remove local addDaysToDate, replace with addDaysStr
- `src/components/planner/DuplicatePopover.tsx` — remove local toDateStr/addDays, replace with dateStr/addDaysStr
- `src/pages/ImportView.tsx` — remove local fmtAgo, parseDurationMin (if present)

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/utils/dateTime.ts src/pages/PlannerView.tsx src/components/sports/ResourceTimeline.tsx src/components/forms/RepeatSection.tsx src/components/planner/DuplicatePopover.tsx src/pages/ImportView.tsx
git commit -m "refactor: centralize date/time utilities in dateTime.ts"
```

---

## Task 2: Create calendarLayout.ts Utility

**Files:**
- Create: `src/utils/calendarLayout.ts`
- Modify: `src/pages/PlannerView.tsx`

- [ ] **Step 1: Create calendarLayout.ts**

Extract from PlannerView.tsx lines 68-209:

```typescript
// src/utils/calendarLayout.ts
import type { Event, EventStatus, BadgeVariant } from '../data/types'
import { timeToMinutes, parseDurationMin } from './dateTime'

// Calendar display constants
export const CAL_START_HOUR = 8
export const CAL_END_HOUR = 23
export const CAL_HOURS = CAL_END_HOUR - CAL_START_HOUR
export const PX_PER_HOUR = 60
export const CAL_HEIGHT = CAL_HOURS * PX_PER_HOUR

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const HOUR_LABELS = Array.from({ length: CAL_HOURS }, (_, i) => {
  const h = CAL_START_HOUR + i
  return `${String(h).padStart(2, '0')}:00`
})

export const FALLBACK_COLOR = { border: '#4B5563', bg: 'rgba(75,85,99,0.1)', text: '#9CA3AF' }

export function eventTopPx(time: string): number { ... }
export function eventHeightPx(durationMin: number): number { ... }
export function computeOverlapLayout(events: Event[]): Map<number, { col: number; totalCols: number }> { ... }
export function hexToChannelColor(hex: string): { border: string; bg: string; text: string } { ... }
export function buildColorMapById(channels: { id: number; color: string }[]): Record<number, { border: string; bg: string; text: string }> { ... }
export function statusVariant(s: EventStatus): BadgeVariant { ... }
```

Copy the exact implementations from PlannerView.tsx lines 94-209, 1434-1438. These functions now import `timeToMinutes` and `parseDurationMin` from dateTime.ts instead of having them locally.

- [ ] **Step 2: Update PlannerView.tsx — remove extracted code, add import**

Remove lines 68-209 (constants + all helper functions above the component) and lines 1434-1438 (DAY_NAMES, HOUR_LABELS). Add:
```typescript
import { CAL_START_HOUR, CAL_END_HOUR, CAL_HOURS, PX_PER_HOUR, CAL_HEIGHT, DAY_NAMES, HOUR_LABELS, eventTopPx, eventHeightPx, computeOverlapLayout, hexToChannelColor, buildColorMapById, statusVariant, FALLBACK_COLOR } from '../utils/calendarLayout'
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/utils/calendarLayout.ts src/pages/PlannerView.tsx
git commit -m "refactor: extract calendar layout utilities to calendarLayout.ts"
```

---

## Task 3: Create apiError.ts Utility

**Files:**
- Create: `src/utils/apiError.ts`

- [ ] **Step 1: Create the utility**

```typescript
// src/utils/apiError.ts
import { ApiError } from './api'

type ToastLike = { error: (msg: string) => void }

export function handleApiError(
  err: unknown,
  context: string,
  toast: ToastLike
): void {
  const message = err instanceof ApiError
    ? err.message
    : err instanceof Error
      ? err.message
      : 'An unexpected error occurred'
  toast.error(`${context}: ${message}`)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/apiError.ts
git commit -m "feat: add handleApiError utility for consistent error handling"
```

---

## Task 4: Extract CalendarGrid Component

This is the largest extraction — the inline CalendarGrid function (lines ~1411-1854) becomes its own file.

**Files:**
- Create: `src/components/planner/CalendarGrid.tsx`
- Create: `src/components/planner/TimeGutter.tsx`
- Create: `src/components/planner/WeekHeader.tsx`
- Modify: `src/pages/PlannerView.tsx`

- [ ] **Step 1: Read the current CalendarGrid code**

Read `src/pages/PlannerView.tsx` lines 1411-1854 to understand the complete CalendarGrid function, its props interface, and all internal logic.

- [ ] **Step 2: Create TimeGutter.tsx**

Extract the hour labels sidebar:
```typescript
// src/components/planner/TimeGutter.tsx
import React from 'react'
import { HOUR_LABELS } from '../../utils/calendarLayout'

export function TimeGutter() {
  return (
    <div className="..."> {/* copy exact classes from PlannerView */}
      {HOUR_LABELS.map(label => (
        <div key={label} className="..." style={{ height: 60 }}>
          <span className="...">{label}</span>
        </div>
      ))}
    </div>
  )
}
```

Read the actual hour label rendering from PlannerView CalendarGrid to get exact classes and styles.

- [ ] **Step 3: Create WeekHeader.tsx**

Extract the date header row (inside CalendarGrid, the header cells with day names + date numbers + headerDrag interaction):

```typescript
// src/components/planner/WeekHeader.tsx
import React from 'react'
import { dateStr } from '../../utils/dateTime'
import { DAY_NAMES } from '../../utils/calendarLayout'

interface WeekHeaderProps {
  weekDays: Date[]
  todayStr: string
  headerDrag: { onHeaderPointerDown, onHeaderPointerMove, onHeaderPointerUp, headerState }
}

export function WeekHeader({ weekDays, todayStr, headerDrag }: WeekHeaderProps) {
  // Copy the header row JSX from CalendarGrid
}
```

Read the actual header rendering from CalendarGrid to get exact implementation.

- [ ] **Step 4: Create CalendarGrid.tsx**

Move the entire CalendarGrid function to its own file. Keep the same props interface (`CalendarGridProps`). Import from the new utility files:

```typescript
// src/components/planner/CalendarGrid.tsx
import React, { useState, useMemo, useEffect } from 'react'
import { useApp } from '../../context/AppProvider'
import { dateStr } from '../../utils/dateTime'
import { CAL_START_HOUR, CAL_END_HOUR, PX_PER_HOUR, CAL_HEIGHT, ... } from '../../utils/calendarLayout'
import { useDrawToCreate, minutesToTime } from '../../hooks/useDrawToCreate'
import { useHeaderDrag } from '../../hooks/useHeaderDrag'
import { useVerticalDrag } from '../../hooks/useVerticalDrag'
import { TimeGutter } from './TimeGutter'
import { WeekHeader } from './WeekHeader'
// ... rest of imports

// Keep the CalendarGridProps interface
// Keep the CalendarGrid function body
// Keep DraggableEventCard and DroppableDayColumn as internal to this file (for now)
```

This is a move, not a rewrite. The CalendarGrid function stays the same internally — we're just moving it to its own file along with its supporting wrappers (DraggableEventCard, DroppableDayColumn, SkeletonCard).

- [ ] **Step 5: Update PlannerView.tsx**

Remove:
- The `CalendarGridProps` interface (~lines 1413-1432)
- The `CalendarGrid` function (~lines 1440-1854)
- `DraggableEventCard` (~lines 225-242)
- `DroppableDayColumn` (~lines 244-251)
- `SkeletonCard` (~lines 213-221)
- `DAY_NAMES` and `HOUR_LABELS` (already moved in Task 2)

Add:
```typescript
import { CalendarGrid } from '../components/planner/CalendarGrid'
```

PlannerView now just renders `<CalendarGrid ...props />` where the inline function used to be.

- [ ] **Step 6: Verify TypeScript compiles and app works**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/components/planner/CalendarGrid.tsx src/components/planner/TimeGutter.tsx src/components/planner/WeekHeader.tsx src/pages/PlannerView.tsx
git commit -m "refactor: extract CalendarGrid, TimeGutter, WeekHeader from PlannerView"
```

---

## Task 5: Extract EventCard Component

**Files:**
- Create: `src/components/planner/EventCard.tsx`
- Modify: `src/components/planner/CalendarGrid.tsx`

- [ ] **Step 1: Read CalendarGrid's event card rendering**

Read the event card JSX inside CalendarGrid (the per-event rendering inside the day column loop). Identify all closure variables it references.

- [ ] **Step 2: Define EventCard props and create the component**

```typescript
// src/components/planner/EventCard.tsx
import React from 'react'
import { Badge } from '../ui'
import type { Event, EventStatus, BadgeVariant } from '../../data/types'
import { statusVariant } from '../../utils/calendarLayout'

interface EventCardProps {
  event: Event
  style: React.CSSProperties
  channelColor: { border: string; bg: string; text: string }
  sportName: string
  statusBadge: BadgeVariant
  isSelected: boolean
  isLocked: boolean
  hasConflict: boolean
  conflictTooltip?: string
  readiness?: { score: number; missing: string[] }
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onToggleSelect?: () => void
}

export const EventCard = React.memo(function EventCard({ ... }: EventCardProps) {
  // Render the event card — copy JSX from CalendarGrid
  // Pre-computed style props (top, height, left, width) come from parent
})
```

- [ ] **Step 3: Update CalendarGrid to use EventCard**

In CalendarGrid, replace the inline event card JSX with:
```tsx
<EventCard
  key={ev.id}
  event={ev}
  style={{ position: 'absolute', top: topPx, height: heightPx, left: `${leftPct}%`, width: `${widthPct}%` }}
  channelColor={getChannelColor(ev.channelId)}
  sportName={sportsMap.get(ev.sportId)?.name || ''}
  statusBadge={statusVariant(ev.status as EventStatus)}
  isSelected={selectedIds.has(ev.id)}
  isLocked={isEventLocked(ev, freezeWindowHours, userRole).locked}
  hasConflict={!!conflictMap[ev.id]?.length}
  conflictTooltip={conflictMap[ev.id]?.map(c => c.message).join('; ')}
  readiness={readinessMap.get(ev.id)}
  onClick={(e) => { /* existing click logic */ }}
  onContextMenu={(e) => onEventContextMenu?.(e, ev, ds, timeStr)}
  onToggleSelect={selectionMode ? () => onToggleSelect(ev.id) : undefined}
/>
```

Pre-compute the style and derived data in the CalendarGrid loop, then pass flat props to EventCard.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/EventCard.tsx src/components/planner/CalendarGrid.tsx
git commit -m "refactor: extract EventCard component with React.memo"
```

---

## Task 6: Extract useCalendarNavigation Hook

**Files:**
- Create: `src/hooks/useCalendarNavigation.ts`
- Modify: `src/pages/PlannerView.tsx`

- [ ] **Step 1: Read PlannerView navigation state**

Read PlannerView.tsx to identify all state and handlers related to date navigation and saved views:
- `weekOffset`, `calendarMode` state
- `goToNext`, `goToPrev`, `goToToday` handlers
- `savedViews`, `saveViewName`, `showSaveInput` state
- `handleSaveView`, `handleLoadView`, `handleDeleteView` handlers
- The `scrollToDate` effect

- [ ] **Step 2: Create the hook**

```typescript
// src/hooks/useCalendarNavigation.ts
import { useState, useEffect, useCallback } from 'react'
import { weekMonday, addDays, dateStr } from '../utils/dateTime'
import { savedViewsApi, type SavedView, type PlannerFilterState } from '../services/savedViews'
import { useToast } from '../components/Toast'

interface CalendarNavState {
  weekOffset: number
  calendarMode: 'week' | 'day'
  selectedDay: Date | null
  // ... saved views state
}

export function useCalendarNavigation(scrollToDate?: string | null) {
  // Move all navigation state and handlers here
  // Return: { weekOffset, calendarMode, weekDays, todayStr, goToNext, goToPrev, goToToday,
  //           setCalendarMode, savedViews, handleSaveView, handleLoadView, handleDeleteView, ... }
}
```

- [ ] **Step 3: Update PlannerView to use the hook**

Replace all inline navigation state with:
```typescript
const nav = useCalendarNavigation(scrollToDate)
// Use nav.weekDays, nav.todayStr, nav.goToNext, etc.
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCalendarNavigation.ts src/pages/PlannerView.tsx
git commit -m "refactor: extract useCalendarNavigation hook from PlannerView"
```

---

## Task 7: Extract useEventActions Hook

**Files:**
- Create: `src/hooks/useEventActions.ts`
- Modify: `src/pages/PlannerView.tsx`

- [ ] **Step 1: Read PlannerView context menu handlers**

Read PlannerView.tsx lines ~800-891 to identify the context menu CRUD callbacks:
- `handleCtxStatusChange`
- `handleCtxDelete`
- `handleCtxDuplicate`
- `handleCtxPaste`
- `pickEventFields`

- [ ] **Step 2: Create the hook**

```typescript
// src/hooks/useEventActions.ts
import { useCallback, useRef } from 'react'
import { eventsApi } from '../services'
import { isEventLocked, isForwardTransition, lockReasonLabel } from '../utils/eventLock'
import { handleApiError } from '../utils/apiError'
import { useToast } from '../components/Toast'
import type { Event, EventStatus } from '../data/types'

interface UseEventActionsParams {
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>
  freezeHours: number
  userRole?: string
}

export function useEventActions({ setEvents, freezeHours, userRole }: UseEventActionsParams) {
  const toast = useToast()
  const clipboardRef = useRef<Event | null>(null)

  const pickEventFields = (e: Event) => ({ ... }) // copy from PlannerView

  const handleCtxStatusChange = useCallback(async (event: Event, status: EventStatus) => {
    // Copy from PlannerView, replace catch { toast.error(...) } with handleApiError
  }, [setEvents, toast, freezeHours, userRole])

  const handleCtxDelete = useCallback(async (event: Event) => {
    // Copy from PlannerView, replace catch with handleApiError
  }, [setEvents, toast, freezeHours, userRole])

  const handleCtxDuplicate = useCallback(async (event: Event, targetDate: string) => {
    // Copy from PlannerView, replace catch with handleApiError
  }, [setEvents, toast])

  const handleCtxPaste = useCallback(async (date: string, time?: string) => {
    // Copy from PlannerView, replace catch with handleApiError
  }, [setEvents, toast])

  return { handleCtxStatusChange, handleCtxDelete, handleCtxDuplicate, handleCtxPaste, clipboardRef }
}
```

- [ ] **Step 3: Update PlannerView to use the hook**

Remove the 4 handlers + pickEventFields + clipboardRef from PlannerView. Add:
```typescript
const { handleCtxStatusChange, handleCtxDelete, handleCtxDuplicate, handleCtxPaste, clipboardRef } = useEventActions({
  setEvents, freezeHours, userRole: user?.role
})
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEventActions.ts src/pages/PlannerView.tsx
git commit -m "refactor: extract useEventActions hook from PlannerView"
```

---

## Task 8: Add React.memo to Existing Sports Components

**Files:**
- Modify: `src/components/sports/EventDetailCard.tsx`
- Modify: `src/components/sports/TechPlanCard.tsx`
- Modify: `src/pages/SportsWorkspace.tsx`

- [ ] **Step 1: Read EventDetailCard and TechPlanCard**

Read both files to understand their current export pattern and props.

- [ ] **Step 2: Wrap EventDetailCard in React.memo**

```typescript
// At the bottom of EventDetailCard.tsx, change:
// export function EventDetailCard(...) { ... }
// To:
export const EventDetailCard = React.memo(function EventDetailCard(...) { ... })
```

- [ ] **Step 3: Wrap TechPlanCard in React.memo**

Same pattern as above.

- [ ] **Step 4: Add useMemo in SportsWorkspace for stable references**

Read SportsWorkspace.tsx to find where it passes data to EventDetailCard and TechPlanCard. Wrap any `.filter()`, `.map()`, or derived data in `useMemo` so the memoized components actually benefit:

```typescript
// Example:
const filteredEvents = useMemo(() =>
  events.filter(e => /* current filter logic */),
  [events, /* filter deps */]
)
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/sports/EventDetailCard.tsx src/components/sports/TechPlanCard.tsx src/pages/SportsWorkspace.tsx
git commit -m "perf: add React.memo to EventDetailCard and TechPlanCard"
```

---

## Task 9: Error Handling Sweep

**Files:**
- Modify: ~15 files with silent catch blocks

- [ ] **Step 1: Sweep user-initiated action catches**

For each file with `catch(() => {})` on a user-initiated action (button click, form submit, delete), replace with `handleApiError`:

**ContractsView.tsx:92** — load contracts on mount
```typescript
// BEFORE:
.catch(() => {})
// AFTER:
.catch(err => handleApiError(err, 'Failed to load contracts', toast))
```

**AdminView.tsx:61,67,161,250** — load/delete in admin panels
```typescript
// Add import: import { handleApiError } from '../utils/apiError'
// Replace each silent catch with handleApiError
```

**IntegrationsPanel.tsx:134,172,207** — replace repeated `instanceof Error` pattern:
```typescript
// BEFORE:
} catch (err) {
  setError(err instanceof Error ? err.message : 'Failed to create source')
}
// AFTER:
} catch (err) {
  handleApiError(err, 'Failed to create source', toast)
}
```

**AdminView.tsx:67** — delete with silent catch:
```typescript
// BEFORE:
await sportsApi.delete(id).catch(() => {})
// AFTER:
try { await sportsApi.delete(id) } catch (err) { handleApiError(err, 'Failed to delete sport', toast) }
```

- [ ] **Step 2: Add intentional comments to legitimate silent catches**

For fire-and-forget background operations, add comments:

```typescript
// NotificationCenter.tsx:13 — background polling, not user-initiated
notificationsApi.list().then(setNotifications).catch(() => {}) // intentional: background poll

// SportsWorkspace.tsx:183 — auto-create crew member on type (fire-and-forget)
crewMembersApi.create({ ... }).catch(() => {}) // intentional: fire-and-forget auto-create

// ChannelsPanel.tsx:245 — JSON parse while typing
try { ... } catch { /* intentional: ignore invalid JSON while typing */ }
```

Go through ALL catch blocks found in the grep results. For each one, decide:
- **User-initiated action** (click, submit, explicit load) → add `handleApiError`
- **Background/fire-and-forget** → add `// intentional: <reason>` comment
- **Already has good error handling** → leave as-is

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: standardize error handling — add handleApiError, document intentional silences"
```

---

## Task 10: Final Verification

- [ ] **Step 1: TypeScript check**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```
Expected: Zero errors.

- [ ] **Step 2: Verify PlannerView line count**

```bash
wc -l src/pages/PlannerView.tsx
```
Expected: ~500-550 lines (down from 1,854).

- [ ] **Step 3: Verify no duplicate utility functions remain**

```bash
grep -rn "function weekMonday\|function addDays\|function dateStr\|function timeToMinutes\|function parseDurationMin" src/ --include="*.tsx" --include="*.ts" | grep -v "dateTime.ts\|calendarLayout.ts"
```
Expected: Zero matches (all duplicates removed).

- [ ] **Step 4: Verify no silent catches without comments**

```bash
grep -rn "catch(() => {})" src/ --include="*.tsx" --include="*.ts" | grep -v "intentional"
```
Expected: Zero matches (all have either handleApiError or intentional comment).

- [ ] **Step 5: Commit summary**

```bash
git log --oneline -10
```
Verify all tasks committed.
