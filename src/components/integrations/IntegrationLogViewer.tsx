import { useState, useEffect, useCallback } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from 'lucide-react'
import { Modal, Badge, Btn } from '../ui'
import { integrationsApi } from '../../services/integrations'
import type { Integration, IntegrationLog } from '../../services/integrations'

interface IntegrationLogViewerProps {
  integration: Integration
  onClose: () => void
}

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning'> = {
  success: 'success',
  failed:  'danger',
  partial: 'warning',
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'INBOUND') return <ArrowDownToLine className="w-3 h-3" />
  if (direction === 'OUTBOUND') return <ArrowUpFromLine className="w-3 h-3" />
  return <RefreshCw className="w-3 h-3" />
}

export function IntegrationLogViewer({ integration, onClose }: IntegrationLogViewerProps) {
  const [logs, setLogs] = useState<IntegrationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const PAGE_SIZE = 20

  const fetchLogs = useCallback(async (cursor?: string) => {
    const isInitial = !cursor
    if (isInitial) setLoading(true)
    else setLoadingMore(true)

    try {
      const data = await integrationsApi.listLogs(integration.id, {
        limit: PAGE_SIZE,
        cursor,
      })
      if (isInitial) {
        setLogs(data)
      } else {
        setLogs(prev => [...prev, ...data])
      }
      setHasMore(data.length === PAGE_SIZE)
    } catch {
      // silently handle — logs are non-critical
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [integration.id])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleLoadMore = () => {
    if (logs.length === 0) return
    const lastLog = logs[logs.length - 1]
    fetchLogs(lastLog.id)
  }

  return (
    <Modal
      title={`Logs - ${integration.name}`}
      onClose={onClose}
      width="max-w-4xl"
    >
      <div className="max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-muted text-sm">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted">
            <p className="font-semibold text-foreground">No activity recorded yet.</p>
            <p className="mt-1 text-sm">Logs will appear here after the integration runs.</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 sticky top-0">
                  <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Timestamp</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Direction</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-muted uppercase">Records</th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-muted uppercase">Duration</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-surface-2/50">
                    <td className="px-4 py-2.5 text-text-2 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="default">
                        <DirectionIcon direction={log.direction} />
                        {log.direction}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={STATUS_VARIANT[log.status] ?? 'default'}>
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {log.recordCount}
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-3 tabular-nums whitespace-nowrap">
                      {log.durationMs != null ? `${log.durationMs}ms` : '--'}
                    </td>
                    <td className="px-4 py-2.5 text-danger text-xs max-w-[240px] truncate" title={log.errorMessage ?? undefined}>
                      {log.errorMessage ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {hasMore && (
              <div className="flex justify-center py-4 border-t border-border">
                <Btn variant="ghost" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading...' : 'Load More'}
                </Btn>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-end border-t border-border px-6 py-3">
        <Btn variant="secondary" size="sm" onClick={onClose}>
          Close
        </Btn>
      </div>
    </Modal>
  )
}
