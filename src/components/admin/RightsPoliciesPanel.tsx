import { useState, useEffect } from 'react'
import { Trash2, Shield } from 'lucide-react'
import { rightsApi, type RightsPolicy } from '../../services/rights'
import { useToast } from '../Toast'

export function RightsPoliciesPanel() {
  const toast = useToast()
  const [policies, setPolicies] = useState<RightsPolicy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    rightsApi.list().then(setPolicies).catch(() => toast.error('Failed to load rights policies')).finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    try {
      await rightsApi.delete(id)
      setPolicies(prev => prev.filter(p => p.id !== id))
      toast.success('Policy deleted')
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
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Competition</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Territories</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Platforms</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Coverage</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Max Runs</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {policies.map(p => (
              <tr key={p.id} className="hover:bg-surface-2 transition">
                <td className="px-4 py-3 font-medium">{p.competition?.name || `#${p.competitionId}`}</td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {(p.territory || []).map(t => (
                      <span key={t} className="px-1.5 py-0.5 bg-surface-2 rounded text-text-3">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {(p.platforms || []).map(pl => (
                      <span key={pl} className="px-1.5 py-0.5 bg-blue-500/10 rounded text-blue-300">{pl}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">{p.coverageType}</td>
                <td className="px-4 py-3 text-xs font-mono">{p.maxLiveRuns ?? '\u221E'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(p.id)} className="p-1 text-muted hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {policies.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">
                <Shield className="w-6 h-6 mx-auto mb-2 opacity-30" />
                No rights policies configured
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
