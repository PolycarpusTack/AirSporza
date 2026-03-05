import { useState, useEffect } from 'react'
import { Badge } from '../ui'
import { resourcesApi, RESOURCE_TYPE_LABELS } from '../../services/resources'
import type { Resource, ResourceAssignment } from '../../services/resources'

interface ResourcesTabProps {
  resources: Resource[]
}

export function ResourcesTab({ resources }: ResourcesTabProps) {
  const [assignments, setAssignments] = useState<Record<number, ResourceAssignment[]>>({})

  useEffect(() => {
    if (resources.length === 0) return
    let cancelled = false
    Promise.all(resources.map(r => resourcesApi.getAssignments(r.id).then(a => ({ id: r.id, a }))))
      .then(results => {
        if (cancelled) return
        const next: Record<number, ResourceAssignment[]> = {}
        for (const { id, a } of results) next[id] = a
        setAssignments(next)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [resources])

  if (resources.length === 0) {
    return <div className="card p-8 text-center text-text-3 text-sm">No resources configured yet</div>
  }

  return (
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
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {resources.map(r => {
            const ra = assignments[r.id]
            return (
              <tr key={r.id} className="hover:bg-surface-2 transition align-top">
                <td className="px-4 py-3 font-semibold">{r.name}</td>
                <td className="px-4 py-3 text-text-2 text-xs font-mono uppercase">{RESOURCE_TYPE_LABELS[r.type] ?? r.type}</td>
                <td className="px-4 py-3 text-text-2">{r.capacity}</td>
                <td className="px-4 py-3">
                  {r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="none">Inactive</Badge>}
                </td>
                <td className="px-4 py-3">
                  {ra === undefined ? (
                    <span className="text-text-3 text-xs">Loading…</span>
                  ) : ra.length === 0 ? (
                    <span className="text-text-3 text-xs">No assignments</span>
                  ) : (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-text-2">{ra.length} assignment{ra.length !== 1 ? 's' : ''}</span>
                      <ul className="space-y-0.5">
                        {ra.map(a => (
                          <li key={a.id} className="text-xs text-text-2 flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                            <span className="font-mono text-text-3 mr-1">{a.techPlan?.planType ?? `Plan #${a.techPlanId}`}</span>
                            {a.techPlan?.event
                              ? <span className="truncate max-w-[160px]">{a.techPlan.event.participants}</span>
                              : <span className="text-text-3">Event #{a.techPlan?.eventId}</span>
                            }
                            {a.quantity > 1 && <span className="ml-1 text-text-3">(×{a.quantity})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-text-3 text-xs">{r.notes ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
