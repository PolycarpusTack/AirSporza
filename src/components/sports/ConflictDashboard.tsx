import { AlertTriangle, CheckCircle } from 'lucide-react'
import { Badge } from '../ui'

interface ConflictEvent {
  id: number
  name: string
  role: string
  time: string
}

export interface PersonConflictGroup {
  personName: string
  conflicts: {
    eventA: ConflictEvent
    eventB: ConflictEvent
    severity: 'full' | 'partial'
  }[]
}

interface ConflictDashboardProps {
  groups: PersonConflictGroup[]
  sportFilter?: string
  dateFilter?: string
}

export function ConflictDashboard({ groups }: ConflictDashboardProps) {
  if (groups.length === 0) {
    return (
      <div className="card p-10 text-center">
        <CheckCircle className="w-10 h-10 text-success mx-auto mb-3" />
        <div className="font-medium text-lg mb-1">No Conflicts Found</div>
        <div className="text-sm text-text-3">All crew assignments are clear of time overlaps.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-text-2">
        <AlertTriangle className="w-4 h-4 text-warning" />
        <span>{groups.length} crew member{groups.length !== 1 ? 's' : ''} with conflicts ({groups.reduce((s, g) => s + g.conflicts.length, 0)} total)</span>
      </div>

      {groups.map(group => (
        <div key={group.personName} className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="font-bold">{group.personName}</span>
            </div>
            <Badge variant="warning">{group.conflicts.length} conflict{group.conflicts.length !== 1 ? 's' : ''}</Badge>
          </div>
          <div className="divide-y divide-border/60">
            {group.conflicts.map((c, i) => (
              <div key={i} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.eventA.name}</div>
                  <div className="text-xs text-text-3">
                    as <span className="font-mono text-text-2">{c.eventA.role}</span> at {c.eventA.time}
                  </div>
                </div>
                <div className="flex items-center gap-1 px-2">
                  <Badge variant={c.severity === 'full' ? 'danger' : 'warning'}>
                    {c.severity === 'full' ? 'Full overlap' : 'Partial overlap'}
                  </Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.eventB.name}</div>
                  <div className="text-xs text-text-3">
                    as <span className="font-mono text-text-2">{c.eventB.role}</span> at {c.eventB.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
