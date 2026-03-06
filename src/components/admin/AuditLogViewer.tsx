import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import { auditApi, type AuditEntry, type AuditFilters } from '../../services/audit'
import { Badge } from '../ui'

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<AuditFilters>({ limit: 50 })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const result = await auditApi.listAll(filters)
      setLogs(result.logs)
      setTotal(result.total)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchLogs() }, [filters])

  const updateFilter = (patch: Partial<AuditFilters>) => {
    setFilters(prev => ({ ...prev, ...patch, offset: 0 }))
  }

  const exportCsv = () => {
    const header = 'Timestamp,Action,Entity Type,Entity ID,User ID\n'
    const rows = logs.map(l =>
      `${l.createdAt},${l.action},${l.entityType},${l.entityId},${l.userId ?? ''}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-muted mb-1">Entity Type</label>
          <select
            className="inp text-sm px-2 py-1"
            value={filters.entityType ?? ''}
            onChange={e => updateFilter({ entityType: e.target.value || undefined })}
          >
            <option value="">All</option>
            <option value="event">Event</option>
            <option value="techPlan">Tech Plan</option>
            <option value="contract">Contract</option>
            <option value="encoder">Encoder</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Action</label>
          <input
            className="inp text-sm px-2 py-1 w-40"
            placeholder="e.g. event.create"
            value={filters.action ?? ''}
            onChange={e => updateFilter({ action: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">From</label>
          <input
            type="date"
            className="inp text-sm px-2 py-1"
            value={filters.from ?? ''}
            onChange={e => updateFilter({ from: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">To</label>
          <input
            type="date"
            className="inp text-sm px-2 py-1"
            value={filters.to ?? ''}
            onChange={e => updateFilter({ to: e.target.value || undefined })}
          />
        </div>
        <button onClick={exportCsv} className="btn btn-g btn-sm flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      <div className="text-xs text-muted">{total} entries{loading ? ' (loading...)' : ''}</div>

      {/* Log entries */}
      <div className="card divide-y divide-border/50 overflow-hidden">
        {logs.length === 0 && !loading && (
          <div className="px-4 py-8 text-sm text-muted text-center">No audit entries match your filters.</div>
        )}
        {logs.map(log => (
          <div
            key={log.id}
            className="px-4 py-3 hover:bg-surface-2 transition cursor-pointer"
            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="default">{log.entityType}</Badge>
                <span className="font-medium text-sm">{log.action}</span>
                <span className="text-xs text-text-3">#{log.entityId}</span>
              </div>
              <span className="text-xs text-text-3">
                {new Date(log.createdAt).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>
            {log.userId && <div className="text-xs text-muted mt-1">by {log.userId}</div>}
            {expandedId === log.id && (log.oldValue != null || log.newValue != null) && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {log.oldValue != null && (
                  <div>
                    <div className="text-xs font-bold text-muted mb-1">Before</div>
                    <pre className="text-xs bg-surface-2 rounded p-2 overflow-auto max-h-40">
                      {JSON.stringify(log.oldValue, null, 2)}
                    </pre>
                  </div>
                )}
                {log.newValue != null && (
                  <div>
                    <div className="text-xs font-bold text-muted mb-1">After</div>
                    <pre className="text-xs bg-surface-2 rounded p-2 overflow-auto max-h-40">
                      {JSON.stringify(log.newValue, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > (filters.limit ?? 50) && (
        <div className="flex gap-2 justify-center">
          <button
            className="btn btn-g btn-sm"
            disabled={(filters.offset ?? 0) === 0}
            onClick={() => setFilters(prev => ({ ...prev, offset: Math.max(0, (prev.offset ?? 0) - (prev.limit ?? 50)) }))}
          >
            Previous
          </button>
          <span className="text-xs text-muted self-center">
            {(filters.offset ?? 0) + 1}–{Math.min((filters.offset ?? 0) + (filters.limit ?? 50), total)} of {total}
          </span>
          <button
            className="btn btn-g btn-sm"
            disabled={(filters.offset ?? 0) + (filters.limit ?? 50) >= total}
            onClick={() => setFilters(prev => ({ ...prev, offset: (prev.offset ?? 0) + (prev.limit ?? 50) }))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
