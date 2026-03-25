# Code Quality Cleanup — Design Spec

**Date:** 2026-03-25
**Scope:** Sub-project B — utility deduplication, PlannerView decomposition, memoization, error handling
**Status:** Approved (rev 2 — post spec review)

## Overview

Improve code quality by centralizing duplicated utilities, decomposing the 1,854-line PlannerView into focused components and hooks, adding React.memo() to high-frequency list-item components, and standardizing error handling across the frontend.

## Out of Scope

- IntegrationsPanel decomposition (765 lines, 17 useState hooks) — separate concern
- ImportView sub-component extraction — separate concern
- AdminView duplicate tab rendering fix — low risk/reward
- Performance profiling or React DevTools analysis — this is structural cleanup, not perf tuning
- Backend changes — frontend only
- List mode extraction — stays in PlannerView for now

---

## Section 1: Utility Deduplication

### Problem

Date/time utility functions are duplicated across 4+ files with slight implementation differences. `dateStr()` uses manual padding in PlannerView but `toISOString()` in ResourceTimeline and DuplicatePopover (`toDateStr`). Error handling is inconsistent — some catch blocks use `toast.error()`, others silently swallow.

### Design

#### 1a: `src/utils/dateTime.ts`

Centralize all date/time utilities:

| Function | Signature | Notes |
|----------|-----------|-------|
| `weekMonday(date: Date): Date` | Returns Monday 00:00 of the given date's week | Currently in PlannerView, ResourceTimeline, RepeatSection, DuplicatePopover |
| `addDays(date: Date, n: number): Date` | Returns new Date offset by n days | For Date-based consumers |
| `addDaysStr(dateStr: string, n: number): string` | Returns YYYY-MM-DD string offset by n days | For string-based consumers (DuplicatePopover, RepeatSection) |
| `dateStr(date: Date): string` | Returns `YYYY-MM-DD` string | Standardize on manual padding (not toISOString which can shift dates across timezones). Also replaces `toDateStr` in DuplicatePopover. |
| `getDateKey(date: Date): string` | Alias for dateStr, used for map keys | Currently inline in PlannerView, used in 6+ places |
| `timeToMinutes(time: string): number` | Parses `HH:MM` to minutes since midnight | PlannerView, ResourceTimeline |
| `parseDurationMin(str: string): number \| null` | Parses duration strings like `1h30`, `90m`, `2:00` to minutes | PlannerView, ImportView |
| `fmtAgo(date: Date \| string): string` | Relative time display (`2h ago`, `3d ago`) | ImportView only (not in IntegrationsPanel as originally thought) |
| `fmtDateTime(date: Date \| string): string` | Formatted date/time string for UI display | ImportView only |

After creation, delete the duplicated definitions from all consuming files and replace with imports.

#### 1b: `src/utils/apiError.ts`

Centralize error handling for API calls:

```typescript
import { ApiError } from './api'

type ToastLike = { error: (msg: string) => void; warning?: (msg: string) => void }

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

Toast is passed as a parameter (not imported globally) because `useToast()` is a hook. The `ToastLike` type allows passing the full toast object or a subset.

#### 1c: `src/utils/calendarLayout.ts`

Extract calendar-specific layout utilities from PlannerView:

| Function/Constant | Notes |
|-------------------|-------|
| `CAL_START_HOUR = 8` | Calendar day start |
| `CAL_END_HOUR = 23` | Calendar day end |
| `PX_PER_HOUR = 60` | Pixel scale |
| `CAL_HEIGHT = CAL_HOURS * PX_PER_HOUR` | Total grid height |
| `CAL_HOURS = CAL_END_HOUR - CAL_START_HOUR` | Hours displayed |
| `eventTopPx(time, startHour, pxPerHour)` | Calculate event top position |
| `eventHeightPx(durationMin, pxPerHour)` | Calculate event height |
| `computeOverlapLayout(events)` | ~55 lines — compute column positions for overlapping events |
| `hexToChannelColor(hex)` | Convert hex color to border/bg/text variant |
| `buildColorMapById(channels)` | Build channel ID → color map |

#### 1d: `src/utils/statusVariant.ts` (optional small extract)

`statusVariant(status)` — maps event status to badge variant. Currently inline in PlannerView.

**Files to change:**
- Create: `src/utils/dateTime.ts`
- Create: `src/utils/apiError.ts`
- Create: `src/utils/calendarLayout.ts`
- Update: `src/pages/PlannerView.tsx` (remove local defs, import)
- Update: `src/components/sports/ResourceTimeline.tsx` (remove local defs, import)
- Update: `src/components/forms/RepeatSection.tsx` (remove local defs, import)
- Update: `src/components/planner/DuplicatePopover.tsx` (remove local defs, import `dateStr` to replace `toDateStr`, import `addDaysStr`)
- Update: `src/pages/ImportView.tsx` (remove local defs, import)

---

## Section 2: PlannerView Decomposition

### Problem

`src/pages/PlannerView.tsx` is 1,854 lines containing 15+ helper functions, event card rendering, week/day calendar grids, drag handling, context menus, and top-level orchestration all in one file.

### Design

Note: PlannerView already contains a `CalendarGrid` function component inline (~414 lines, starting around line 1440). The extraction is primarily moving existing code to separate files plus cleaning up interfaces.

#### Extracted components

| New File | Est. Lines | Responsibility |
|----------|------------|---------------|
| `src/components/planner/EventCard.tsx` | ~150 | Single event card — color, time, title, status badges, readiness dots. Pre-computed style props (top, height, left, width). `React.memo()`. |
| `src/components/planner/DayColumn.tsx` | ~200 | One day's column — renders EventCards, DnD drop zone (includes DroppableDayColumn wrapper). Owns pointer event handlers for draw-to-create within its column. |
| `src/components/planner/WeekHeader.tsx` | ~60 | Date header row with day names and multi-day selection drag (uses headerDrag hooks). Does NOT include navigation arrows (those stay in PlannerView's toolbar). |
| `src/components/planner/TimeGutter.tsx` | ~40 | Left-side hour labels. |
| `src/components/planner/CalendarGrid.tsx` | ~180 | Composes TimeGutter + DayColumns. Owns draw-to-create state, vertical drag state, and nowMinutes timer so these don't flow through DayColumn props. Renders draw overlay and drag ghost directly. |
| `src/hooks/useCalendarNavigation.ts` | ~120 | Date navigation state + saved views management (currentDate, viewMode, goToNext/Prev/Today, savedViews CRUD, handleLoadView, handleSaveView, handleDeleteView). |
| `src/hooks/useEventActions.ts` | ~120 | Context menu CRUD callbacks: handleCtxStatusChange, handleCtxDelete, handleCtxDuplicate, handleCtxPaste, pickEventFields. Uses `handleApiError`. Returns stable callbacks. |

#### EventCard props interface

EventCard receives pre-computed layout data to avoid needing access to closure variables:

```typescript
interface EventCardProps {
  event: Event
  style: { top: number; height: number; left: string; width: string }
  channelColor: { border: string; bg: string; text: string }
  sportName: string
  isSelected: boolean
  isLocked: boolean
  hasConflict: boolean
  conflictTooltip?: string
  onClick: (e: React.MouseEvent, id: number) => void
  onContextMenu: (e: React.MouseEvent, id: number) => void
  onToggleSelect?: (id: number) => void
}
```

CalendarGrid computes the style/color/sport data from its props and passes pre-computed objects to EventCard. This keeps EventCard's props flat and memoizable.

#### What stays in PlannerView

After extraction, PlannerView (~500-550 lines) contains:
- Top-level state declarations + hook calls (~100 lines)
- Toolbar/controls row with navigation, filters, view toggle (~100 lines)
- Channel color chips (~40 lines)
- List mode rendering (~107 lines) — not extracted in this pass
- Modal rendering (event form, duplicate popover, detail panel) (~60 lines)
- Context menu builders + handlers (~50 lines)
- Bulk action wiring (~30 lines)
- Saved views bar (~25 lines)

#### Helper function disposition

| Function | Current location | Destination |
|----------|-----------------|-------------|
| `weekMonday`, `addDays`, `dateStr`, `getDateKey`, `timeToMinutes`, `parseDurationMin` | PlannerView top | `src/utils/dateTime.ts` |
| `CAL_START_HOUR`, `CAL_END_HOUR`, `PX_PER_HOUR`, `CAL_HEIGHT`, `CAL_HOURS` | PlannerView top | `src/utils/calendarLayout.ts` |
| `eventTopPx`, `eventHeightPx` | PlannerView top | `src/utils/calendarLayout.ts` |
| `computeOverlapLayout` | PlannerView top | `src/utils/calendarLayout.ts` |
| `hexToChannelColor`, `buildColorMapById` | PlannerView top | `src/utils/calendarLayout.ts` |
| `statusVariant` | PlannerView top | `src/utils/calendarLayout.ts` (or own file) |
| `pickEventFields` | PlannerView body | `src/hooks/useEventActions.ts` |
| `handleCtxStatusChange/Delete/Duplicate/Paste` | PlannerView body | `src/hooks/useEventActions.ts` |
| `SkeletonCard` | PlannerView top | `src/components/planner/EventCard.tsx` (co-located) |
| `DraggableEventCard` | PlannerView top | `src/components/planner/EventCard.tsx` (co-located) |
| `DroppableDayColumn` | PlannerView top | `src/components/planner/DayColumn.tsx` (co-located) |
| `DAY_NAMES`, `HOUR_LABELS` | PlannerView body | `src/utils/calendarLayout.ts` |
| `handleDragEnd`, `handleVerticalDragComplete`, `handleUndoDrag` | PlannerView body | Stay in PlannerView (tightly coupled to drag state) |
| Bulk operation handlers (5) | PlannerView body | Stay in PlannerView |
| Saved view handlers | PlannerView body | `src/hooks/useCalendarNavigation.ts` |

**Files to change:**
- Create: `src/components/planner/EventCard.tsx`
- Create: `src/components/planner/DayColumn.tsx`
- Create: `src/components/planner/WeekHeader.tsx`
- Create: `src/components/planner/TimeGutter.tsx`
- Create: `src/components/planner/CalendarGrid.tsx`
- Create: `src/hooks/useCalendarNavigation.ts`
- Create: `src/hooks/useEventActions.ts`
- Modify: `src/pages/PlannerView.tsx` (major reduction: 1,854 → ~500-550 lines)

---

## Section 3: Memoization

### Problem

Zero `React.memo()` usage across 142 source files. Components rendered in loops (EventCard, TechPlanCard) re-render on every parent state change even when their props haven't changed.

### Design

Add `React.memo()` to components that render in loops:

| Component | Why | Memo strategy |
|-----------|-----|---------------|
| `EventCard` (new) | Rendered N times per DayColumn (50+ on screen) | Default shallow compare — props are primitives + pre-computed style object |
| `EventDetailCard` (existing) | Rendered per-event in SportsWorkspace | Default shallow compare |
| `TechPlanCard` (existing) | Rendered per-plan in SportsWorkspace | Default shallow compare |

**Not memoizing DayColumn:** The review found that DayColumn receives too many frequently-changing props (draw state, drag state, nowMinutes) for memo to be effective. Instead, CalendarGrid owns these states and renders the overlays directly, keeping DayColumn's props simpler. If memoization is needed later, it can be added once the interface stabilizes.

**Not memoizing singletons:** CalendarGrid, WeekHeader, TimeGutter — rendered once.

**Prerequisite for EventDetailCard and TechPlanCard memo:** The parent (SportsWorkspace) must provide stable references for array/object props via `useMemo`. If data is derived via `.filter()` or `.map()` on every render, the memo is ineffective. The implementer should add `useMemo` to the data passed to these components.

**Supporting changes:** The extracted `useEventActions` hook returns callbacks wrapped in `useCallback` so memoized children don't re-render when the parent re-renders.

**Files to change:**
- Wrap: `src/components/planner/EventCard.tsx` (new, created with memo)
- Wrap: `src/components/sports/EventDetailCard.tsx` (add React.memo)
- Wrap: `src/components/sports/TechPlanCard.tsx` (add React.memo)
- Update: `src/pages/SportsWorkspace.tsx` (add useMemo for data passed to memoized components)

---

## Section 4: Error Handling Standardization

### Problem

Error handling is inconsistent: some catch blocks use `toast.error()`, some silently swallow with `catch(() => {})`, some use `instanceof Error ? err.message : 'Failed'` repeated 3x in the same file. No retry logic (out of scope — that's sub-project D).

### Design

Sweep catch blocks in the frontend, replacing **user-facing failures** with `handleApiError` from Section 1b.

**Targets:**

| File | Current pattern | Fix |
|------|----------------|-----|
| `ContractsView.tsx:91-92` | `.catch(() => {})` — silent swallow on load | `handleApiError(err, 'Failed to load contracts', toast)` |
| `AdminView.tsx:61,67` | `catch { /* ignore */ }` on load | `handleApiError(err, 'Failed to load data', toast)` |
| `IntegrationsPanel.tsx:134,172,207` | `instanceof Error ? err.message : 'Failed'` repeated 3x | Replace with `handleApiError` |
| Other explicit error-swallowing catch blocks | Silent failures on user-initiated actions | Add `handleApiError` |

**Intentional silences preserved with `// intentional: <reason>` comment:**
- Abort controller cleanup (`catch(() => {})` on unmount)
- Optimistic update rollback
- Fire-and-forget background syncs (e.g., auto-create crew member on type, notification polling, initial data prefetches where the user hasn't requested an action)
- Any catch on a `.warning()` call — keep the existing warning severity

The key distinction: **if the user clicked something and it failed, they should see a toast.** If it's a background side-effect they didn't initiate, silence is acceptable.

**Files to change:**
- Modify: `src/pages/ContractsView.tsx`
- Modify: `src/pages/AdminView.tsx`
- Modify: `src/pages/SportsWorkspace.tsx`
- Modify: `src/components/settings/IntegrationsPanel.tsx`
- Modify: Any other files with silent catch blocks on user-initiated actions (discovered during implementation)

---

## Dependency Summary

```
Section 1 (utilities) — must go first
  ↓
Section 2 + 3 (decomp + memo) — done together, uses dateTime.ts + calendarLayout.ts
Section 4 (error handling) — uses apiError.ts, independent of 2+3
```

Recommended order: 1 → 2+3 → 4.

## No New Dependencies

All changes use existing React APIs (React.memo, useCallback, useMemo) and existing project utilities. No new npm packages needed.
