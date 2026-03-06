# Unified Conflict Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a top-level "Conflicts" tab to SportsWorkspace that unifies crew and resource conflicts with sub-tabs.

**Architecture:** New `detectResourceConflicts()` utility mirrors `detectCrewConflicts()` logic — checks time-window overlaps across resource assignments and flags when concurrent usage exceeds capacity. New `ResourceConflictList` component renders results. SportsWorkspace gets a 5th "Conflicts" tab with Crew/Resources sub-tabs and a combined badge count.

**Tech Stack:** React, TypeScript, existing BB design tokens, existing `crewConflicts.ts` patterns

---

### Task 1: Resource Conflict Detection Utility

**Files:**
- Create: `src/utils/resourceConflicts.ts`

**Context:**
- `src/utils/crewConflicts.ts` has `parseEventWindow()` and `windowsOverlap()` helpers — but they're not exported. We'll duplicate the time-window logic (3 lines each) to avoid coupling.
- `src/services/resources.ts` exports `Resource` and `ResourceAssignment` types. `ResourceAssignment` has `{ id, resourceId, techPlanId, quantity, notes, techPlan?: { id, eventId, event?: Event } }`.
- Resources have a `capacity` field (integer).

**Step 1: Create the utility**

```typescript
// src/utils/resourceConflicts.ts
import type { Event } from '../data/types'
import type { Resource, ResourceAssignment } from '../services/resources'

export interface ResourceConflict {
  resourceName: string
  resourceId: number
  capacity: number
  concurrentCount: number
  overlappingEvents: {
    eventId: number
    eventName: string
    techPlanId: number
    planType: string
    time: string
    quantity: number
  }[]
}

const DEFAULT_DURATION_HOURS = 3

function parseEventWindow(event: Event): { start: number; end: number } | null {
  const dateStr = typeof event.startDateBE === 'string'
    ? event.startDateBE
    : event.startDateBE?.toISOString?.().split('T')[0]
  if (!dateStr || !event.startTimeBE) return null

  const start = new Date(`${dateStr}T${event.startTimeBE}:00`).getTime()
  if (isNaN(start)) return null

  let durationMs = DEFAULT_DURATION_HOURS * 3600000
  if (event.duration) {
    const parsed = parseFloat(event.duration)
    if (!isNaN(parsed) && parsed > 0) durationMs = parsed * 3600000
  }

  return { start, end: start + durationMs }
}

function windowsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * Detect resource conflicts: when concurrent assignments exceed capacity.
 * Groups overlapping assignments by time window and checks against capacity.
 */
export function detectResourceConflicts(
  resources: Resource[],
  allAssignments: Record<number, ResourceAssignment[]>,
  events: Event[]
): ResourceConflict[] {
  const eventMap = new Map(events.map(e => [e.id, e]))
  const conflicts: ResourceConflict[] = []

  for (const resource of resources) {
    const assignments = allAssignments[resource.id]
    if (!assignments || assignments.length < 2) continue

    // Build assignment windows
    const windows: {
      assignment: ResourceAssignment
      event: Event
      window: { start: number; end: number }
    }[] = []

    for (const a of assignments) {
      const eventId = a.techPlan?.eventId ?? a.techPlanId
      const event = a.techPlan?.event
        ? eventMap.get(a.techPlan.event.id) ?? (a.techPlan.event as unknown as Event)
        : eventMap.get(eventId)
      if (!event) continue
      const w = parseEventWindow(event)
      if (!w) continue
      windows.push({ assignment: a, event, window: w })
    }

    if (windows.length < 2) continue

    // For each assignment, find all overlapping ones and check if total > capacity
    const checked = new Set<string>()

    for (let i = 0; i < windows.length; i++) {
      const group = [windows[i]]
      for (let j = 0; j < windows.length; j++) {
        if (i === j) continue
        if (windowsOverlap(windows[i].window, windows[j].window)) {
          group.push(windows[j])
        }
      }

      const totalQty = group.reduce((sum, g) => sum + g.assignment.quantity, 0)
      if (totalQty <= resource.capacity) continue

      // Create a stable key to avoid duplicate conflict entries
      const key = group.map(g => g.assignment.id).sort().join(',')
      if (checked.has(key)) continue
      checked.add(key)

      conflicts.push({
        resourceName: resource.name,
        resourceId: resource.id,
        capacity: resource.capacity,
        concurrentCount: totalQty,
        overlappingEvents: group.map(g => {
          const dateStr = typeof g.event.startDateBE === 'string'
            ? g.event.startDateBE
            : g.event.startDateBE?.toISOString?.().split('T')[0] || ''
          return {
            eventId: g.event.id,
            eventName: g.event.participants,
            techPlanId: g.assignment.techPlanId,
            planType: g.assignment.techPlan?.planType ?? 'Unknown',
            time: `${dateStr} ${g.event.startTimeBE ?? ''}`.trim(),
            quantity: g.assignment.quantity,
          }
        }),
      })
    }
  }

  return conflicts.sort((a, b) => (b.concurrentCount - b.capacity) - (a.concurrentCount - a.capacity))
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/utils/resourceConflicts.ts
git commit -m "feat: add resource conflict detection utility"
```

---

### Task 2: ResourceConflictList Component

**Files:**
- Create: `src/components/sports/ResourceConflictList.tsx`
- Modify: `src/components/sports/index.ts` — add export

**Context:**
- Uses BB design tokens: `card`, `bg-surface-2`, `text-text-2`, `text-text-3`, `border-border`
- Uses existing `Badge` component from `../ui`
- Uses `AlertTriangle`, `CheckCircle` from `lucide-react`
- Mirrors `ConflictDashboard` structure (empty state with green checkmark, grouped cards)

**Step 1: Create the component**

```typescript
// src/components/sports/ResourceConflictList.tsx
import { AlertTriangle, CheckCircle, Server } from 'lucide-react'
import { Badge } from '../ui'
import type { ResourceConflict } from '../../utils/resourceConflicts'

interface ResourceConflictListProps {
  conflicts: ResourceConflict[]
}

export function ResourceConflictList({ conflicts }: ResourceConflictListProps) {
  if (conflicts.length === 0) {
    return (
      <div className="card p-10 text-center">
        <CheckCircle className="w-10 h-10 text-success mx-auto mb-3" />
        <div className="font-medium text-lg mb-1">No Resource Conflicts</div>
        <div className="text-sm text-text-3">All resources are within capacity limits.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-text-2">
        <AlertTriangle className="w-4 h-4 text-danger" />
        <span>
          {conflicts.length} resource{conflicts.length !== 1 ? 's' : ''} over capacity
        </span>
      </div>

      {conflicts.map((c, ci) => {
        const overBy = c.concurrentCount - c.capacity
        return (
          <div key={ci} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-danger" />
                <span className="font-bold">{c.resourceName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-3">
                  {c.concurrentCount}/{c.capacity} used
                </span>
                <Badge variant="danger">+{overBy} over</Badge>
              </div>
            </div>
            {/* Capacity bar */}
            <div className="px-4 pt-3 pb-1">
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-danger transition-all"
                  style={{ width: `${Math.min((c.concurrentCount / c.capacity) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div className="divide-y divide-border/60">
              {c.overlappingEvents.map((ev, ei) => (
                <div key={ei} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{ev.eventName}</div>
                    <div className="text-xs text-text-3">
                      <span className="font-mono text-text-2">{ev.planType}</span>
                      {ev.quantity > 1 && <span className="ml-1">(x{ev.quantity})</span>}
                    </div>
                  </div>
                  <div className="text-xs text-text-3 font-mono whitespace-nowrap">{ev.time}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

**Step 2: Add export to barrel file**

In `src/components/sports/index.ts`, add:
```typescript
export { ResourceConflictList } from './ResourceConflictList'
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/sports/ResourceConflictList.tsx src/components/sports/index.ts
git commit -m "feat: add ResourceConflictList component"
```

---

### Task 3: Wire Conflicts Tab into SportsWorkspace

**Files:**
- Modify: `src/pages/SportsWorkspace.tsx`

**Context:**
- SportsWorkspace currently has 4 tabs: events, plans, crew, resources
- It already computes `crewConflicts`, `conflictGroups` via `detectCrewConflicts` and `groupConflictsByPerson`
- It already has `resources` and `allAssignments` state
- The Crew tab has an "assignments/conflicts" sub-tab toggle — the new Conflicts tab is separate and top-level

**Step 1: Add imports**

At the top of `SportsWorkspace.tsx`, add:
```typescript
import { ResourceConflictList } from '../components/sports/ResourceConflictList'
import { detectResourceConflicts } from '../utils/resourceConflicts'
```

**Step 2: Compute resource conflicts**

After the existing `conflictGroups` useMemo, add:
```typescript
const resourceConflicts = useMemo(
  () => detectResourceConflicts(resources, allAssignments, events),
  [resources, allAssignments, events]
)
```

**Step 3: Update tab type and add "conflicts" tab**

Change the `activeTab` state type:
```typescript
const [activeTab, setActiveTab] = useState<'events' | 'plans' | 'crew' | 'resources' | 'conflicts'>('events')
```

Add "conflicts" to the tab bar array (after resources):
```typescript
{ id: 'conflicts', label: `Conflicts${(conflictGroups.length + resourceConflicts.length) > 0 ? ` (${conflictGroups.length + resourceConflicts.length})` : ''}` },
```

**Step 4: Add conflicts tab content**

After the resources tab section `{activeTab === 'resources' && (...)}`, add:
```typescript
{activeTab === 'conflicts' && (
  <div className="animate-fade-in space-y-4">
    <div className="flex gap-1 rounded-lg bg-surface-2 p-1 w-fit">
      <button
        onClick={() => setConflictSubTab('crew')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1.5 ${
          conflictSubTab === 'crew' ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
        }`}
      >
        Crew
        {conflictGroups.length > 0 && (
          <span className="rounded-full bg-warning/20 text-warning px-1.5 py-0.5 text-xs font-bold">{conflictGroups.length}</span>
        )}
      </button>
      <button
        onClick={() => setConflictSubTab('resources')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1.5 ${
          conflictSubTab === 'resources' ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
        }`}
      >
        Resources
        {resourceConflicts.length > 0 && (
          <span className="rounded-full bg-danger/20 text-danger px-1.5 py-0.5 text-xs font-bold">{resourceConflicts.length}</span>
        )}
      </button>
    </div>

    {conflictSubTab === 'crew' ? (
      <ConflictDashboard groups={conflictGroups} />
    ) : (
      <ResourceConflictList conflicts={resourceConflicts} />
    )}
  </div>
)}
```

**Step 5: Add conflictSubTab state**

Near the other state declarations:
```typescript
const [conflictSubTab, setConflictSubTab] = useState<'crew' | 'resources'>('crew')
```

**Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/pages/SportsWorkspace.tsx
git commit -m "feat: add unified Conflicts tab with crew + resource sub-tabs"
```
