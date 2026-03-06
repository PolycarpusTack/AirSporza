import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import type { Event, TechPlan, FieldConfig, CrewMember } from '../../data/types'
import type { ConflictMap } from '../../utils/crewConflicts'
import { crewMembersApi } from '../../services/crewMembers'
import { fmtDate } from '../../utils'
import { Badge } from '../ui'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CrewMatrixViewProps {
  plans: TechPlan[]
  events: Event[]
  crewFields: FieldConfig[]
  conflicts: ConflictMap
  onCrewEdit: (planId: number, fieldId: string, value: string) => void
}

interface AssignmentEntry {
  fieldId: string
  planId: number
  fieldLabel: string
}

interface PopoverState {
  memberId: number
  memberName: string
  eventId: number
  eventName: string
  assignments: AssignmentEntry[]
  x: number
  y: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Columns = events with tech plans, sorted chronologically, grouped by date */
interface EventColumn {
  event: Event
  plans: TechPlan[]
  dateStr: string
  sortKey: number
}

function buildColumns(events: Event[], plans: TechPlan[]): EventColumn[] {
  const plansByEvent = new Map<number, TechPlan[]>()
  for (const p of plans) {
    if (!plansByEvent.has(p.eventId)) plansByEvent.set(p.eventId, [])
    plansByEvent.get(p.eventId)!.push(p)
  }

  const cols: EventColumn[] = []
  for (const ev of events) {
    const evPlans = plansByEvent.get(ev.id)
    if (!evPlans || evPlans.length === 0) continue
    const dateRaw = typeof ev.startDateBE === 'string' ? ev.startDateBE : ev.startDateBE?.toISOString?.().split('T')[0] || ''
    const time = ev.startTimeBE || '00:00'
    const sortKey = new Date(`${dateRaw}T${time}:00`).getTime() || 0
    cols.push({ event: ev, plans: evPlans, dateStr: dateRaw, sortKey })
  }

  return cols.sort((a, b) => a.sortKey - b.sortKey)
}

/** Key: "name_lower:eventId" -> assignments */
type AssignmentMap = Map<string, AssignmentEntry[]>

function buildAssignmentMap(plans: TechPlan[], crewFields: FieldConfig[]): AssignmentMap {
  const fieldLabels = new Map(crewFields.map(f => [f.id, f.label]))
  const map: AssignmentMap = new Map()

  for (const plan of plans) {
    const crew = plan.crew as Record<string, unknown>
    if (!crew || typeof crew !== 'object') continue

    for (const [fieldId, value] of Object.entries(crew)) {
      if (typeof value !== 'string' || !value.trim()) continue
      const name = value.trim().toLowerCase()
      const key = `${name}:${plan.eventId}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({
        fieldId,
        planId: plan.id,
        fieldLabel: fieldLabels.get(fieldId) || fieldId,
      })
    }
  }

  return map
}

function hasConflict(conflicts: ConflictMap, assignments: AssignmentEntry[]): boolean {
  return assignments.some(a => conflicts.has(`${a.planId}:${a.fieldId}`))
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CrewMatrixView({ plans, events, crewFields, conflicts, onCrewEdit }: CrewMatrixViewProps) {
  const [members, setMembers] = useState<CrewMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [popover, setPopover] = useState<PopoverState | null>(null)

  const popoverRef = useRef<HTMLDivElement>(null)

  // Fetch active crew members on mount
  useEffect(() => {
    let cancelled = false
    crewMembersApi.list({ active: true }).then(data => {
      if (!cancelled) {
        setMembers(data)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  // Close popover on outside click
  useEffect(() => {
    if (!popover) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [popover])

  const columns = useMemo(() => buildColumns(events, plans), [events, plans])
  const assignmentMap = useMemo(() => buildAssignmentMap(plans, crewFields), [plans, crewFields])

  // All unique roles from crew fields and members
  const allRoles = useMemo(() => {
    const roles = new Set<string>()
    for (const f of crewFields) roles.add(f.label)
    for (const m of members) {
      for (const r of m.roles) roles.add(r)
    }
    return Array.from(roles).sort()
  }, [crewFields, members])

  // Filter members
  const filteredMembers = useMemo(() => {
    let filtered = members

    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(m => m.name.toLowerCase().includes(q))
    }

    if (roleFilter) {
      // Show members assigned to that role in any event OR who have that role in their profile
      const roleFieldIds = crewFields.filter(f => f.label === roleFilter).map(f => f.id)
      filtered = filtered.filter(m => {
        // Check profile roles
        if (m.roles.includes(roleFilter)) return true
        // Check if assigned to that role in any plan
        for (const col of columns) {
          const key = `${m.name.toLowerCase()}:${col.event.id}`
          const assignments = assignmentMap.get(key)
          if (assignments?.some(a => roleFieldIds.includes(a.fieldId))) return true
        }
        return false
      })
    }

    return filtered
  }, [members, search, roleFilter, crewFields, columns, assignmentMap])

  const handleCellClick = useCallback((e: React.MouseEvent, member: CrewMember, col: EventColumn) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const key = `${member.name.toLowerCase()}:${col.event.id}`
    const assignments = assignmentMap.get(key) || []

    setPopover({
      memberId: member.id,
      memberName: member.name,
      eventId: col.event.id,
      eventName: col.event.participants,
      assignments,
      x: Math.min(rect.left, window.innerWidth - 280),
      y: Math.min(rect.bottom + 4, window.innerHeight - 300),
    })
  }, [assignmentMap])

  const handleRemove = useCallback((planId: number, fieldId: string) => {
    onCrewEdit(planId, fieldId, '')
    setPopover(null)
  }, [onCrewEdit])

  const handleAssign = useCallback((col: EventColumn, fieldId: string, memberName: string) => {
    const firstPlan = col.plans[0]
    if (firstPlan) {
      onCrewEdit(firstPlan.id, fieldId, memberName)
    }
    setPopover(null)
  }, [onCrewEdit])

  // Get columns for the popover event
  const popoverCol = popover ? columns.find(c => c.event.id === popover.eventId) : null

  // Get unassigned fields for the popover
  const unassignedFields = useMemo(() => {
    if (!popover || !popoverCol) return []
    const assignedFieldIds = new Set(popover.assignments.map(a => a.fieldId))
    return crewFields.filter(f => !assignedFieldIds.has(f.id))
  }, [popover, popoverCol, crewFields])

  /* ---- Empty state ---- */
  if (!loading && members.length === 0) {
    return (
      <div className="card p-8 text-center text-muted">
        <p>No crew members found.</p>
        <p className="text-sm mt-1">Extract from plans in Admin &gt; Crew Roster.</p>
      </div>
    )
  }

  /* ---- Date grouping for column headers ---- */
  const dateGroups: { date: string; formatted: string; count: number }[] = []
  let currentDate = ''
  for (const col of columns) {
    if (col.dateStr !== currentDate) {
      dateGroups.push({ date: col.dateStr, formatted: fmtDate(col.dateStr), count: 1 })
      currentDate = col.dateStr
    } else {
      dateGroups[dateGroups.length - 1].count++
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="inp pl-8 w-full text-sm"
            placeholder="Search crew..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="inp text-sm"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          {allRoles.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <span className="text-xs text-muted ml-auto">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Matrix table */}
      <div className="card overflow-auto max-h-[calc(100vh-280px)]">
        {loading ? (
          <div className="p-8 text-center text-muted text-sm">Loading crew members...</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            {/* Date grouping header */}
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-surface border-b border-border px-3 py-1.5" />
                {dateGroups.map(dg => (
                  <th
                    key={dg.date}
                    colSpan={dg.count}
                    className="bg-surface border-b border-l border-border px-2 py-1 text-muted font-medium text-center"
                  >
                    {dg.formatted}
                  </th>
                ))}
              </tr>
              {/* Event header */}
              <tr>
                <th className="sticky left-0 z-20 bg-surface border-b border-border px-3 py-2 text-left font-semibold whitespace-nowrap min-w-[140px]">
                  Crew Member
                </th>
                {columns.map(col => (
                  <th
                    key={col.event.id}
                    className="bg-surface border-b border-l border-border px-2 py-1.5 text-center font-normal whitespace-nowrap min-w-[90px]"
                  >
                    <div className="font-medium truncate max-w-[120px]" title={col.event.participants}>
                      {col.event.participants}
                    </div>
                    <div className="text-muted">{col.event.startTimeBE || '--:--'}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredMembers.map(member => {
                const nameLower = member.name.toLowerCase()
                return (
                  <tr key={member.id} className="hover:bg-surface-2/50">
                    <td className="sticky left-0 z-10 bg-surface border-b border-border px-3 py-1.5 font-medium whitespace-nowrap">
                      {member.name}
                    </td>
                    {columns.map(col => {
                      const key = `${nameLower}:${col.event.id}`
                      const assignments = assignmentMap.get(key)
                      const isAssigned = !!assignments && assignments.length > 0
                      const conflicted = isAssigned && hasConflict(conflicts, assignments!)

                      let cellClass = 'border-b border-l border-border px-2 py-1.5 text-center cursor-pointer transition-colors'
                      if (isAssigned && conflicted) {
                        cellClass += ' bg-warning/10 text-warning'
                      } else if (isAssigned) {
                        cellClass += ' bg-success/10 text-success'
                      } else {
                        cellClass += ' text-text-3'
                      }

                      return (
                        <td
                          key={col.event.id}
                          className={cellClass}
                          onClick={e => handleCellClick(e, member, col)}
                          title={
                            isAssigned
                              ? assignments!.map(a => a.fieldLabel).join(', ') + (conflicted ? ' (conflict!)' : '')
                              : 'Click to assign'
                          }
                        >
                          {isAssigned ? (
                            <div className="flex flex-wrap gap-0.5 justify-center">
                              {assignments!.map(a => (
                                <Badge key={a.fieldId} variant={conflicted ? 'warning' : 'success'} className="text-[10px] px-1">
                                  {a.fieldLabel}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-text-3">-</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Popover */}
      {popover && popoverCol && (
        <div
          ref={popoverRef}
          className="fixed z-50 bg-surface border border-border rounded-lg shadow-lg p-3 w-[260px]"
          style={{ left: popover.x, top: popover.y }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium text-sm truncate pr-2">
              {popover.memberName}
            </div>
            <button
              className="p-0.5 rounded hover:bg-surface-2 text-muted"
              onClick={() => setPopover(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="text-xs text-muted mb-3 truncate" title={popover.eventName}>
            {popover.eventName}
          </div>

          {/* Current roles */}
          {popover.assignments.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase text-muted font-medium mb-1">Current Roles</div>
              <div className="flex flex-col gap-1">
                {popover.assignments.map(a => (
                  <div key={a.fieldId} className="flex items-center justify-between bg-surface-2 rounded px-2 py-1 text-xs">
                    <span>{a.fieldLabel}</span>
                    <button
                      className="text-muted hover:text-warning text-[10px] ml-2"
                      onClick={() => handleRemove(a.planId, a.fieldId)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available roles */}
          {unassignedFields.length > 0 && (
            <div>
              <div className="text-[10px] uppercase text-muted font-medium mb-1">Assign To</div>
              <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto">
                {unassignedFields.map(f => (
                  <button
                    key={f.id}
                    className="text-left text-xs px-2 py-1 rounded hover:bg-surface-2 transition-colors"
                    onClick={() => handleAssign(popoverCol, f.id, popover.memberName)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {popover.assignments.length === 0 && unassignedFields.length === 0 && (
            <div className="text-xs text-muted text-center py-2">No crew fields configured</div>
          )}
        </div>
      )}
    </div>
  )
}
