import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Btn } from '../components/ui'
import { useToast } from '../components/Toast'
import { integrationsApi } from '../services/integrations'
import type { Integration, IntegrationDirection } from '../services/integrations'
import { IntegrationCard } from '../components/integrations/IntegrationCard'
import { AddEditIntegrationModal } from '../components/integrations/AddEditIntegrationModal'
import { IntegrationLogViewer } from '../components/integrations/IntegrationLogViewer'
import { TestConnectionPanel } from '../components/integrations/TestConnectionPanel'

type DirectionFilter = 'ALL' | IntegrationDirection

const TABS: Array<{ key: DirectionFilter; label: string }> = [
  { key: 'ALL',           label: 'All' },
  { key: 'INBOUND',       label: 'Inbound' },
  { key: 'OUTBOUND',      label: 'Outbound' },
  { key: 'BIDIRECTIONAL', label: 'Bidirectional' },
]

export function IntegrationHub() {
  const toast = useToast()

  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<DirectionFilter>('ALL')

  // Modal state
  const [editTarget, setEditTarget] = useState<Integration | null | undefined>(undefined) // undefined = closed, null = create
  const [logsTarget, setLogsTarget] = useState<Integration | null>(null)
  const [testTarget, setTestTarget] = useState<Integration | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Integration | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchIntegrations = useCallback(async () => {
    setLoading(true)
    try {
      const data = await integrationsApi.list()
      setIntegrations(data)
    } catch {
      toast.error('Failed to load integrations.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  const filtered = filter === 'ALL'
    ? integrations
    : integrations.filter(i => i.direction === filter)

  const handleToggleActive = async (integration: Integration, active: boolean) => {
    try {
      const updated = await integrationsApi.update(integration.id, { isActive: active })
      setIntegrations(prev => prev.map(i => i.id === updated.id ? updated : i))
      toast.success(`${integration.name} ${active ? 'activated' : 'deactivated'}.`)
    } catch {
      toast.error('Failed to update integration.')
    }
  }

  const handleSaved = (saved: Integration) => {
    setIntegrations(prev => {
      const exists = prev.find(i => i.id === saved.id)
      if (exists) return prev.map(i => i.id === saved.id ? saved : i)
      return [saved, ...prev]
    })
    setEditTarget(undefined)
    toast.success(editTarget === null ? 'Integration created.' : 'Integration updated.')
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await integrationsApi.delete(deleteConfirm.id)
      setIntegrations(prev => prev.filter(i => i.id !== deleteConfirm.id))
      toast.success(`${deleteConfirm.name} deleted.`)
      setDeleteConfirm(null)
    } catch {
      toast.error('Failed to delete integration.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text">Integration Hub</h2>
          <p className="text-xs text-text-3 mt-0.5">
            Manage inbound and outbound integrations with external systems.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="secondary" size="sm" onClick={fetchIntegrations} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Btn>
          <Btn variant="primary" size="sm" onClick={() => setEditTarget(null)}>
            <Plus className="w-3.5 h-3.5" />
            Add Integration
          </Btn>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              filter === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-2 hover:text-text'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-text-3">
              {tab.key === 'ALL'
                ? integrations.length
                : integrations.filter(i => i.direction === tab.key).length
              }
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center text-muted text-sm">Loading integrations...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted">
          <p className="font-semibold text-foreground">
            {filter === 'ALL'
              ? 'No integrations configured.'
              : `No ${filter.toLowerCase()} integrations.`
            }
          </p>
          <p className="mt-1 text-sm">Add your first integration to get started.</p>
          <Btn variant="primary" size="sm" className="mt-4" onClick={() => setEditTarget(null)}>
            <Plus className="w-3.5 h-3.5" />
            Add Integration
          </Btn>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(integration => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onEdit={(i) => setEditTarget(i)}
              onTest={(i) => setTestTarget(i)}
              onLogs={(i) => setLogsTarget(i)}
              onDelete={(i) => setDeleteConfirm(i)}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => !deleting && setDeleteConfirm(null)}
        >
          <div
            className="card w-full max-w-sm p-6 animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-text mb-2">Delete Integration</h3>
            <p className="text-sm text-text-2 mb-4">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Btn variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
                Cancel
              </Btn>
              <Btn variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {editTarget !== undefined && (
        <AddEditIntegrationModal
          integration={editTarget}
          onClose={() => setEditTarget(undefined)}
          onSaved={handleSaved}
        />
      )}

      {logsTarget && (
        <IntegrationLogViewer
          integration={logsTarget}
          onClose={() => setLogsTarget(null)}
        />
      )}

      {testTarget && (
        <TestConnectionPanel
          integration={testTarget}
          onClose={() => setTestTarget(null)}
        />
      )}
    </div>
  )
}
