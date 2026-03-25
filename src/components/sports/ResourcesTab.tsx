import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, Plus } from 'lucide-react'
import { Badge, Btn } from '../ui'
import { useConfirmDialog } from '../ui/ConfirmDialog'
import { resourcesApi, RESOURCE_TYPE_LABELS } from '../../services/resources'
import type { Resource, ResourceAssignment } from '../../services/resources'
import type { Event, TechPlan, Sport } from '../../data/types'
import { ResourceTimeline } from './ResourceTimeline'
import { useToast } from '../Toast'
import { handleApiError } from '../../utils/apiError'
import { fmtDate } from '../../utils'

interface ResourcesTabProps {
  resources: Resource[]
  techPlans: TechPlan[]
  events: Event[]
  sports: Sport[]
}

export function ResourcesTab({ resources, techPlans, events, sports }: ResourcesTabProps) {
  const [assignments, setAssignments] = useState<Record<number, ResourceAssignment[]>>({})
  const [assignModalResource, setAssignModalResource] = useState<Resource | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table')
  const toast = useToast()
  const { confirm, dialog: confirmDialog } = useConfirmDialog()

  const fetchAssignments = useCallback(() => {
    if (resources.length === 0) return
    let cancelled = false
    Promise.all(resources.map(r => resourcesApi.getAssignments(r.id).then(a => ({ id: r.id, a }))))
      .then(results => {
        if (cancelled) return
        const next: Record<number, ResourceAssignment[]> = {}
        for (const { id, a } of results) next[id] = a
        setAssignments(next)
      })
      .catch(err => handleApiError(err, 'Failed to load resource assignments', toast))
    return () => { cancelled = true }
  }, [resources, toast])

  useEffect(() => {
    const cleanup = fetchAssignments()
    return cleanup
  }, [fetchAssignments])

  const usedCount = useCallback((resourceId: number): number => {
    const ra = assignments[resourceId]
    if (!ra) return 0
    return ra.reduce((sum, a) => sum + a.quantity, 0)
  }, [assignments])

  const handleUnassign = useCallback(async (resourceId: number, techPlanId: number) => {
    const key = `${resourceId}-${techPlanId}`
    if (busyIds.has(key)) return
    const ok = await confirm({
      title: 'Unassign resource',
      message: 'Remove this resource assignment?',
      variant: 'warning',
      confirmLabel: 'Unassign',
    })
    if (!ok) return
    setBusyIds(prev => new Set(prev).add(key))
    try {
      await resourcesApi.unassign(resourceId, techPlanId)
      toast.success('Assignment removed')
      fetchAssignments()
    } catch {
      toast.error('Failed to remove assignment')
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [busyIds, fetchAssignments, toast, confirm])

  if (resources.length === 0) {
    return <div className="card p-8 text-center text-text-3 text-sm">No resources configured yet</div>
  }

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

      {viewMode === 'timeline' ? (
        <ResourceTimeline
          resources={resources}
          assignments={assignments}
          events={events}
          sports={sports}
        />
      ) : (
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
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Notes</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted w-20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {resources.map(r => {
              const ra = assignments[r.id]
              const used = usedCount(r.id)
              const isOver = used >= r.capacity && r.capacity > 0

              return (
                <tr key={r.id} className="hover:bg-surface-2 transition align-top">
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-text-2 text-xs font-mono uppercase">{RESOURCE_TYPE_LABELS[r.type] ?? r.type}</td>
                  <td className="px-4 py-3">
                    <span className={isOver ? 'text-danger font-semibold' : 'text-text-2'}>
                      {used}/{r.capacity}
                    </span>
                    {isOver && <Badge variant="danger" className="ml-2">Over</Badge>}
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
                        <span className="text-xs font-medium text-text-2">{ra.length} assignment{ra.length !== 1 ? 's' : ''}</span>
                        <ul className="space-y-0.5">
                          {ra.map(a => {
                            const busy = busyIds.has(`${r.id}-${a.techPlanId}`)
                            return (
                              <li key={a.id} className="text-xs text-text-2 flex items-center gap-1 group">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                                <span className="font-mono text-text-3 mr-1">{a.techPlan?.planType ?? `Plan #${a.techPlanId}`}</span>
                                {a.techPlan?.event
                                  ? <span className="truncate max-w-[160px]">{a.techPlan.event.participants}</span>
                                  : <span className="text-text-3">Event #{a.techPlan?.eventId}</span>
                                }
                                {a.quantity > 1 && <span className="ml-1 text-text-3">({'\u00d7'}{a.quantity})</span>}
                                <button
                                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-danger hover:text-danger/80 p-0.5 rounded"
                                  title="Remove assignment"
                                  disabled={busy}
                                  onClick={() => handleUnassign(r.id, a.techPlanId)}
                                >
                                  <X size={12} />
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-3 text-xs">{r.notes ?? '\u2014'}</td>
                  <td className="px-4 py-3">
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => setAssignModalResource(r)}
                      title="Assign tech plans"
                    >
                      <Plus size={14} />
                      Assign
                    </Btn>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </>
      )}

      {assignModalResource && (
        <AssignModal
          resource={assignModalResource}
          assignments={assignments[assignModalResource.id] ?? []}
          techPlans={techPlans}
          events={events}
          onClose={() => setAssignModalResource(null)}
          onAssigned={() => {
            fetchAssignments()
            setAssignModalResource(null)
          }}
        />
      )}

      {confirmDialog}
    </>
  )
}

/* ---------- Assign Modal ---------- */

interface AssignModalProps {
  resource: Resource
  assignments: ResourceAssignment[]
  techPlans: TechPlan[]
  events: Event[]
  onClose: () => void
  onAssigned: () => void
}

function AssignModal({ resource, assignments, techPlans, events, onClose, onAssigned }: AssignModalProps) {
  const toast = useToast()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  const assignedPlanIds = useMemo(() => new Set(assignments.map(a => a.techPlanId)), [assignments])

  const eventsById = useMemo(() => {
    const map = new Map<number, Event>()
    for (const ev of events) map.set(ev.id, ev)
    return map
  }, [events])

  // Group unassigned plans by event
  const groupedPlans = useMemo(() => {
    const unassigned = techPlans.filter(tp => !assignedPlanIds.has(tp.id))
    const groups = new Map<number, { event: Event | undefined; plans: TechPlan[] }>()

    for (const tp of unassigned) {
      if (!groups.has(tp.eventId)) {
        groups.set(tp.eventId, { event: eventsById.get(tp.eventId), plans: [] })
      }
      groups.get(tp.eventId)!.plans.push(tp)
    }

    // Filter by search
    const lc = search.toLowerCase().trim()
    if (lc) {
      for (const [eid, group] of groups) {
        const eventMatch = group.event?.participants?.toLowerCase().includes(lc)
        const planMatch = group.plans.some(p => p.planType.toLowerCase().includes(lc))
        if (!eventMatch && !planMatch) groups.delete(eid)
      }
    }

    // Sort by event date descending
    return [...groups.entries()].sort((a, b) => {
      const rawA = a[1].event?.startDateBE
      const rawB = b[1].event?.startDateBE
      const da = rawA instanceof Date ? rawA.toISOString().split('T')[0] : typeof rawA === 'string' ? rawA.split('T')[0] : ''
      const db = rawB instanceof Date ? rawB.toISOString().split('T')[0] : typeof rawB === 'string' ? rawB.split('T')[0] : ''
      return db.localeCompare(da)
    })
  }, [techPlans, assignedPlanIds, eventsById, search])

  const togglePlan = (planId: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(planId)) next.delete(planId)
      else next.add(planId)
      return next
    })
  }

  const handleAssign = async () => {
    if (selected.size === 0) return
    setBusy(true)
    let ok = 0
    let fail = 0
    for (const techPlanId of selected) {
      try {
        await resourcesApi.assign(resource.id, { techPlanId })
        ok++
      } catch {
        fail++
      }
    }
    setBusy(false)
    if (ok > 0) toast.success(`Assigned ${ok} plan${ok !== 1 ? 's' : ''} to ${resource.name}`)
    if (fail > 0) toast.error(`Failed to assign ${fail} plan${fail !== 1 ? 's' : ''}`)
    onAssigned()
  }

  const totalUnassigned = groupedPlans.reduce((sum, [, g]) => sum + g.plans.length, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg rounded-lg p-5 shadow-md animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-base">Assign to {resource.name}</h3>
            <p className="text-xs text-text-3 mt-0.5">
              {RESOURCE_TYPE_LABELS[resource.type]} &middot; Capacity: {resource.capacity}
            </p>
          </div>
          <button onClick={onClose} className="text-text-3 hover:text-text-2 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <input
          className="inp w-full mb-3"
          placeholder="Search events or plan types..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Plan list */}
        <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
          {groupedPlans.length === 0 ? (
            <p className="text-center text-text-3 text-sm py-6">
              {totalUnassigned === 0 && !search ? 'All tech plans are already assigned to this resource' : 'No matching plans found'}
            </p>
          ) : (
            groupedPlans.map(([eventId, group]) => (
              <div key={eventId} className="border border-border/60 rounded-md p-2">
                <p className="text-xs font-semibold text-text-2 mb-1">
                  {group.event?.participants ?? `Event #${eventId}`}
                  <span className="text-text-3 font-normal ml-2">{fmtDate(group.event?.startDateBE)}</span>
                </p>
                <div className="space-y-1">
                  {group.plans.map(tp => (
                    <label
                      key={tp.id}
                      className="flex items-center gap-2 text-xs cursor-pointer hover:bg-surface-2 rounded px-1 py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(tp.id)}
                        onChange={() => togglePlan(tp.id)}
                        className="rounded"
                      />
                      <span className="font-mono text-text-3">{tp.planType}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <span className="text-xs text-text-3">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
            <Btn
              size="sm"
              disabled={selected.size === 0 || busy}
              onClick={handleAssign}
            >
              {busy ? 'Assigning...' : `Assign (${selected.size})`}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
