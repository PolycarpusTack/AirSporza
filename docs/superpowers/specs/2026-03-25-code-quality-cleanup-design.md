# Code Quality Cleanup — Design Spec

**Date:** 2026-03-25
**Scope:** Sub-project B — utility deduplication, PlannerView decomposition, memoization, error handling
**Status:** Approved

## Overview

Improve code quality by centralizing duplicated utilities, decomposing the 1,854-line PlannerView into focused components and hooks, adding React.memo() to high-frequency list-item components, and standardizing error handling across the frontend.

## Out of Scope

- IntegrationsPanel decomposition (765 lines, 17 useState hooks) — separate concern
- ImportView sub-component extraction — separate concern
- AdminView duplicate tab rendering fix — low risk/reward
- Performance profiling or React DevTools analysis — this is structural cleanup, not perf tuning
- Backend changes — frontend only

---

## Section 1: Utility Deduplication

### Problem

Date/time utility functions are duplicated across 4+ files with slight implementation differences. `dateStr()` uses manual padding in PlannerView but `toISOString()` in ResourceTimeline. Error handling is inconsistent — some catch blocks use `toast.error()`, others silently swallow.

### Design

#### 1a: `src/utils/dateTime.ts`

Centralize all date/time utilities:

| Function | Signature | Notes |
|----------|-----------|-------|
| `weekMonday(date: Date): Date` | Returns Monday 00:00 of the given date's week | Currently in PlannerView, ResourceTimeline, RepeatSection, DuplicatePopover |
| `addDays(date: Date, n: number): Date` | Returns new Date offset by n days | Same 4 files |
| `dateStr(date: Date): string` | Returns `YYYY-MM-DD` string | Standardize on manual padding (not toISOString which can shift dates across timezones) |
| `timeToMinutes(time: string): number` | Parses `HH:MM` to minutes since midnight | PlannerView, ResourceTimeline |
| `parseDurationMin(str: string): number \| null` | Parses duration strings like `1h30`, `90m`, `2:00` to minutes | PlannerView, ImportView |
| `fmtAgo(date: Date \| string): string` | Relative time display (`2h ago`, `3d ago`) | ImportView, IntegrationsPanel |
| `fmtDateTime(date: Date \| string): string` | Formatted date/time string for UI display | ImportView, IntegrationsPanel |

After creation, delete the duplicated definitions from all consuming files and replace with imports.

#### 1b: `src/utils/apiError.ts`

Centralize error handling for API calls:

```typescript
import { ApiError } from './api'

export function handleApiError(
  err: unknown,
  context: string,
  toast: { error: (msg: string) => void }
): void {
  const message = err instanceof ApiError
    ? err.message
    : err instanceof Error
      ? err.message
      : 'An unexpected error occurred'
  toast.error(`${context}: ${message}`)
}
```

Toast is passed as a parameter (not imported globally) because `useToast()` is a hook.

**Files to change:**
- Create: `src/utils/dateTime.ts`
- Create: `src/utils/apiError.ts`
- Update: `src/pages/PlannerView.tsx` (remove local defs, import)
- Update: `src/components/sports/ResourceTimeline.tsx` (remove local defs, import)
- Update: `src/components/forms/RepeatSection.tsx` (remove local defs, import)
- Update: `src/components/planner/DuplicatePopover.tsx` (remove local defs, import)
- Update: `src/pages/ImportView.tsx` (remove local defs, import)
- Update: `src/components/settings/IntegrationsPanel.tsx` (remove local defs, import)

---

## Section 2: PlannerView Decomposition

### Problem

`src/pages/PlannerView.tsx` is 1,854 lines containing 15+ helper functions, event card rendering, week/day calendar grids, drag handling, context menus, and top-level orchestration all in one file.

### Design

Extract into focused components and hooks:

| New File | Lines | Responsibility |
|----------|-------|---------------|
| `src/components/planner/EventCard.tsx` | ~120 | Single event card — color, time, title, status badges, click handler. Receives event + channel color map. Wrapped in `React.memo()`. |
| `src/components/planner/DayColumn.tsx` | ~150 | One day's column — renders time slots, EventCards, draw-to-create overlay. Receives date + filtered events. Wrapped in `React.memo()` with custom comparator (same date + same events reference). |
| `src/components/planner/WeekHeader.tsx` | ~80 | Date header row with day names, navigation arrows, multi-day selection drag target. |
| `src/components/planner/TimeGutter.tsx` | ~40 | Left-side hour labels (8am–11pm). |
| `src/components/planner/CalendarGrid.tsx` | ~200 | Composes TimeGutter + DayColumns for week/day view. Handles the repeating CSS background pattern. |
| `src/hooks/useCalendarNavigation.ts` | ~60 | Date navigation state: currentDate, viewMode (week/day), goToNext, goToPrev, goToToday. |
| `src/hooks/useEventActions.ts` | ~100 | Event CRUD callbacks: create, update, delete, duplicate, status change. Uses `handleApiError` from apiError.ts. Returns stable callbacks via `useCallback`. |

**PlannerView after extraction:** ~400 lines — thin orchestrator that:
- Imports and uses `useCalendarNavigation`, `useEventActions`, existing `useDrawToCreate`, `useHeaderDrag`
- Composes `CalendarGrid` → `DayColumn` → `EventCard`
- Renders `BulkActionBar`, `ContextMenu`, modals
- Manages top-level state (selected events, filters, modal visibility)

**Calendar constants:** `CAL_START_HOUR = 8`, `CAL_END_HOUR = 23`, `PX_PER_HOUR = 60`, `CAL_HEIGHT = 900` move to a shared location importable by both CalendarGrid and DayColumn. Either a `calendarConstants.ts` file or exported from CalendarGrid.

**Props flow:**
```
PlannerView (state + hooks)
  └── CalendarGrid (dates, events, constants)
        ├── TimeGutter (startHour, endHour)
        └── DayColumn[] (date, events, onEventClick, onDraw)
              └── EventCard[] (event, color, onClick)
```

**Files to change:**
- Create: `src/components/planner/EventCard.tsx`
- Create: `src/components/planner/DayColumn.tsx`
- Create: `src/components/planner/WeekHeader.tsx`
- Create: `src/components/planner/TimeGutter.tsx`
- Create: `src/components/planner/CalendarGrid.tsx`
- Create: `src/hooks/useCalendarNavigation.ts`
- Create: `src/hooks/useEventActions.ts`
- Modify: `src/pages/PlannerView.tsx` (major reduction)

---

## Section 3: Memoization

### Problem

Zero `React.memo()` usage across 142 source files. Components rendered in loops (EventCard, TechPlanCard) re-render on every parent state change even when their props haven't changed.

### Design

Add `React.memo()` to components that render in loops or receive stable-ish props:

| Component | Why | Memo strategy |
|-----------|-----|---------------|
| `EventCard` (new) | Rendered N times per DayColumn (50+ on screen in week view) | Default shallow compare — props are primitives + event object |
| `DayColumn` (new) | 7 instances in week view | Custom comparator: same date string + same events array reference |
| `EventDetailCard` (existing, `src/components/sports/`) | Rendered per-event in SportsWorkspace list | Default shallow compare |
| `TechPlanCard` (existing, `src/components/sports/`) | Rendered per-plan in SportsWorkspace | Default shallow compare |

**Not memoizing:** CalendarGrid, WeekHeader, TimeGutter — singletons rendered once, memo overhead not justified.

**Supporting changes:** The extracted `useEventActions` hook returns callbacks wrapped in `useCallback` so memoized children don't re-render when the parent re-renders. PlannerView already has 35 useCallback/useMemo calls — the extraction makes these cleaner by moving them into focused hooks.

**Files to change:**
- Wrap: `src/components/planner/EventCard.tsx` (new, created with memo)
- Wrap: `src/components/planner/DayColumn.tsx` (new, created with memo)
- Wrap: `src/components/sports/EventDetailCard.tsx` (add React.memo)
- Wrap: `src/components/sports/TechPlanCard.tsx` (add React.memo)

---

## Section 4: Error Handling Standardization

### Problem

Error handling is inconsistent: some catch blocks use `toast.error()`, some silently swallow with `catch(() => {})`, some use `instanceof Error ? err.message : 'Failed'` repeated 3x in the same file. No retry logic (out of scope — that's sub-project D).

### Design

Sweep all catch blocks in the frontend, replacing with `handleApiError` from Section 1b.

**Targets:**

| File | Current pattern | Fix |
|------|----------------|-----|
| `ContractsView.tsx:91-92` | `.catch(() => {})` — silent swallow | `handleApiError(err, 'Failed to load contracts', toast)` |
| `AdminView.tsx:61,67` | `catch { /* ignore */ }` | `handleApiError(err, 'Failed to load data', toast)` |
| `SportsWorkspace.tsx` (various) | Mix of toast and silent | Standardize all to `handleApiError` |
| `IntegrationsPanel.tsx:134,172,207` | `instanceof Error ? err.message : 'Failed'` repeated 3x | Replace with `handleApiError` |
| All other `catch(() => {})` or `catch { }` | Silent failures | Add `handleApiError` |

**Intentional silences preserved:** Abort controller cleanup, optimistic update rollback, and any catch that intentionally ignores errors gets a `// intentional: <reason>` comment so future developers know it's deliberate.

**Files to change:**
- Modify: `src/pages/ContractsView.tsx`
- Modify: `src/pages/AdminView.tsx`
- Modify: `src/pages/SportsWorkspace.tsx`
- Modify: `src/components/settings/IntegrationsPanel.tsx`
- Modify: Any other files with silent catch blocks (discovered during implementation)

---

## Dependency Summary

```
Section 1 (utilities) — must go first
  ↓
Section 2 + 3 (decomp + memo) — done together, uses dateTime.ts
Section 4 (error handling) — uses apiError.ts, independent of 2+3
```

Recommended order: 1 → 2+3 → 4.

## No New Dependencies

All changes use existing React APIs (React.memo, useCallback) and existing project utilities. No new npm packages needed.
