import { useState, useEffect } from 'react'
import { Trash2, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { adaptersApi, type AdapterConfig } from '../../services/adapters'
import { useToast } from '../Toast'

export function AdapterConfigPanel() {
  const toast = useToast()
  const [configs, setConfigs] = useState<AdapterConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adaptersApi.list().then(setConfigs).catch(() => toast.error('Failed to load adapter configs')).finally(() => setLoading(false))
  }, [])

  const toggleActive = async (config: AdapterConfig) => {
    try {
      const updated = await adaptersApi.update(config.id, { isActive: !config.isActive })
      setConfigs(prev => prev.map(c => c.id === config.id ? { ...c, ...updated } : c))
    } catch (err: any) {
      toast.error(err.message || 'Failed to update')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await adaptersApi.delete(id)
      setConfigs(prev => prev.filter(c => c.id !== id))
      toast.success('Adapter deleted')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  if (loading) return <div className="h-32 bg-surface-2 rounded-xl animate-pulse" />

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Type</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Provider</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Direction</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Status</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Health</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {configs.map(c => (
              <tr key={c.id} className="hover:bg-surface-2 transition">
                <td className="px-4 py-3 font-medium text-xs">{c.adapterType}</td>
                <td className="px-4 py-3 text-xs">{c.providerName}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    c.direction === 'INBOUND' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-300'
                  }`}>{c.direction}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(c)} className="flex items-center gap-1.5">
                    {c.isActive
                      ? <><CheckCircle className="w-3.5 h-3.5 text-green-400" /><span className="text-xs text-green-400">Active</span></>
                      : <><XCircle className="w-3.5 h-3.5 text-text-3" /><span className="text-xs text-text-3">Inactive</span></>
                    }
                  </button>
                </td>
                <td className="px-4 py-3">
                  {c.consecutiveFailures > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <XCircle className="w-3 h-3" /> {c.consecutiveFailures} failures
                    </span>
                  ) : c.lastSuccessAt ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle className="w-3 h-3" /> OK
                    </span>
                  ) : (
                    <span className="text-xs text-text-3">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(c.id)} className="p-1 text-muted hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {configs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">
                <RefreshCw className="w-6 h-6 mx-auto mb-2 opacity-30" />
                No adapters configured
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
