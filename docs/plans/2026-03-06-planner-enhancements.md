# Planning Tab Enhancements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add context menus, event duplication, enhanced detail panel, and richer saved views to the Planning tab so planners can work faster.

**Architecture:** New reusable `ContextMenu` component wired into PlannerView's calendar and list views via `onContextMenu`. Duplicate creates event copies via existing `eventsApi.create()`. EventDetailPanel gets inline quick actions. Saved views expand to capture all filter state. Phase B (lock/pin) deferred to separate plan.

**Tech Stack:** React, TypeScript, existing BB design tokens, existing eventsApi

---

### Task 1: Create ContextMenu component

**Files:**
- Create: `src/components/planner/ContextMenu.tsx`

**Context:**
- Reusable positioned menu rendered as a fixed div. Matches existing popover patterns in the codebase (e.g., `CrewMatrixView` popover, channel picker).
- BB design tokens: `bg-surface`, `border-border`, `hover:bg-surface-2`, `text-danger` for danger items.
- Must handle: viewport edge repositioning, click-outside dismiss, Escape dismiss, scroll dismiss.
- Submenu support for "Status ->" and "Tech plan ->" items.

**Step 1: Create the component**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'

/* ---- Types ---- */

interface ActionItem {
  type: 'action'
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface SubmenuItem {
  type: 'submenu'
  label: string
  icon?: React.ReactNode
  children: MenuItem[]
}

interface SeparatorItem {
  type: 'separator'
}

export type MenuItem = ActionItem | SubmenuItem | SeparatorItem

export interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/* ---- Component ---- */

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [openSub, setOpenSub] = useState<number | null>(null)

  // Reposition if near viewport edge
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    let nx = x, ny = y
    if (x + rect.width > window.innerWidth - 8) nx = window.innerWidth - rect.width - 8
    if (y + rect.height > window.innerHeight - 8) ny = window.innerHeight - rect.height - 8
    if (nx < 8) nx = 8
    if (ny < 8) ny = 8
    setPos({ x: nx, y: ny })
  }, [x, y])

  // Click outside
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  // Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onClose])

  // Scroll dismiss
  useEffect(() => {
    const handle = () => onClose()
    window.addEventListener('scroll', handle, true)
    return () => window.removeEventListener('scroll', handle, true)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[180px] animate-fade-in"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={i} className="border-t border-border my-1" />
        }
        if (item.type === 'submenu') {
          return (
            <div
              key={i}
              className="relative"
              onMouseEnter={() => setOpenSub(i)}
              onMouseLeave={() => setOpenSub(null)}
            >
              <div className="flex items-center justify-between px-3 py-1.5 text-sm cursor-default hover:bg-surface-2 transition-colors">
                <span className="flex items-center gap-2">
                  {item.icon && <span className="w-4 h-4 flex items-center justify-center text-text-3">{item.icon}</span>}
                  {item.label}
                </span>
                <span className="text-text-3 text-xs ml-4">›</span>
              </div>
              {openSub === i && (
                <div className="absolute left-full top-0 ml-1 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                  {item.children.map((child, ci) => {
                    if (child.type === 'separator') {
                      return <div key={ci} className="border-t border-border my-1" />
                    }
                    if (child.type === 'action') {
                      return (
                        <button
                          key={ci}
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 transition-colors flex items-center gap-2 ${child.danger ? 'text-danger' : ''} ${child.disabled ? 'opacity-40 pointer-events-none' : ''}`}
                          onClick={() => { child.onClick(); onClose() }}
                        >
                          {child.icon && <span className="w-4 h-4 flex items-center justify-center text-text-3">{child.icon}</span>}
                          {child.label}
                        </button>
                      )
                    }
                    return null
                  })}
                </div>
              )}
            </div>
          )
        }
        // action
        return (
          <button
            key={i}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 transition-colors flex items-center gap-2 ${item.danger ? 'text-danger' : ''} ${item.disabled ? 'opacity-40 pointer-events-none' : ''}`}
            onClick={() => { item.onClick(); onClose() }}
          >
            {item.icon && <span className="w-4 h-4 flex items-center justify-center text-text-3">{item.icon}</span>}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/planner/ContextMenu.tsx
git commit -m "feat: add reusable ContextMenu component for planner"
```

---

### Task 2: Wire context menu into PlannerView (calendar + list)

**Files:**
- Modify: `src/pages/PlannerView.tsx`

**Context:**
- `PlannerView` has two modes: calendar (via `CalendarGrid` sub-component, line 1049) and list (inline JSX, line 896).
- Calendar event cards are rendered inside `CalendarGrid` at line 1220+ with `onClick` on the card div.
- List event rows are rendered at line 925 with `onClick`.
- `CalendarGrid` receives `onEventClick` prop (line 1033). We need to add `onContextMenu` for both event cards and empty slots.
- Empty slot time can be computed from click Y position using `CAL_START_HOUR` and `PX_PER_HOUR` constants (lines 58-60).
- `eventsApi` is already imported. `useApp` provides `setEvents`. Toast is available.
- Event statuses: `'draft' | 'ready' | 'approved' | 'published' | 'live' | 'completed' | 'cancelled'`

**Step 1: Add context menu state and handlers to PlannerView**

After the existing state declarations (around line 243), add:

```typescript
const [ctxMenu, setCtxMenu] = useState<{
  x: number; y: number
  event?: Event
  date?: string
  time?: string
} | null>(null)
const clipboardRef = useRef<Event | null>(null)
```

After the bulk handlers (around line 589), add context menu action handlers:

```typescript
const handleCtxStatusChange = useCallback(async (event: Event, status: EventStatus) => {
  try {
    await eventsApi.update(event.id, { ...event, status })
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, status } : e))
    toast.success(`Status changed to ${status}`)
  } catch {
    toast.error('Failed to update status')
  }
}, [setEvents, toast])

const handleCtxDelete = useCallback(async (event: Event) => {
  if (!window.confirm(`Delete "${event.participants}"? This cannot be undone.`)) return
  try {
    await eventsApi.delete(event.id)
    setEvents(prev => prev.filter(e => e.id !== event.id))
    toast.success('Event deleted')
  } catch {
    toast.error('Failed to delete event')
  }
}, [setEvents, toast])

const handleCtxDuplicate = useCallback(async (event: Event, targetDate: string) => {
  try {
    const { id, seriesId, techPlans, ...rest } = event as Event & { techPlans?: unknown }
    const created = await eventsApi.create({ ...rest, startDateBE: targetDate, status: 'draft' })
    setEvents(prev => [...prev, created])
    clipboardRef.current = event
    toast.success(`Event duplicated to ${new Date(targetDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`)
  } catch {
    toast.error('Failed to duplicate event')
  }
}, [setEvents, toast])

const handleCtxPaste = useCallback(async (date: string, time?: string) => {
  const src = clipboardRef.current
  if (!src) return
  try {
    const { id, seriesId, techPlans, ...rest } = src as Event & { techPlans?: unknown }
    const created = await eventsApi.create({
      ...rest,
      startDateBE: date,
      startTimeBE: time || rest.startTimeBE,
      status: 'draft',
    })
    setEvents(prev => [...prev, created])
    toast.success('Event pasted')
  } catch {
    toast.error('Failed to paste event')
  }
}, [setEvents, toast])
```

Add a function to build event card menu items:

```typescript
const buildEventMenuItems = useCallback((event: Event): MenuItem[] => {
  const statuses: EventStatus[] = ['draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled']
  return [
    { type: 'action', label: 'Open details', onClick: () => setDetailEvent(event) },
    { type: 'action', label: 'Edit event', onClick: () => { setDetailEvent(null); onEventClick?.(event) } },
    { type: 'separator' },
    { type: 'action', label: 'Duplicate...', onClick: () => setDuplicateTarget(event) },
    { type: 'submenu', label: 'Status', children: statuses.map(s => ({
      type: 'action' as const, label: s, onClick: () => handleCtxStatusChange(event, s),
      disabled: event.status === s,
    })) },
    { type: 'separator' },
    { type: 'action', label: 'Delete', onClick: () => handleCtxDelete(event), danger: true },
  ]
}, [onEventClick, handleCtxStatusChange, handleCtxDelete])

const buildSlotMenuItems = useCallback((date: string, time?: string): MenuItem[] => {
  const items: MenuItem[] = [
    { type: 'action', label: 'Create event here', onClick: () => {
      const durMin = 90
      const h = Math.floor(durMin / 60)
      const m = durMin % 60
      const smpte = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00;00`
      onDrawCreate?.({ startDateBE: date, startTimeBE: time || '12:00', duration: smpte })
    }},
  ]
  if (clipboardRef.current) {
    items.push({ type: 'action', label: 'Paste event here', onClick: () => handleCtxPaste(date, time) })
  }
  return items
}, [onDrawCreate, handleCtxPaste])
```

Add duplicate target state (for the date picker popover):

```typescript
const [duplicateTarget, setDuplicateTarget] = useState<Event | null>(null)
```

**Step 2: Add `onContextMenu` props to CalendarGrid**

Extend `CalendarGridProps` (line 1029) with:

```typescript
onEventContextMenu?: (e: React.MouseEvent, event: Event, date: string, time: string) => void
onSlotContextMenu?: (e: React.MouseEvent, date: string, time: string) => void
```

Pass them from PlannerView to CalendarGrid (around line 863):

```tsx
onEventContextMenu={(e, ev, date, time) => {
  e.preventDefault()
  setCtxMenu({ x: e.clientX, y: e.clientY, event: ev, date, time })
}}
onSlotContextMenu={(e, date, time) => {
  e.preventDefault()
  setCtxMenu({ x: e.clientX, y: e.clientY, date, time })
}}
```

Inside `CalendarGrid`, add `onContextMenu` to the event card div (the one with `data-event-card="true"`):

```tsx
onContextMenu={(e) => {
  e.preventDefault()
  e.stopPropagation()
  const time = ev.linearStartTime || ev.startTimeBE
  onEventContextMenu?.(e, ev, ds, time)
}}
```

Add `onContextMenu` to the day column div (the one with `className="relative border-l border-border"`):

```tsx
onContextMenu={(e) => {
  if ((e.target as HTMLElement).closest('[data-event-card]')) return
  e.preventDefault()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const yOffset = e.clientY - rect.top
  const minutes = CAL_START_HOUR * 60 + (yOffset / PX_PER_HOUR) * 60
  const h = Math.floor(minutes / 60)
  const m = Math.round((minutes % 60) / 5) * 5
  const time = `${String(h).padStart(2,'0')}:${String(m % 60 === 60 ? 0 : m).padStart(2,'0')}`
  onSlotContextMenu?.(e, ds, time)
}}
```

**Step 3: Add `onContextMenu` to list view rows**

On the list view event row (line 925, the div with `onClick`), add:

```tsx
onContextMenu={(e) => {
  e.preventDefault()
  setCtxMenu({ x: e.clientX, y: e.clientY, event: ev, date: getDateKey(ev.startDateBE) })
}}
```

**Step 4: Render ContextMenu and DuplicatePopover in PlannerView**

After the `EventDetailPanel` (around line 1022), add:

```tsx
{ctxMenu && (
  <ContextMenu
    x={ctxMenu.x}
    y={ctxMenu.y}
    items={ctxMenu.event
      ? buildEventMenuItems(ctxMenu.event)
      : buildSlotMenuItems(ctxMenu.date!, ctxMenu.time)
    }
    onClose={() => setCtxMenu(null)}
  />
)}

{duplicateTarget && (
  <DuplicatePopover
    event={duplicateTarget}
    onDuplicate={(date) => { handleCtxDuplicate(duplicateTarget, date); setDuplicateTarget(null) }}
    onClose={() => setDuplicateTarget(null)}
  />
)}
```

**Step 5: Add imports at top of PlannerView**

```typescript
import { ContextMenu, type MenuItem } from '../components/planner/ContextMenu'
```

**Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (DuplicatePopover doesn't exist yet — will create in Task 3)

Note: This step may fail if DuplicatePopover is referenced but not yet created. If so, temporarily comment out the DuplicatePopover JSX and the import, verify compiles, then move to Task 3.

**Step 7: Commit**

```bash
git add src/pages/PlannerView.tsx
git commit -m "feat: wire context menu into PlannerView calendar + list views"
```

---

### Task 3: Create DuplicatePopover component

**Files:**
- Create: `src/components/planner/DuplicatePopover.tsx`

**Context:**
- Small modal/popover that appears when user picks "Duplicate..." from context menu.
- Shows 3 options: Tomorrow, Next week same day, Custom date input.
- Computes "tomorrow" and "next week" from the source event's `startDateBE`.
- Uses existing BB tokens: `card`, `bg-surface`, `inp`, `Btn` from `../ui`.

**Step 1: Create the component**

```tsx
import { useState } from 'react'
import { Btn } from '../ui'
import type { Event } from '../../data/types'

interface DuplicatePopoverProps {
  event: Event
  onDuplicate: (targetDate: string) => void
  onClose: () => void
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export function DuplicatePopover({ event, onDuplicate, onClose }: DuplicatePopoverProps) {
  const srcDate = typeof event.startDateBE === 'string'
    ? event.startDateBE.slice(0, 10)
    : (event.startDateBE as Date).toISOString().slice(0, 10)

  const tomorrow = addDays(srcDate, 1)
  const nextWeek = addDays(srcDate, 7)
  const [customDate, setCustomDate] = useState(tomorrow)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)' }}
      onClick={onClose}
    >
      <div
        className="card p-5 w-full max-w-xs shadow-lg animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-semibold text-sm mb-1">Duplicate Event</h3>
        <p className="text-xs text-text-3 mb-4 truncate">{event.participants}</p>

        <div className="space-y-2 mb-4">
          <button
            className="w-full text-left px-3 py-2 rounded border border-border hover:bg-surface-2 transition text-sm"
            onClick={() => onDuplicate(tomorrow)}
          >
            Tomorrow <span className="text-text-3 ml-2">{formatDate(tomorrow)}</span>
          </button>
          <button
            className="w-full text-left px-3 py-2 rounded border border-border hover:bg-surface-2 transition text-sm"
            onClick={() => onDuplicate(nextWeek)}
          >
            Next week <span className="text-text-3 ml-2">{formatDate(nextWeek)}</span>
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="date"
            className="inp flex-1 text-sm"
            value={customDate}
            onChange={e => setCustomDate(e.target.value)}
          />
          <Btn size="sm" onClick={() => onDuplicate(customDate)}>Go</Btn>
        </div>

        <div className="mt-3 text-right">
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Import in PlannerView**

Add to imports in `src/pages/PlannerView.tsx`:

```typescript
import { DuplicatePopover } from '../components/planner/DuplicatePopover'
```

Uncomment the DuplicatePopover JSX if it was commented out in Task 2.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/planner/DuplicatePopover.tsx src/pages/PlannerView.tsx
git commit -m "feat: add DuplicatePopover for event duplication with quick dates"
```

---

### Task 4: Enhance EventDetailPanel with quick actions + tech plan links

**Files:**
- Modify: `src/components/planner/EventDetailPanel.tsx`

**Context:**
- Currently a read-only side panel with sport, competition, date, time, duration, status badge, channels, tech plan count, and an "Edit Event" button at the bottom.
- Needs: inline status dropdown, duplicate button, tech plan clickable links, conflict badges.
- `EventDetailPanelProps` currently has: `event`, `onClose`, `onEdit`, `sports`, `competitions`.
- Need to add: `onStatusChange`, `onDuplicate`, `conflictMap`, `onNavigateToSports`.
- Uses `Badge` from `../ui`, `Btn` from `../ui`, existing BB tokens.

**Step 1: Update the component**

Replace the entire file with:

```tsx
import { X, Copy, ExternalLink } from 'lucide-react'
import { Badge, Btn } from '../ui'
import type { Event, Sport, Competition, EventStatus, BadgeVariant } from '../../data/types'
import type { ConflictWarning } from '../../services/events'

interface EventDetailPanelProps {
  event: Event | null
  onClose: () => void
  onEdit: (event: Event) => void
  onStatusChange?: (event: Event, status: EventStatus) => void
  onDuplicate?: (event: Event) => void
  onNavigateToSports?: (eventId: number) => void
  sports: Sport[]
  competitions: Competition[]
  conflictMap?: Record<number, ConflictWarning[]>
}

const EVENT_STATUSES: EventStatus[] = [
  'draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled',
]

function statusVariant(s: EventStatus): BadgeVariant {
  const map: Record<EventStatus, BadgeVariant> = {
    draft: 'draft',
    ready: 'warning',
    approved: 'success',
    published: 'live',
    live: 'live',
    completed: 'default',
    cancelled: 'danger',
  }
  return map[s] ?? 'default'
}

export function EventDetailPanel({ event, onClose, onEdit, onStatusChange, onDuplicate, onNavigateToSports, sports, competitions, conflictMap }: EventDetailPanelProps) {
  const sport = event ? sports.find(s => s.id === event.sportId) : null
  const competition = event ? competitions.find(c => c.id === event.competitionId) : null
  const conflicts = event ? conflictMap?.[event.id] : undefined

  return (
    <div
      className={[
        'fixed top-0 right-0 h-full w-80 bg-surface border-l shadow-xl z-30',
        'flex flex-col transition-transform duration-200',
        event ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          {sport?.icon && <span className="text-lg">{sport.icon}</span>}
          <span className="text-sm font-semibold text-text-2 truncate">
            {competition?.name ?? 'Event'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="btn btn-g btn-sm"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      {event && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h2 className="text-base font-bold text-text-1">{event.participants}</h2>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {onStatusChange && (
              <select
                className="inp text-xs py-1 px-2"
                value={event.status ?? 'draft'}
                onChange={e => onStatusChange(event, e.target.value as EventStatus)}
              >
                {EVENT_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
            {onDuplicate && (
              <Btn variant="ghost" size="xs" onClick={() => onDuplicate(event)}>
                <Copy className="w-3 h-3 mr-1" />Duplicate
              </Btn>
            )}
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-text-3 w-20 shrink-0">Date</span>
              <span className="text-text-2">
                {typeof event.startDateBE === 'string'
                  ? new Date(event.startDateBE + 'T00:00:00').toLocaleDateString('en-GB', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    })
                  : (event.startDateBE as Date).toLocaleDateString('en-GB')}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-text-3 w-20 shrink-0">Time</span>
              <span className="text-text-2">{event.startTimeBE}</span>
            </div>
            {event.duration && (
              <div className="flex gap-2">
                <span className="text-text-3 w-20 shrink-0">Duration</span>
                <span className="text-text-2">{event.duration}</span>
              </div>
            )}
          </div>

          {(event.linearChannel || event.radioChannel || event.onDemandChannel) && (
            <div className="space-y-1 text-sm">
              <p className="text-text-3 text-xs uppercase tracking-wider font-semibold">Channels</p>
              {event.linearChannel && (
                <div className="flex gap-2">
                  <span className="text-text-3 w-20 shrink-0">Linear</span>
                  <span className="text-text-2">{event.linearChannel}</span>
                </div>
              )}
              {event.radioChannel && (
                <div className="flex gap-2">
                  <span className="text-text-3 w-20 shrink-0">Radio</span>
                  <span className="text-text-2">{event.radioChannel}</span>
                </div>
              )}
              {event.onDemandChannel && (
                <div className="flex gap-2">
                  <span className="text-text-3 w-20 shrink-0">On Demand</span>
                  <span className="text-text-2">{event.onDemandChannel}</span>
                </div>
              )}
            </div>
          )}

          {/* Tech plans */}
          <div className="text-sm">
            <p className="text-text-3 text-xs uppercase tracking-wider font-semibold mb-1">Tech Plans</p>
            {(event.techPlans?.length ?? 0) > 0 ? (
              <div className="space-y-1">
                {onNavigateToSports ? (
                  <button
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                    onClick={() => onNavigateToSports(event.id)}
                  >
                    <ExternalLink className="w-3 h-3" />
                    {event.techPlans!.length} plan(s) — Open in Sports
                  </button>
                ) : (
                  <p className="text-text-2">{event.techPlans!.length} plan(s) assigned</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-text-3 text-xs">No plans</span>
                {onNavigateToSports && (
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => onNavigateToSports(event.id)}
                  >
                    Create in Sports
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Conflicts */}
          {conflicts && conflicts.length > 0 && (
            <div className="text-sm">
              <p className="text-text-3 text-xs uppercase tracking-wider font-semibold mb-1">Conflicts</p>
              <div className="space-y-1">
                {conflicts.map((c, i) => (
                  <div key={i} className="text-xs bg-warning/10 text-warning rounded px-2 py-1">
                    {c.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {event.phase && (
            <div className="text-sm">
              <span className="text-text-3 w-20">Phase</span>
              <span className="text-text-2 ml-2">{event.phase}</span>
            </div>
          )}

          {event.complex && (
            <div className="text-sm">
              <span className="text-text-3 w-20">Complex</span>
              <span className="text-text-2 ml-2">{event.complex}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {event && (
        <div className="p-4 border-t">
          <button
            className="btn btn-p w-full"
            onClick={() => onEdit(event)}
          >
            Edit Event
          </button>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Pass new props from PlannerView**

In `src/pages/PlannerView.tsx`, update the `EventDetailPanel` usage (around line 1016):

```tsx
<EventDetailPanel
  event={detailEvent}
  onClose={() => setDetailEvent(null)}
  onEdit={(ev) => { setDetailEvent(null); onEventClick?.(ev) }}
  onStatusChange={handleCtxStatusChange}
  onDuplicate={(ev) => setDuplicateTarget(ev)}
  onNavigateToSports={(eventId) => {
    window.location.href = `/sports?eventId=${eventId}`
  }}
  sports={sports}
  competitions={competitions}
  conflictMap={conflictMap}
/>
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/planner/EventDetailPanel.tsx src/pages/PlannerView.tsx
git commit -m "feat: enhance EventDetailPanel with quick actions, tech plan links, conflicts"
```

---

### Task 5: Expand saved views to capture full filter state

**Files:**
- Modify: `src/services/savedViews.ts`
- Modify: `src/pages/PlannerView.tsx`

**Context:**
- `PlannerFilterState` (in `savedViews.ts`) currently only has `channelFilter` and `calendarMode`.
- PlannerView currently only has `channelFilter` as a filter dropdown. Need to add `sportFilter`, `competitionFilter`, `statusFilter` state + filter dropdowns.
- Backend stores arbitrary JSON in `filterState`, so no migration needed.
- `handleSaveView` (line 256) and `handleLoadView` (line 271) need to serialize/restore all filters.

**Step 1: Expand PlannerFilterState type**

In `src/services/savedViews.ts`, replace the `PlannerFilterState` interface:

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

**Step 2: Add filter state to PlannerView**

In `src/pages/PlannerView.tsx`, after existing `channelFilter` state (line 227), add:

```typescript
const [sportFilter, setSportFilter] = useState<number | undefined>()
const [competitionFilter, setCompetitionFilter] = useState<number | undefined>()
const [statusFilter, setStatusFilter] = useState<string | undefined>()
```

**Step 3: Update `filteredWeekEvents` memo**

Replace the `filteredWeekEvents` memo (around line 397) to include the new filters:

```typescript
const filteredWeekEvents = useMemo(() => {
  let result = weekEvents
  if (channelFilter !== 'all') result = result.filter(e => e.linearChannel === channelFilter)
  if (sportFilter) result = result.filter(e => e.sportId === sportFilter)
  if (competitionFilter) result = result.filter(e => e.competitionId === competitionFilter)
  if (statusFilter) result = result.filter(e => (e.status ?? 'draft') === statusFilter)
  if (localSearch) {
    const q = localSearch.toLowerCase()
    result = result.filter(ev =>
      ev.participants?.toLowerCase().includes(q) ||
      ev.linearChannel?.toLowerCase().includes(q) ||
      sportsMap.get(ev.sportId)?.name?.toLowerCase().includes(q) ||
      compsMap.get(ev.competitionId)?.name?.toLowerCase().includes(q)
    )
  }
  return result
}, [weekEvents, channelFilter, sportFilter, competitionFilter, statusFilter, localSearch, sportsMap, compsMap])
```

**Step 4: Update handleSaveView to serialize all state**

Replace `handleSaveView` (line 256):

```typescript
const handleSaveView = async () => {
  if (!saveViewName.trim()) return
  try {
    const view = await savedViewsApi.create(saveViewName.trim(), 'planner', {
      channelFilter,
      calendarMode: calendarMode ? 'calendar' : 'list',
      sportFilter,
      competitionFilter,
      statusFilter,
      searchText: localSearch || undefined,
      weekOffset,
    })
    setSavedViews(prev => [...prev, view])
    setSaveViewName('')
    setShowSaveInput(false)
  } catch {
    toast.error('Failed to save view')
  }
}
```

**Step 5: Update handleLoadView to restore all state**

Replace `handleLoadView` (line 271):

```typescript
const handleLoadView = (view: SavedView) => {
  const fs = view.filterState as PlannerFilterState
  if (fs.channelFilter) setChannelFilter(fs.channelFilter)
  if (fs.calendarMode === 'calendar') setCalendarMode(true)
  if (fs.calendarMode === 'list') setCalendarMode(false)
  setSportFilter(fs.sportFilter)
  setCompetitionFilter(fs.competitionFilter)
  setStatusFilter(fs.statusFilter)
  setLocalSearch(fs.searchText ?? '')
  if (fs.weekOffset !== undefined) setWeekOffset(fs.weekOffset)
}
```

**Step 6: Add filter dropdowns to the controls row**

In the controls row (after the search input, around line 751), add filter dropdowns before the stats:

```tsx
{/* Sport filter */}
<select
  className="inp text-sm py-1 px-2"
  value={sportFilter ?? ''}
  onChange={e => setSportFilter(e.target.value ? Number(e.target.value) : undefined)}
>
  <option value="">All sports</option>
  {sports.map(s => (
    <option key={s.id} value={s.id}>{s.name}</option>
  ))}
</select>

{/* Competition filter */}
<select
  className="inp text-sm py-1 px-2"
  value={competitionFilter ?? ''}
  onChange={e => setCompetitionFilter(e.target.value ? Number(e.target.value) : undefined)}
>
  <option value="">All competitions</option>
  {competitions.map(c => (
    <option key={c.id} value={c.id}>{c.name}</option>
  ))}
</select>

{/* Status filter */}
<select
  className="inp text-sm py-1 px-2"
  value={statusFilter ?? ''}
  onChange={e => setStatusFilter(e.target.value || undefined)}
>
  <option value="">All statuses</option>
  {(['draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled'] as EventStatus[]).map(s => (
    <option key={s} value={s}>{s}</option>
  ))}
</select>
```

**Step 7: Add PlannerFilterState import**

At the top of PlannerView, update the savedViews import:

```typescript
import { savedViewsApi, type SavedView, type PlannerFilterState } from '../services/savedViews'
```

**Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 9: Commit**

```bash
git add src/services/savedViews.ts src/pages/PlannerView.tsx
git commit -m "feat: expand saved views with sport/competition/status/search/week filters"
```
