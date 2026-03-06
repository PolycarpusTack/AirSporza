# Resource Timeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a visual timeline view to the Resources tab showing resource assignments as horizontal bars positioned by time, with daily/weekly view switching and week navigation.

**Architecture:** One new component `ResourceTimeline.tsx` renders a CSS-grid-based Gantt chart. Weekly view: columns = 7 days, bars stacked per resource row. Daily view: columns = hours (8:00-23:00), bars positioned by start time + duration. Navigation reuses PlannerView's `weekMonday`/`addDays` pattern. The ResourcesTab gets a Table|Timeline toggle and passes assignment + event data. SportsWorkspace passes sports for bar coloring.

**Tech Stack:** React, TypeScript, CSS Grid, Lucide icons, existing BB design tokens

---

## Task Dependency Map

```
Task 1 (ResourceTimeline component)  ──── Task 2 (Wire into ResourcesTab + SportsWorkspace)
```

**Sequential:** Task 1 then Task 2

---

### Task 1: ResourceTimeline Component

**Files:**
- Create: `src/components/sports/ResourceTimeline.tsx`
- Modify: `src/components/sports/index.ts` (add export)

**Context:**
- PlannerView uses these helpers (we duplicate the needed subset, not import, to avoid coupling):
  - `weekMonday(offset)`, `addDays(d, n)`, `dateStr(d)` for week navigation
  - `CAL_START_HOUR=8`, `CAL_END_HOUR=23` for daily view hour range
- Sport has `{ id, name, icon }`. Event has `sportId`. Use sport name as a simple color seed (hash to hue).
- ResourceAssignment has `{ resourceId, techPlanId, quantity, techPlan?: { planType, eventId, event?: { participants, startDateBE, startTimeBE } } }`.
- Resource has `{ id, name, type, capacity, isActive }`.
- Event has `{ id, sportId, participants, startDateBE, startTimeBE, duration }`.

**Step 1: Create ResourceTimeline component**

```tsx
// src/components/sports/ResourceTimeline.tsx
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Btn, Badge } from '../ui'
import type { Resource, ResourceAssignment } from '../../services/resources'
import type { Event, Sport } from '../../data/types'

/* ── Time helpers (duplicated from PlannerView to avoid coupling) ── */

function weekMonday(offsetWeeks = 0): Date {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offsetWeeks * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const CAL_START_HOUR = 8
const CAL_END_HOUR = 23
const HOURS = Array.from({ length: CAL_END_HOUR - CAL_START_HOUR }, (_, i) => CAL_START_HOUR + i)

const DEFAULT_DURATION_HOURS = 3

/* ── Color helpers ── */

function sportColor(sportName: string): { bg: string; border: string; text: string } {
  // Simple hash to generate consistent hue per sport
  let hash = 0
  for (let i = 0; i < sportName.length; i++) {
    hash = sportName.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return {
    bg: `hsla(${hue}, 60%, 50%, 0.15)`,
    border: `hsla(${hue}, 60%, 50%, 0.6)`,
    text: `hsla(${hue}, 60%, 35%, 1)`,
  }
}

/* ── Types ── */

interface ResourceTimelineProps {
  resources: Resource[]
  assignments: Record<number, ResourceAssignment[]>
  events: Event[]
  sports: Sport[]
}

interface BarData {
  assignmentId: number
  resourceId: number
  eventName: string
  planType: string
  sportName: string
  quantity: number
  dateKey: string        // "YYYY-MM-DD"
  startMinutes: number   // minutes from midnight
  durationMinutes: number
}

type ViewMode = 'weekly' | 'daily'

/* ── Component ── */

export function ResourceTimeline({ resources, assignments, events, sports }: ResourceTimelineProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('weekly')
  const [offset, setOffset] = useState(0)

  // Build lookups
  const eventMap = useMemo(() => new Map(events.map(e => [e.id, e])), [events])
  const sportMap = useMemo(() => new Map(sports.map(s => [s.id, s])), [sports])

  // Current week/day
  const monday = weekMonday(offset)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const weekLabel = `${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} \u2013 ${addDays(monday, 6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

  // For daily view, which day are we showing?
  const dayDate = viewMode === 'daily' ? weekMonday(0) : monday
  const dayOffset = viewMode === 'daily' ? offset : 0
  const currentDay = useMemo(() => addDays(new Date(new Date().setHours(0,0,0,0)), viewMode === 'daily' ? offset : 0), [viewMode, offset])
  const currentDayStr = dateStr(currentDay)
  const dayLabel = currentDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // Build bar data from assignments
  const bars: BarData[] = useMemo(() => {
    const result: BarData[] = []
    for (const resource of resources) {
      const ra = assignments[resource.id] || []
      for (const a of ra) {
        const ev = a.techPlan?.event ? eventMap.get(a.techPlan.eventId) ?? null : null
        if (!ev) continue
        const evDate = typeof ev.startDateBE === 'string' ? ev.startDateBE : ev.startDateBE?.toISOString?.().split('T')[0] || ''
        if (!evDate) continue

        const sport = sportMap.get(ev.sportId)
        const startTime = ev.startTimeBE || '12:00'
        const startMin = timeToMinutes(startTime)

        let durationMin = DEFAULT_DURATION_HOURS * 60
        if (ev.duration) {
          const parsed = parseFloat(ev.duration)
          if (!isNaN(parsed) && parsed > 0) durationMin = parsed * 60
        }

        result.push({
          assignmentId: a.id,
          resourceId: resource.id,
          eventName: ev.participants,
          planType: a.techPlan?.planType ?? '',
          sportName: sport?.name ?? 'Unknown',
          quantity: a.quantity,
          dateKey: evDate,
          startMinutes: startMin,
          durationMinutes: durationMin,
        })
      }
    }
    return result
  }, [resources, assignments, eventMap, sportMap])

  // Filter bars for current view
  const visibleDates = useMemo(() => {
    if (viewMode === 'weekly') return new Set(weekDays.map(d => dateStr(d)))
    return new Set([currentDayStr])
  }, [viewMode, weekDays, currentDayStr])

  const filteredBars = useMemo(
    () => bars.filter(b => visibleDates.has(b.dateKey)),
    [bars, visibleDates]
  )

  // Group by resource
  const barsByResource = useMemo(() => {
    const map = new Map<number, BarData[]>()
    for (const r of resources) map.set(r.id, [])
    for (const b of filteredBars) {
      if (!map.has(b.resourceId)) map.set(b.resourceId, [])
      map.get(b.resourceId)!.push(b)
    }
    return map
  }, [resources, filteredBars])

  // Per-resource per-day capacity check
  const getDayUsage = (resourceId: number, dateKey: string): number => {
    return filteredBars
      .filter(b => b.resourceId === resourceId && b.dateKey === dateKey)
      .reduce((sum, b) => sum + b.quantity, 0)
  }

  const activeResources = resources.filter(r => r.isActive)

  if (activeResources.length === 0) {
    return <div className="card p-8 text-center text-text-3 text-sm">No active resources</div>
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Btn variant="ghost" size="xs" onClick={() => setOffset(o => o - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Btn>
          <Btn variant="ghost" size="xs" onClick={() => setOffset(0)}>Today</Btn>
          <Btn variant="ghost" size="xs" onClick={() => setOffset(o => o + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Btn>
          <span className="text-sm font-medium ml-2">
            {viewMode === 'weekly' ? weekLabel : dayLabel}
          </span>
        </div>

        <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
          <button
            onClick={() => { setViewMode('weekly'); setOffset(0) }}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              viewMode === 'weekly' ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => { setViewMode('daily'); setOffset(0) }}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              viewMode === 'daily' ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
            }`}
          >
            Daily
          </button>
        </div>
      </div>

      {/* Timeline grid */}
      <div className="card overflow-auto">
        {viewMode === 'weekly' ? (
          /* ── Weekly view ── */
          <table className="w-full text-xs border-collapse min-w-[700px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface border-b border-r border-border px-3 py-2 text-left font-semibold min-w-[120px]">
                  Resource
                </th>
                {weekDays.map(d => {
                  const ds = dateStr(d)
                  const isToday = ds === dateStr(new Date())
                  return (
                    <th key={ds} className={`border-b border-l border-border px-2 py-2 text-center font-medium min-w-[100px] ${isToday ? 'bg-primary/5' : 'bg-surface'}`}>
                      <div>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                      <div className="text-text-3 font-normal">{d.getDate()}/{d.getMonth() + 1}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {activeResources.map(r => {
                const rBars = barsByResource.get(r.id) || []
                return (
                  <tr key={r.id}>
                    <td className="sticky left-0 z-10 bg-surface border-b border-r border-border px-3 py-2 font-medium whitespace-nowrap">
                      <div>{r.name}</div>
                      <div className="text-text-3 font-normal">cap: {r.capacity}</div>
                    </td>
                    {weekDays.map(d => {
                      const ds = dateStr(d)
                      const dayBars = rBars.filter(b => b.dateKey === ds)
                      const dayUsage = dayBars.reduce((s, b) => s + b.quantity, 0)
                      const overCap = dayUsage >= r.capacity && r.capacity > 0
                      const isToday = ds === dateStr(new Date())

                      return (
                        <td key={ds} className={`border-b border-l border-border px-1 py-1 align-top min-h-[48px] ${isToday ? 'bg-primary/5' : ''} ${overCap ? 'bg-danger/5' : ''}`}>
                          <div className="flex flex-col gap-0.5">
                            {dayBars.map(b => {
                              const c = sportColor(b.sportName)
                              return (
                                <div
                                  key={b.assignmentId}
                                  className="rounded px-1.5 py-0.5 text-[10px] truncate border cursor-default"
                                  style={{ background: c.bg, borderColor: c.border, color: c.text }}
                                  title={`${b.eventName} (${b.planType}) - ${b.sportName}${b.quantity > 1 ? ` x${b.quantity}` : ''}`}
                                >
                                  {b.eventName}
                                </div>
                              )
                            })}
                          </div>
                          {overCap && (
                            <div className="text-[9px] text-danger font-medium mt-0.5">{dayUsage}/{r.capacity}</div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          /* ── Daily view ── */
          <div className="min-w-[900px]">
            {/* Hour headers */}
            <div className="flex border-b border-border">
              <div className="sticky left-0 z-10 bg-surface border-r border-border min-w-[120px] px-3 py-2 text-xs font-semibold">
                Resource
              </div>
              <div className="flex-1 relative" style={{ height: 28 }}>
                {HOURS.map(h => {
                  const leftPct = ((h - CAL_START_HOUR) / (CAL_END_HOUR - CAL_START_HOUR)) * 100
                  return (
                    <div
                      key={h}
                      className="absolute top-0 text-[10px] text-text-3 font-mono"
                      style={{ left: `${leftPct}%` }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Resource rows */}
            {activeResources.map(r => {
              const rBars = (barsByResource.get(r.id) || []).filter(b => b.dateKey === currentDayStr)
              const dayUsage = rBars.reduce((s, b) => s + b.quantity, 0)
              const overCap = dayUsage >= r.capacity && r.capacity > 0
              const totalMinutes = (CAL_END_HOUR - CAL_START_HOUR) * 60

              return (
                <div key={r.id} className={`flex border-b border-border ${overCap ? 'bg-danger/5' : ''}`}>
                  <div className="sticky left-0 z-10 bg-surface border-r border-border min-w-[120px] px-3 py-2 text-xs font-medium whitespace-nowrap">
                    <div>{r.name}</div>
                    <div className="text-text-3 font-normal">
                      {overCap ? <span className="text-danger">{dayUsage}/{r.capacity}</span> : `cap: ${r.capacity}`}
                    </div>
                  </div>
                  <div className="flex-1 relative" style={{ height: Math.max(32, rBars.length * 22 + 8) }}>
                    {/* Hour grid lines */}
                    {HOURS.map(h => {
                      const leftPct = ((h - CAL_START_HOUR) / (CAL_END_HOUR - CAL_START_HOUR)) * 100
                      return (
                        <div
                          key={h}
                          className="absolute top-0 bottom-0 border-l border-border/30"
                          style={{ left: `${leftPct}%` }}
                        />
                      )
                    })}
                    {/* Capacity line */}
                    {r.capacity > 0 && rBars.length > 0 && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-dashed border-danger/30 z-[1]"
                        style={{ top: r.capacity * 22 }}
                      />
                    )}
                    {/* Bars */}
                    {rBars.map((b, idx) => {
                      const startOffset = b.startMinutes - CAL_START_HOUR * 60
                      const leftPct = Math.max(0, (startOffset / totalMinutes) * 100)
                      const widthPct = Math.max(2, (b.durationMinutes / totalMinutes) * 100)
                      const c = sportColor(b.sportName)

                      return (
                        <div
                          key={b.assignmentId}
                          className="absolute rounded border text-[10px] px-1 truncate cursor-default"
                          style={{
                            left: `${leftPct}%`,
                            width: `${Math.min(widthPct, 100 - leftPct)}%`,
                            top: idx * 22 + 4,
                            height: 18,
                            lineHeight: '18px',
                            background: c.bg,
                            borderColor: c.border,
                            color: c.text,
                          }}
                          title={`${b.eventName} (${b.planType}) - ${b.sportName} | ${String(Math.floor(b.startMinutes / 60)).padStart(2, '0')}:${String(b.startMinutes % 60).padStart(2, '0')} (${Math.round(b.durationMinutes / 60)}h)${b.quantity > 1 ? ` x${b.quantity}` : ''}`}
                        >
                          {b.eventName}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Add export to barrel**

In `src/components/sports/index.ts`, add:
```typescript
export { ResourceTimeline } from './ResourceTimeline'
```

**Step 3: Verify TypeScript compiles**

Run: `cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1 | head -30`
Expected: Zero errors (component isn't used yet, so no prop mismatches)

**Step 4: Commit**

```bash
git add src/components/sports/ResourceTimeline.tsx src/components/sports/index.ts
git commit -m "feat: add ResourceTimeline component with weekly/daily Gantt views"
```

---

### Task 2: Wire ResourceTimeline into ResourcesTab + SportsWorkspace

**Files:**
- Modify: `src/components/sports/ResourcesTab.tsx`
- Modify: `src/pages/SportsWorkspace.tsx`

**Context:**
- ResourcesTab currently shows a table. Add a Table|Timeline toggle at the top.
- ResourceTimeline needs: `resources`, `assignments` (the `Record<number, ResourceAssignment[]>`), `events`, `sports`.
- ResourcesTab already has `resources`, `techPlans`, `events`, and fetches its own `assignments`.
- SportsWorkspace needs to pass `sports` to ResourcesTab as a new prop.

**Step 1: Update ResourcesTab to accept sports and render timeline toggle**

Add to `ResourcesTabProps`:
```tsx
interface ResourcesTabProps {
  resources: Resource[]
  techPlans: TechPlan[]
  events: Event[]
  sports: Sport[]  // NEW
}
```

Add import:
```tsx
import type { Event, TechPlan, Sport } from '../../data/types'
import { ResourceTimeline } from './ResourceTimeline'
```

Add state for view mode:
```tsx
const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table')
```

Wrap the existing table in a conditional, add toggle buttons before the table, and render ResourceTimeline when in timeline mode.

The toggle goes right after the `if (resources.length === 0)` early return, before the table:
```tsx
return (
  <>
    {/* View toggle */}
    <div className="flex gap-1 rounded-lg bg-surface-2 p-1 w-fit mb-3">
      <button
        onClick={() => setViewMode('table')}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
          viewMode === 'table' ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
        }`}
      >
        Table
      </button>
      <button
        onClick={() => setViewMode('timeline')}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
          viewMode === 'timeline' ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
        }`}
      >
        Timeline
      </button>
    </div>

    {viewMode === 'table' ? (
      <>
        {/* existing table JSX */}
      </>
    ) : (
      <ResourceTimeline
        resources={resources}
        assignments={assignments}
        events={events}
        sports={sports}
      />
    )}

    {/* assign modal stays outside the conditional */}
  </>
)
```

**Step 2: Pass sports from SportsWorkspace**

In `SportsWorkspace.tsx`, change:
```tsx
<ResourcesTab resources={resources} techPlans={realtimePlans} events={events} />
```
To:
```tsx
<ResourcesTab resources={resources} techPlans={realtimePlans} events={events} sports={sports} />
```

**Step 3: Verify TypeScript compiles cleanly**

Run: `cd /mnt/c/Projects/Planza && npx tsc --noEmit`
Expected: Zero errors

**Step 4: Commit**

```bash
git add src/components/sports/ResourcesTab.tsx src/pages/SportsWorkspace.tsx
git commit -m "feat: wire ResourceTimeline into ResourcesTab with table/timeline toggle"
```
