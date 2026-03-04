import { useEffect, useState } from 'react'
import { auditApi, type AuditEntry } from '../../services/audit'
import { useAuth } from '../../hooks'

interface HistoryPanelProps {
  entityType: string
  entityId: number
  onRestored?: () => void
}

export function HistoryPanel({ entityType, entityId, onRestored }: HistoryPanelProps) {
  const { user } = useAuth()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    auditApi.list(entityType, entityId)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [entityType, entityId])

  const handleRestore = async (entry: AuditEntry) => {
    await auditApi.restore(entry.id)
    onRestored?.()
  }

  if (loading) return <div className="text-xs text-muted animate-pulse">Loading history…</div>
  if (!entries.length) return <div className="text-xs text-muted">No history yet.</div>

  return (
    <div className="space-y-2">
      {entries.map(e => (
        <div key={e.id} className="text-xs border border-surface-2 rounded p-2">
          <div className="flex justify-between items-center">
            <span className="font-medium text-text-2">{e.action}</span>
            <span className="text-muted">{new Date(e.createdAt).toLocaleString()}</span>
          </div>
          <button
            className="text-muted underline mt-1"
            onClick={() => setExpanded(expanded === e.id ? null : e.id)}
          >
            {expanded === e.id ? 'Hide diff' : 'Show diff'}
          </button>
          {expanded === e.id && (
            <pre className="mt-1 bg-surface rounded p-1 overflow-x-auto text-[10px]">
              {JSON.stringify({ before: e.oldValue ?? null, after: e.newValue ?? null }, null, 2)}
            </pre>
          )}
          {user?.role === 'admin' && e.oldValue != null && (
            <button
              className="btn btn-sm btn-g mt-1"
              onClick={() => handleRestore(e)}
            >
              Restore to this
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
