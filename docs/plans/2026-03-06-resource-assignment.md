# Resource Assignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable resource assignment from both the Events tab (per-plan section in TechPlanCard) and the Resources tab (assign modal with unassign buttons and over-capacity badges).

**Architecture:** Three components — (1) a `ResourceSection` collapsible inside TechPlanCard showing assigned resources with add/remove, (2) a `ResourceAssignModal` for assigning a resource to tech plans from the Resources tab, (3) an enhanced `ResourcesTab` with assign/unassign actions and over-capacity indicators. All use the existing backend API (`POST /resources/:id/assign`, `DELETE /resources/:id/assign/:techPlanId`, `GET /resources/:id/assignments`).

**Tech Stack:** React, TypeScript, Lucide icons, existing Btn/Badge/Modal components, resourcesApi service

---

## Task Dependency Map

```
Task 1 (ResourceSection)     ─────────┐
                                       ├── Task 3 (Wire into SportsWorkspace)
Task 2 (Enhanced ResourcesTab) ───────┘
```

**Batch A (parallel):** Tasks 1 + 2
**Batch B (sequential):** Task 3

---

### Task 1: ResourceSection for TechPlanCard

**Files:**
- Create: `src/components/sports/ResourceSection.tsx`
- Modify: `src/components/sports/TechPlanCard.tsx` (add ResourceSection at bottom)
- Modify: `src/components/sports/index.ts` (add export)

**Context:**
- TechPlanCard currently has: crew fields grid, custom fields section, action buttons.
- ResourceSection goes below custom fields, inside `<div className="p-4">` block, after the `isEditing && ...` buttons (line 222-229 of TechPlanCard.tsx).
- Uses `resourcesApi.assign(resourceId, { techPlanId, quantity })` and `resourcesApi.unassign(resourceId, techPlanId)`.
- Resources list and assignments are passed as props from SportsWorkspace (Task 3 wires this).

**Step 1: Create ResourceSection component**

```tsx
// src/components/sports/ResourceSection.tsx
import { useState } from 'react'
import { ChevronDown, ChevronRight, X, AlertTriangle } from 'lucide-react'
import { Btn, Badge } from '../ui'
import { resourcesApi, RESOURCE_TYPE_LABELS } from '../../services/resources'
import type { Resource, ResourceAssignment } from '../../services/resources'
import { useToast } from '../Toast'

interface ResourceSectionProps {
  planId: number
  resources: Resource[]
  assignments: ResourceAssignment[]  // assignments for THIS plan
  onAssignmentChange: () => void     // trigger parent to refetch assignments
}

export function ResourceSection({ planId, resources, assignments, onAssignmentChange }: ResourceSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const toast = useToast()

  // Group available resources by type, exclude already-assigned
  const assignedResourceIds = new Set(assignments.map(a => a.resourceId))
  const available = resources.filter(r => r.isActive && !assignedResourceIds.has(r.id))
  const grouped = available.reduce<Record<string, Resource[]>>((acc, r) => {
    const label = RESOURCE_TYPE_LABELS[r.type] ?? r.type
    if (!acc[label]) acc[label] = []
    acc[label].push(r)
    return acc
  }, {})

  const handleAssign = async (resourceId: number) => {
    setAdding(true)
    try {
      await resourcesApi.assign(resourceId, { techPlanId: planId })
      toast.success('Resource assigned')
      onAssignmentChange()
      setAddOpen(false)
    } catch {
      toast.error('Failed to assign resource')
    } finally {
      setAdding(false)
    }
  }

  const handleUnassign = async (resourceId: number) => {
    try {
      await resourcesApi.unassign(resourceId, planId)
      toast.success('Resource removed')
      onAssignmentChange()
    } catch {
      toast.error('Failed to remove resource')
    }
  }

  // Calculate total used per resource (across all plans) — for capacity display
  // This is approximate; full accuracy requires the parent to pass total counts.
  // We show the resource's capacity and the assignment quantity for this plan.

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-2 hover:text-text transition"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Resources ({assignments.length})
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Assigned resources */}
          {assignments.length === 0 ? (
            <div className="text-xs text-text-3 py-1">No resources assigned</div>
          ) : (
            assignments.map(a => {
              const res = resources.find(r => r.id === a.resourceId)
              return (
                <div key={a.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{res?.name ?? `Resource #${a.resourceId}`}</span>
                    <span className="text-xs text-text-3 font-mono">{res ? RESOURCE_TYPE_LABELS[res.type] : ''}</span>
                    {a.quantity > 1 && <Badge variant="default">×{a.quantity}</Badge>}
                    {a.notes && <span className="text-xs text-text-3 italic">{a.notes}</span>}
                  </div>
                  <button
                    onClick={() => handleUnassign(a.resourceId)}
                    className="p-1 rounded hover:bg-surface text-text-3 hover:text-danger transition"
                    title="Remove resource"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })
          )}

          {/* Add resource dropdown */}
          <div className="relative">
            <Btn variant="ghost" size="xs" onClick={() => setAddOpen(!addOpen)} disabled={adding || available.length === 0}>
              + Add Resource
            </Btn>
            {addOpen && (
              <div className="absolute left-0 z-20 mt-1 w-64 rounded-md border border-border bg-surface shadow-lg max-h-60 overflow-y-auto">
                {Object.entries(grouped).map(([type, items]) => (
                  <div key={type}>
                    <div className="px-3 py-1.5 text-xs font-bold uppercase text-text-3 bg-surface-2">{type}</div>
                    {items.map(r => (
                      <button
                        key={r.id}
                        onClick={() => handleAssign(r.id)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2 transition flex items-center justify-between"
                      >
                        <span>{r.name}</span>
                        <span className="text-xs text-text-3">cap: {r.capacity}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {available.length === 0 && (
                  <div className="px-3 py-3 text-xs text-text-3 text-center">All resources assigned</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Add ResourceSection to TechPlanCard**

In `TechPlanCard.tsx`:
1. Add new props: `resources`, `planAssignments`, `onAssignmentChange`
2. Import and render `<ResourceSection>` after the custom fields / edit buttons section, still inside the `<div className="p-4">` wrapper
3. Import types from resources service

Add to TechPlanCardProps interface:
```tsx
import type { Resource, ResourceAssignment } from '../../services/resources'

// Add to interface:
resources?: Resource[]
planAssignments?: ResourceAssignment[]
onAssignmentChange?: () => void
```

Render after the `isEditing && ...` block (after line 229), before the closing `</div>` of the p-4 wrapper:
```tsx
{resources && planAssignments && onAssignmentChange && (
  <ResourceSection
    planId={plan.id}
    resources={resources}
    assignments={planAssignments}
    onAssignmentChange={onAssignmentChange}
  />
)}
```

**Step 3: Add export to barrel**

In `src/components/sports/index.ts`, add:
```typescript
export { ResourceSection } from './ResourceSection'
```

**Step 4: Verify TypeScript compiles**

Run: `cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1 | head -30`
Expected: May have errors from SportsWorkspace (Task 3 wires the new props). Fix only errors in your files.

**Step 5: Commit**

```bash
git add src/components/sports/ResourceSection.tsx src/components/sports/TechPlanCard.tsx src/components/sports/index.ts
git commit -m "feat: add ResourceSection to TechPlanCard for per-plan resource assignment"
```

---

### Task 2: Enhanced ResourcesTab with Assign Modal

**Files:**
- Rewrite: `src/components/sports/ResourcesTab.tsx`

**Context:**
- Current ResourcesTab is a read-only table (87 lines) showing resources with lazy-loaded assignments.
- Needs: "Assign" button per resource → opens modal, "Unassign" per assignment, over-capacity badge, real-time count updates.
- Uses `resourcesApi.assign()`, `resourcesApi.unassign()`, `resourcesApi.getAssignments()`.
- Tech plans and events needed for the assign modal — passed as new props.

**Step 1: Rewrite ResourcesTab with enhanced features**

New props interface:
```tsx
interface ResourcesTabProps {
  resources: Resource[]
  techPlans: TechPlan[]
  events: Event[]
}
```

The rewritten component adds:
1. Per-resource "Assign" button that opens a modal
2. The modal lists tech plans grouped by event, with checkboxes to select which plans to assign
3. Per-assignment "Unassign" button (small X) next to each assignment
4. Over-capacity badge: when total assigned quantity >= resource capacity, show red "Over capacity" badge
5. Refetch assignments after any assign/unassign action
6. Import `useToast` for feedback

Full implementation:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { X, Plus } from 'lucide-react'
import { Badge, Btn } from '../ui'
import { resourcesApi, RESOURCE_TYPE_LABELS } from '../../services/resources'
import type { Resource, ResourceAssignment } from '../../services/resources'
import type { Event, TechPlan } from '../../data/types'
import { useToast } from '../Toast'
import { fmtDate } from '../../utils'

interface ResourcesTabProps {
  resources: Resource[]
  techPlans: TechPlan[]
  events: Event[]
}

interface AssignModalState {
  resource: Resource
  existingPlanIds: Set<number>
}

export function ResourcesTab({ resources, techPlans, events }: ResourcesTabProps) {
  const [assignments, setAssignments] = useState<Record<number, ResourceAssignment[]>>({})
  const [assignModal, setAssignModal] = useState<AssignModalState | null>(null)
  const [selectedPlans, setSelectedPlans] = useState<Set<number>>(new Set())
  const [assigning, setAssigning] = useState(false)
  const toast = useToast()

  const fetchAssignments = useCallback(() => {
    if (resources.length === 0) return
    Promise.all(resources.map(r => resourcesApi.getAssignments(r.id).then(a => ({ id: r.id, a }))))
      .then(results => {
        const next: Record<number, ResourceAssignment[]> = {}
        for (const { id, a } of results) next[id] = a
        setAssignments(next)
      })
      .catch(() => {})
  }, [resources])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  const eventMap = new Map(events.map(e => [e.id, e]))

  const handleUnassign = async (resourceId: number, techPlanId: number) => {
    try {
      await resourcesApi.unassign(resourceId, techPlanId)
      toast.success('Resource unassigned')
      fetchAssignments()
    } catch {
      toast.error('Failed to unassign')
    }
  }

  const openAssignModal = (resource: Resource) => {
    const ra = assignments[resource.id] || []
    setAssignModal({ resource, existingPlanIds: new Set(ra.map(a => a.techPlanId)) })
    setSelectedPlans(new Set())
  }

  const handleBulkAssign = async () => {
    if (!assignModal || selectedPlans.size === 0) return
    setAssigning(true)
    try {
      for (const planId of selectedPlans) {
        await resourcesApi.assign(assignModal.resource.id, { techPlanId: planId })
      }
      toast.success(`Assigned to ${selectedPlans.size} plan${selectedPlans.size !== 1 ? 's' : ''}`)
      setAssignModal(null)
      fetchAssignments()
    } catch {
      toast.error('Failed to assign resource')
    } finally {
      setAssigning(false)
    }
  }

  // Group tech plans by event for the assign modal
  const plansByEvent = new Map<number, TechPlan[]>()
  for (const p of techPlans) {
    if (!plansByEvent.has(p.eventId)) plansByEvent.set(p.eventId, [])
    plansByEvent.get(p.eventId)!.push(p)
  }

  if (resources.length === 0) {
    return <div className="card p-8 text-center text-text-3 text-sm">No resources configured yet</div>
  }

  return (
    <>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Name</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Type</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Capacity</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Status</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Current Assignments</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {resources.map(r => {
              const ra = assignments[r.id]
              const totalUsed = ra ? ra.reduce((sum, a) => sum + a.quantity, 0) : 0
              const overCapacity = totalUsed >= r.capacity && r.capacity > 0

              return (
                <tr key={r.id} className="hover:bg-surface-2 transition align-top">
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-text-2 text-xs font-mono uppercase">{RESOURCE_TYPE_LABELS[r.type] ?? r.type}</td>
                  <td className="px-4 py-3 text-text-2">
                    <span className={overCapacity ? 'text-danger font-bold' : ''}>
                      {totalUsed}/{r.capacity}
                    </span>
                    {overCapacity && <Badge variant="danger" className="ml-1.5">Over</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="none">Inactive</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {ra === undefined ? (
                      <span className="text-text-3 text-xs">Loading...</span>
                    ) : ra.length === 0 ? (
                      <span className="text-text-3 text-xs">No assignments</span>
                    ) : (
                      <div className="space-y-1">
                        {ra.map(a => (
                          <div key={a.id} className="flex items-center gap-1.5 text-xs text-text-2">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                            <span className="font-mono text-text-3">{a.techPlan?.planType ?? `Plan #${a.techPlanId}`}</span>
                            {a.techPlan?.event
                              ? <span className="truncate max-w-[160px]">{a.techPlan.event.participants}</span>
                              : <span className="text-text-3">Event #{a.techPlan?.eventId}</span>
                            }
                            {a.quantity > 1 && <span className="text-text-3">(x{a.quantity})</span>}
                            <button
                              onClick={() => handleUnassign(r.id, a.techPlanId)}
                              className="ml-auto p-0.5 rounded hover:bg-surface text-text-3 hover:text-danger transition"
                              title="Unassign"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Btn variant="ghost" size="xs" onClick={() => openAssignModal(r)}>
                      <Plus className="w-3 h-3 mr-1" /> Assign
                    </Btn>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setAssignModal(null)}>
          <div className="card w-full max-w-lg rounded-lg p-5 shadow-md animate-scale-in max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-lg">Assign: {assignModal.resource.name}</h4>
              <button onClick={() => setAssignModal(null)} className="p-1 rounded hover:bg-surface-2 text-text-3"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-text-3 mb-3">
              {RESOURCE_TYPE_LABELS[assignModal.resource.type]} — Capacity: {assignModal.resource.capacity}
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {techPlans.length === 0 ? (
                <div className="text-sm text-text-3 text-center py-4">No tech plans available</div>
              ) : (
                [...plansByEvent.entries()].map(([eventId, plans]) => {
                  const ev = eventMap.get(eventId)
                  const unassignedPlans = plans.filter(p => !assignModal.existingPlanIds.has(p.id))
                  if (unassignedPlans.length === 0) return null
                  return (
                    <div key={eventId}>
                      <div className="text-xs font-medium text-text-2 mb-1">
                        {ev?.participants ?? `Event #${eventId}`}
                        {ev && <span className="text-text-3 ml-1.5">{fmtDate(ev.startDateBE)} {ev.startTimeBE}</span>}
                      </div>
                      {unassignedPlans.map(p => (
                        <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedPlans.has(p.id)}
                            onChange={() => {
                              setSelectedPlans(prev => {
                                const next = new Set(prev)
                                if (next.has(p.id)) next.delete(p.id)
                                else next.add(p.id)
                                return next
                              })
                            }}
                            className="rounded"
                          />
                          <span className="text-sm">{p.planType}</span>
                          {p.isLivestream && <Badge variant="live">Live</Badge>}
                        </label>
                      ))}
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex gap-2">
              <Btn variant="primary" className="flex-1" onClick={handleBulkAssign} disabled={selectedPlans.size === 0 || assigning}>
                Assign ({selectedPlans.size})
              </Btn>
              <Btn variant="default" className="flex-1" onClick={() => setAssignModal(null)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1 | head -30`
Expected: Errors from SportsWorkspace about ResourcesTab missing new props (expected — Task 3 fixes).

**Step 3: Commit**

```bash
git add src/components/sports/ResourcesTab.tsx
git commit -m "feat: enhanced ResourcesTab with assign modal, unassign buttons, over-capacity badges"
```

---

### Task 3: Wire Resource Assignment into SportsWorkspace

**Files:**
- Modify: `src/pages/SportsWorkspace.tsx`

**Context:**
- SportsWorkspace already imports `resourcesApi` and `resources` state.
- Need to add: (1) `allAssignments` state to track resource assignments, (2) pass resources + assignments to TechPlanCard, (3) pass techPlans + events to ResourcesTab, (4) refetch assignments callback.
- TechPlanCard needs new optional props: `resources`, `planAssignments`, `onAssignmentChange`.
- ResourcesTab needs new props: `techPlans`, `events`.

**Step 1: Add assignment state and fetch logic**

In SportsWorkspace, after the `resources` state declaration, add:
```tsx
const [allAssignments, setAllAssignments] = useState<Record<number, ResourceAssignment[]>>({})
```

Import ResourceAssignment type:
```tsx
import type { ResourceAssignment } from '../services/resources'
```

Add fetch function (after the useEffect that loads resources):
```tsx
const fetchAllAssignments = useCallback(() => {
  if (resources.length === 0) return
  Promise.all(resources.map(r => resourcesApi.getAssignments(r.id).then(a => ({ id: r.id, a }))))
    .then(results => {
      const next: Record<number, ResourceAssignment[]> = {}
      for (const { id, a } of results) next[id] = a
      setAllAssignments(next)
    })
    .catch(() => {})
}, [resources])

useEffect(() => { fetchAllAssignments() }, [fetchAllAssignments])
```

Add a helper to get assignments for a specific plan:
```tsx
const getAssignmentsForPlan = useCallback((planId: number): ResourceAssignment[] => {
  const result: ResourceAssignment[] = []
  for (const ra of Object.values(allAssignments)) {
    for (const a of ra) {
      if (a.techPlanId === planId) result.push(a)
    }
  }
  return result
}, [allAssignments])
```

**Step 2: Pass new props to TechPlanCard**

In the `eventPlans.map(plan => ...)` section, add to TechPlanCard:
```tsx
resources={resources}
planAssignments={getAssignmentsForPlan(plan.id)}
onAssignmentChange={fetchAllAssignments}
```

**Step 3: Pass new props to ResourcesTab**

Change:
```tsx
<ResourcesTab resources={resources} />
```
To:
```tsx
<ResourcesTab resources={resources} techPlans={realtimePlans} events={events} />
```

**Step 4: Verify TypeScript compiles cleanly**

Run: `cd /mnt/c/Projects/Planza && npx tsc --noEmit`
Expected: Zero errors

**Step 5: Commit**

```bash
git add src/pages/SportsWorkspace.tsx
git commit -m "feat: wire resource assignment into SportsWorkspace — per-plan and per-resource entry points"
```
