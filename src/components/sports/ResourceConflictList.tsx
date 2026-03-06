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
