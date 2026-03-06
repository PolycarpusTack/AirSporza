# Enhanced Crew Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Crew tab from a read-only 4-column table into a full-featured workspace with inline editing, search, sort, bulk template apply, conflict badges, and a crew-member-by-event matrix view.

**Architecture:** Rewrite `CrewTab.tsx` as an enhanced table with all visible crew fields, inline click-to-edit cells (reusing the existing `Autocomplete` component), search/sort/filter controls, checkbox selection for bulk template apply, and conflict badge overlays. Add a new `CrewMatrixView.tsx` component that fetches crew members from the roster API and renders a person-by-event grid with color-coded cells and click-to-assign popovers. Wire both views into `SportsWorkspace.tsx` with a Table|Matrix toggle sharing filter state.

**Tech Stack:** React, TypeScript, Lucide icons, existing Autocomplete + Btn + Badge components, crewMembersApi, crewTemplatesApi, crewConflicts utility

---

## Task Dependency Map

```
Task 1 (Enhanced CrewTab)  ─────────────┐
                                         ├── Task 3 (Wire into SportsWorkspace)
Task 2 (CrewMatrixView)    ─────────────┘
```

**Batch A (parallel):** Tasks 1 + 2
**Batch B (sequential):** Task 3

---

### Task 1: Enhanced Crew Table View

**Files:**
- Rewrite: `src/components/sports/CrewTab.tsx`

**Context:**
- Current CrewTab is a 47-line read-only table showing only `visibleFields.slice(0, 4)`.
- Must show ALL visible crew fields with horizontal scroll, inline editing via Autocomplete, conflict badges, search bar, sortable columns, and bulk template apply.
- Reuse existing `Autocomplete` component from `src/components/ui/Autocomplete.tsx`.
- Conflict data uses `ConflictMap` type (Map keyed by `"planId:fieldId"`).
- Templates fetched via `crewTemplatesApi.list()`.
- Crew edits go through `onCrewEdit(planId, fieldId, value)` callback.
- Bulk template apply goes through `onBatchApply(planIds, crewData)` callback.

**Step 1: Rewrite CrewTab with full implementation**

```tsx
import { useState, useMemo, useEffect } from 'react'
import { Search, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, ChevronDown } from 'lucide-react'
import { Autocomplete, Btn, Badge } from '../ui'
import { crewMembersApi } from '../../services/crewMembers'
import { crewTemplatesApi } from '../../services/crewTemplates'
import type { Event, TechPlan, FieldConfig, CrewTemplate } from '../../data/types'
import type { ConflictMap } from '../../utils/crewConflicts'

interface CrewTabProps {
  plans: TechPlan[]
  events: Event[]
  crewFields: FieldConfig[]
  conflicts: ConflictMap
  onCrewEdit: (planId: number, fieldId: string, value: string) => void
  onBatchApply: (planIds: number[], crewData: Record<string, unknown>) => void
}

type SortDir = 'asc' | 'desc' | null

export function CrewTab({ plans, events, crewFields, conflicts, onCrewEdit, onBatchApply }: CrewTabProps) {
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [editingCell, setEditingCell] = useState<string | null>(null) // "planId:fieldId"
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [templates, setTemplates] = useState<CrewTemplate[]>([])
  const [showBulkTemplates, setShowBulkTemplates] = useState(false)

  const visibleFields = useMemo(
    () => crewFields.filter(f => f.visible && f.type !== 'checkbox').sort((a, b) => a.order - b.order),
    [crewFields]
  )

  useEffect(() => {
    crewTemplatesApi.list().then(setTemplates).catch(() => {})
  }, [])

  const eventMap = useMemo(() => new Map(events.map(e => [e.id, e])), [events])

  // Filter plans by search (matches person name, event name, plan type)
  const filteredPlans = useMemo(() => {
    if (!search.trim()) return plans
    const q = search.toLowerCase()
    return plans.filter(plan => {
      const ev = eventMap.get(plan.eventId)
      if (ev?.participants.toLowerCase().includes(q)) return true
      if (plan.planType.toLowerCase().includes(q)) return true
      const crew = plan.crew as Record<string, unknown>
      return Object.values(crew).some(v => typeof v === 'string' && v.toLowerCase().includes(q))
    })
  }, [plans, search, eventMap])

  // Sort
  const sortedPlans = useMemo(() => {
    if (!sortCol || !sortDir) return filteredPlans
    const sorted = [...filteredPlans]
    sorted.sort((a, b) => {
      let valA: string, valB: string
      if (sortCol === '_event') {
        valA = eventMap.get(a.eventId)?.participants ?? ''
        valB = eventMap.get(b.eventId)?.participants ?? ''
      } else if (sortCol === '_type') {
        valA = a.planType
        valB = b.planType
      } else {
        valA = ((a.crew as Record<string, unknown>)[sortCol] as string) ?? ''
        valB = ((b.crew as Record<string, unknown>)[sortCol] as string) ?? ''
      }
      const cmp = valA.localeCompare(valB)
      return sortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [filteredPlans, sortCol, sortDir, eventMap])

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') { setSortCol(null); setSortDir(null) }
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const allSelected = sortedPlans.length > 0 && sortedPlans.every(p => selected.has(p.id))
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(sortedPlans.map(p => p.id)))
  }
  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 text-text-3" />
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
  }

  if (plans.length === 0) {
    return <div className="card p-8 text-center text-text-3 text-sm">No crew assignments yet</div>
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by person, event, or plan type..."
            className="inp w-full pl-9"
          />
        </div>
        {selected.size > 0 && (
          <div className="relative">
            <Btn variant="primary" size="sm" onClick={() => setShowBulkTemplates(!showBulkTemplates)}>
              Apply Template ({selected.size}) <ChevronDown className="w-3 h-3 ml-1" />
            </Btn>
            {showBulkTemplates && (
              <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-surface shadow-md max-h-64 overflow-y-auto">
                {templates.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-text-3">No templates yet</div>
                )}
                {templates.filter(t => t.planType !== null).map(t => (
                  <button key={t.id} onClick={() => { onBatchApply([...selected], t.crewData); setShowBulkTemplates(false); setSelected(new Set()) }}
                    className="w-full px-3 py-2 text-left text-sm text-text-2 hover:bg-surface-2 transition">{t.name} <span className="text-text-3 text-xs">(default)</span></button>
                ))}
                {templates.filter(t => t.planType === null).map(t => (
                  <button key={t.id} onClick={() => { onBatchApply([...selected], t.crewData); setShowBulkTemplates(false); setSelected(new Set()) }}
                    className="w-full px-3 py-2 text-left text-sm text-text-2 hover:bg-surface-2 transition">{t.name}{t.isShared ? '' : ' (private)'}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <span className="text-xs text-text-3">{sortedPlans.length} plan{sortedPlans.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-border" />
                </th>
                <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('_event')}>
                  <span className="inline-flex items-center gap-1">Event <SortIcon col="_event" /></span>
                </th>
                <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('_type')}>
                  <span className="inline-flex items-center gap-1">Type <SortIcon col="_type" /></span>
                </th>
                {visibleFields.map(f => (
                  <th key={f.id} className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(f.id)}>
                    <span className="inline-flex items-center gap-1">{f.label} <SortIcon col={f.id} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sortedPlans.map(plan => {
                const ev = eventMap.get(plan.eventId)
                const crew = plan.crew as Record<string, unknown>
                return (
                  <tr key={plan.id} className={`transition ${selected.has(plan.id) ? 'bg-primary/5' : 'hover:bg-surface-2'}`}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(plan.id)} onChange={() => toggleOne(plan.id)} className="rounded border-border" />
                    </td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap max-w-[200px] truncate">{ev?.participants ?? `Event #${plan.eventId}`}</td>
                    <td className="px-3 py-2.5 text-muted text-xs font-mono uppercase whitespace-nowrap">{plan.planType}</td>
                    {visibleFields.map(field => {
                      const cellKey = `${plan.id}:${field.id}`
                      const value = (crew[field.id] as string) || ''
                      const cellConflicts = conflicts.get(cellKey)
                      const isEditing = editingCell === cellKey

                      return (
                        <td key={field.id} className="px-3 py-2.5 min-w-[140px]">
                          {isEditing ? (
                            <Autocomplete
                              value={value}
                              onChange={val => onCrewEdit(plan.id, field.id, val)}
                              onSearch={async (q) => {
                                const results = await crewMembersApi.autocomplete(q, field.id)
                                return results.map(r => ({
                                  id: r.id,
                                  label: r.name,
                                  subtitle: (r.roles as string[]).filter(role => role !== field.id).join(', ') || undefined,
                                }))
                              }}
                              placeholder={field.label}
                              className="text-xs"
                            />
                          ) : (
                            <div
                              className="flex items-center gap-1 cursor-pointer group min-h-[28px] rounded px-1 -mx-1 hover:bg-surface-2"
                              onClick={() => setEditingCell(cellKey)}
                            >
                              <span className={`text-sm ${value ? 'text-text-2' : 'text-text-3 italic'}`}>
                                {value || 'Click to assign'}
                              </span>
                              {cellConflicts && cellConflicts.length > 0 && (
                                <div className="relative group/tip">
                                  <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/tip:block z-20 w-56 rounded-md border border-border bg-surface p-2 shadow-md text-xs">
                                    {cellConflicts.map((c, i) => (
                                      <div key={i} className="mb-1 last:mb-0">
                                        <span className="text-warning font-medium">Also assigned to</span>{' '}
                                        <span className="font-medium text-text">{c.eventName}</span>{' '}
                                        as <span className="font-mono">{c.role}</span> at {c.startTime}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1 | head -30`
Expected: Errors about mismatched props in SportsWorkspace (expected — Task 3 fixes this)

**Step 3: Commit**

```bash
git add src/components/sports/CrewTab.tsx
git commit -m "feat: enhanced CrewTab with inline edit, search, sort, bulk template apply, conflict badges"
```

---

### Task 2: Crew Matrix View

**Files:**
- Create: `src/components/sports/CrewMatrixView.tsx`
- Modify: `src/components/sports/index.ts` (add export)

**Context:**
- Rows = crew members fetched from `crewMembersApi.list({ active: true })`.
- Columns = events that have tech plans, grouped by date, sorted chronologically.
- Cells show the role(s) a person holds for that event's tech plans. Multiple roles shown as comma-separated.
- Color coding: green (single assignment), orange (conflict — person has overlapping assignments), grey (unassigned).
- Click cell to open a popover with role dropdown to assign/unassign.
- Sticky first column (person name) for horizontal scroll.
- Filter by role (dropdown), sport (reuse sport chips state), and date range (optional, simple date inputs).
- Uses `ConflictMap` from crewConflicts utility to detect orange cells.

**Step 1: Create CrewMatrixView component**

```tsx
import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { Badge, Btn } from '../ui'
import { crewMembersApi } from '../../services/crewMembers'
import type { Event, TechPlan, FieldConfig, CrewMember } from '../../data/types'
import type { ConflictMap } from '../../utils/crewConflicts'
import { fmtDate } from '../../utils'

interface CrewMatrixViewProps {
  plans: TechPlan[]
  events: Event[]
  crewFields: FieldConfig[]
  conflicts: ConflictMap
  onCrewEdit: (planId: number, fieldId: string, value: string) => void
}

interface EventColumn {
  event: Event
  plans: TechPlan[]
}

export function CrewMatrixView({ plans, events, crewFields, conflicts, onCrewEdit }: CrewMatrixViewProps) {
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [popover, setPopover] = useState<{ memberId: number; eventId: number; x: number; y: number } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    crewMembersApi.list({ active: true }).then(setCrewMembers).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopover(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const visibleFields = useMemo(
    () => crewFields.filter(f => f.visible && f.type !== 'checkbox').sort((a, b) => a.order - b.order),
    [crewFields]
  )

  // All unique roles from crew fields
  const allRoles = useMemo(() => visibleFields.map(f => f.id), [visibleFields])

  // Build event columns: events that have tech plans, sorted by date
  const eventColumns: EventColumn[] = useMemo(() => {
    const eventMap = new Map(events.map(e => [e.id, e]))
    const eventIds = [...new Set(plans.map(p => p.eventId))]
    return eventIds
      .map(id => {
        const event = eventMap.get(id)
        if (!event) return null
        return { event, plans: plans.filter(p => p.eventId === id) }
      })
      .filter(Boolean as unknown as (v: EventColumn | null) => v is EventColumn)
      .sort((a, b) => {
        const dateA = typeof a.event.startDateBE === 'string' ? a.event.startDateBE : ''
        const dateB = typeof b.event.startDateBE === 'string' ? b.event.startDateBE : ''
        return dateA.localeCompare(dateB)
      })
  }, [plans, events])

  // Build a lookup: who is assigned where
  // Key: "memberName_lower:eventId" -> { fieldId, planId }[]
  const assignmentMap = useMemo(() => {
    const map = new Map<string, { fieldId: string; planId: number; value: string }[]>()
    for (const plan of plans) {
      const crew = plan.crew as Record<string, unknown>
      if (!crew) continue
      for (const [fieldId, value] of Object.entries(crew)) {
        if (typeof value !== 'string' || !value.trim()) continue
        const key = `${value.trim().toLowerCase()}:${plan.eventId}`
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push({ fieldId, planId: plan.id, value: value.trim() })
      }
    }
    return map
  }, [plans])

  // Filter crew members
  const filteredMembers = useMemo(() => {
    let members = crewMembers
    if (search.trim()) {
      const q = search.toLowerCase()
      members = members.filter(m => m.name.toLowerCase().includes(q))
    }
    if (roleFilter) {
      // Only show members who have this role in any assignment
      members = members.filter(m => {
        const nameLower = m.name.toLowerCase()
        return [...assignmentMap.entries()].some(([key, assignments]) =>
          key.startsWith(nameLower + ':') && assignments.some(a => a.fieldId === roleFilter)
        )
      })
    }
    return members
  }, [crewMembers, search, roleFilter, assignmentMap])

  const getCellState = (member: CrewMember, eventCol: EventColumn): { assignments: { fieldId: string; planId: number }[]; hasConflict: boolean } => {
    const key = `${member.name.toLowerCase()}:${eventCol.event.id}`
    const assignments = assignmentMap.get(key) || []
    // Check if any assignment for this member+event has conflicts
    const hasConflict = assignments.some(a => {
      const conflictKey = `${a.planId}:${a.fieldId}`
      return conflicts.has(conflictKey) && conflicts.get(conflictKey)!.length > 0
    })
    return { assignments, hasConflict }
  }

  const handleCellClick = (memberId: number, eventId: number, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setPopover({ memberId, eventId, x: rect.left, y: rect.bottom + 4 })
  }

  const handleAssign = (member: CrewMember, eventCol: EventColumn, fieldId: string) => {
    // Assign to the first plan for this event
    const plan = eventCol.plans[0]
    if (!plan) return
    onCrewEdit(plan.id, fieldId, member.name)
    setPopover(null)
  }

  const handleUnassign = (planId: number, fieldId: string) => {
    onCrewEdit(planId, fieldId, '')
    setPopover(null)
  }

  if (crewMembers.length === 0) {
    return (
      <div className="card p-8 text-center text-text-3 text-sm">
        No crew members found. Extract from plans in <span className="font-medium text-text-2">Admin &gt; Crew Roster</span>.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search crew member..."
            className="inp w-full pl-9"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="inp text-sm"
        >
          <option value="">All roles</option>
          {allRoles.map(r => (
            <option key={r} value={r}>{visibleFields.find(f => f.id === r)?.label ?? r}</option>
          ))}
        </select>
        <span className="text-xs text-text-3">{filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Matrix */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="sticky left-0 z-10 bg-surface-2 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted min-w-[160px] border-r border-border">
                  Crew Member
                </th>
                {eventColumns.map(col => {
                  const dateStr = typeof col.event.startDateBE === 'string' ? col.event.startDateBE : ''
                  return (
                    <th key={col.event.id} className="px-3 py-3 text-center text-xs font-medium text-muted min-w-[120px]">
                      <div className="truncate max-w-[120px] font-bold">{col.event.participants}</div>
                      <div className="text-text-3 font-normal">{dateStr ? fmtDate(dateStr) : ''}</div>
                      <div className="text-text-3 font-normal">{col.event.startTimeBE}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredMembers.map(member => (
                <tr key={member.id} className="hover:bg-surface-2/50 transition">
                  <td className="sticky left-0 z-10 bg-surface border-r border-border px-4 py-2.5 font-medium whitespace-nowrap">
                    {member.name}
                    <div className="text-xs text-text-3">{(member.roles as string[]).slice(0, 3).join(', ')}</div>
                  </td>
                  {eventColumns.map(col => {
                    const { assignments, hasConflict } = getCellState(member, col)
                    const isEmpty = assignments.length === 0
                    const bgClass = isEmpty
                      ? 'bg-surface'
                      : hasConflict
                        ? 'bg-warning/10'
                        : 'bg-success/10'
                    const roles = assignments.map(a => {
                      const label = visibleFields.find(f => f.id === a.fieldId)?.label ?? a.fieldId
                      return label
                    })

                    return (
                      <td
                        key={col.event.id}
                        className={`px-2 py-2 text-center cursor-pointer transition hover:ring-1 hover:ring-primary/30 ${bgClass}`}
                        onClick={(e) => handleCellClick(member.id, col.event.id, e)}
                      >
                        {isEmpty ? (
                          <span className="text-text-3 text-xs">-</span>
                        ) : (
                          <div className="text-xs font-medium">
                            {roles.map((r, i) => (
                              <div key={i} className={hasConflict ? 'text-warning' : 'text-success'}>{r}</div>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assignment popover */}
      {popover && (() => {
        const member = crewMembers.find(m => m.id === popover.memberId)
        const eventCol = eventColumns.find(c => c.event.id === popover.eventId)
        if (!member || !eventCol) return null
        const { assignments } = getCellState(member, eventCol)
        return (
          <div
            ref={popoverRef}
            className="fixed z-50 rounded-lg border border-border bg-surface shadow-lg p-3 w-64"
            style={{ left: Math.min(popover.x, window.innerWidth - 280), top: Math.min(popover.y, window.innerHeight - 300) }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">{member.name}</span>
              <button onClick={() => setPopover(null)} className="text-text-3 hover:text-text"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-xs text-text-3 mb-3 truncate">{eventCol.event.participants}</div>

            {assignments.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-medium text-text-2 mb-1">Current roles:</div>
                {assignments.map((a, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <Badge variant="success">{visibleFields.find(f => f.id === a.fieldId)?.label ?? a.fieldId}</Badge>
                    <button onClick={() => handleUnassign(a.planId, a.fieldId)} className="text-xs text-danger hover:underline">Remove</button>
                  </div>
                ))}
              </div>
            )}

            <div className="text-xs font-medium text-text-2 mb-1">Assign to role:</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {visibleFields
                .filter(f => !assignments.some(a => a.fieldId === f.id))
                .map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleAssign(member, eventCol, f.id)}
                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-2 transition"
                  >
                    {f.label}
                  </button>
                ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
```

**Step 2: Add export to barrel**

In `src/components/sports/index.ts`, add:
```typescript
export { CrewMatrixView } from './CrewMatrixView'
```

**Step 3: Verify TypeScript compiles**

Run: `cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1 | head -30`
Expected: May have errors from SportsWorkspace (expected — Task 3 fixes this)

**Step 4: Commit**

```bash
git add src/components/sports/CrewMatrixView.tsx src/components/sports/index.ts
git commit -m "feat: add CrewMatrixView with person-by-event matrix, color-coded cells, assign popover"
```

---

### Task 3: Wire Enhanced Crew Tab into SportsWorkspace

**Files:**
- Modify: `src/pages/SportsWorkspace.tsx`

**Context:**
- Current crew tab section (lines 427-457) has a two-button sub-tab toggle (Assignments|Conflicts).
- Need to add a second toggle: Table|Matrix view (only visible when crewSubTab === 'assignments').
- Pass new props to CrewTab: `conflicts`, `onCrewEdit`, `onBatchApply`.
- Import and render `CrewMatrixView` when matrix view is selected.
- Add `onBatchApply` handler similar to existing `handleCrewBatchApply` but for multiple plan IDs.
- Import `CrewMatrixView` from sports barrel.

**Step 1: Update SportsWorkspace**

Add new state for view mode at the state declarations section:
```typescript
const [crewViewMode, setCrewViewMode] = useState<'table' | 'matrix'>('table')
```

Add the import:
```typescript
import { CrewMatrixView } from '../components/sports/CrewMatrixView'
```

Add batch apply handler (near `handleCrewBatchApply`):
```typescript
const handleBulkBatchApply = useCallback(async (planIds: number[], crewData: Record<string, unknown>) => {
  const updated = realtimePlans.map(p => {
    if (!planIds.includes(p.id)) return p
    return { ...p, crew: { ...p.crew as Record<string, unknown>, ...crewData } }
  })
  setRealtimePlans(updated)
  setTechPlans(updated)
  for (const planId of planIds) {
    const plan = updated.find(p => p.id === planId)
    if (plan) {
      try {
        await techPlansApi.update(planId, { crew: plan.crew, eventId: plan.eventId, planType: plan.planType, isLivestream: plan.isLivestream, customFields: plan.customFields })
      } catch { /* non-blocking */ }
    }
  }
  toast.success(`Template applied to ${planIds.length} plan${planIds.length !== 1 ? 's' : ''}`)
}, [realtimePlans, setTechPlans, toast])
```

Replace the crew tab section (the `{activeTab === 'crew' && ...}` block) with:
```tsx
{activeTab === 'crew' && (
  <div className="animate-fade-in space-y-4">
    <div className="flex items-center gap-4">
      {/* Assignments / Conflicts toggle */}
      <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
        <button
          onClick={() => setCrewSubTab('assignments')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
            crewSubTab === 'assignments' ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
          }`}
        >
          Assignments
        </button>
        <button
          onClick={() => setCrewSubTab('conflicts')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1.5 ${
            crewSubTab === 'conflicts' ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
          }`}
        >
          Conflicts
          {conflictGroups.length > 0 && (
            <span className="rounded-full bg-warning/20 text-warning px-1.5 py-0.5 text-xs font-bold">{conflictGroups.length}</span>
          )}
        </button>
      </div>

      {/* Table / Matrix toggle — only visible in assignments mode */}
      {crewSubTab === 'assignments' && (
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
          <button
            onClick={() => setCrewViewMode('table')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              crewViewMode === 'table' ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setCrewViewMode('matrix')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              crewViewMode === 'matrix' ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
            }`}
          >
            Matrix
          </button>
        </div>
      )}
    </div>

    {crewSubTab === 'assignments' ? (
      crewViewMode === 'table' ? (
        <CrewTab
          plans={realtimePlans}
          events={events}
          crewFields={crewFields}
          conflicts={crewConflicts}
          onCrewEdit={handleCrewEdit}
          onBatchApply={handleBulkBatchApply}
        />
      ) : (
        <CrewMatrixView
          plans={realtimePlans}
          events={events}
          crewFields={crewFields}
          conflicts={crewConflicts}
          onCrewEdit={handleCrewEdit}
        />
      )
    ) : (
      <ConflictDashboard groups={conflictGroups} />
    )}
  </div>
)}
```

**Step 2: Verify TypeScript compiles cleanly**

Run: `cd /mnt/c/Projects/Planza && npx tsc --noEmit`
Expected: Zero errors

**Step 3: Commit**

```bash
git add src/pages/SportsWorkspace.tsx
git commit -m "feat: wire enhanced crew tab with table/matrix toggle into SportsWorkspace"
```
