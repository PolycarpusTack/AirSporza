import { useState, useEffect, useCallback } from 'react'
import { Trash2, Globe, Lock } from 'lucide-react'
import { Btn, Badge } from '../ui'
import { crewTemplatesApi } from '../../services/crewTemplates'
import { useToast } from '../Toast'
import type { CrewTemplate } from '../../data/types'

export function CrewTemplatesPanel() {
  const [templates, setTemplates] = useState<CrewTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTemplates(await crewTemplatesApi.list())
    } catch {
      toast.error('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleToggleShared = async (t: CrewTemplate) => {
    try {
      await crewTemplatesApi.update(t.id, { isShared: !t.isShared })
      toast.success(t.isShared ? 'Made private' : 'Shared with all')
      load()
    } catch {
      toast.error('Update failed')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await crewTemplatesApi.delete(id)
      toast.success('Deleted')
      load()
    } catch {
      toast.error('Delete failed')
    }
  }

  const defaults = templates.filter(t => t.planType !== null)
  const custom = templates.filter(t => t.planType === null)

  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-md bg-surface-2" />)}</div>
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold">Crew Templates</h3>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-2 mb-3">Plan-Type Defaults</h4>
        {defaults.length === 0 ? (
          <div className="card p-6 text-center text-text-3 text-sm">No plan-type defaults configured yet.</div>
        ) : (
          <div className="grid gap-3">
            {defaults.map(t => (
              <div key={t.id} className="card p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-text-2">Plan type: <span className="font-mono">{t.planType}</span></div>
                  <div className="text-xs text-text-3 mt-1">Fields: {Object.entries(t.crewData).filter(([, v]) => v).map(([k]) => k).join(', ') || 'empty'}</div>
                </div>
                <Btn variant="ghost" size="xs" onClick={() => handleDelete(t.id)}><Trash2 className="w-3.5 h-3.5 text-danger" /></Btn>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-2 mb-3">Custom Templates</h4>
        {custom.length === 0 ? (
          <div className="card p-6 text-center text-text-3 text-sm">No custom templates yet. Users can save templates from the Sports tab.</div>
        ) : (
          <div className="grid gap-3">
            {custom.map(t => (
              <div key={t.id} className="card p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {t.name}
                    {t.isShared
                      ? <Badge variant="success"><Globe className="w-3 h-3 mr-0.5" /> Shared</Badge>
                      : <Badge variant="none"><Lock className="w-3 h-3 mr-0.5" /> Private</Badge>
                    }
                  </div>
                  <div className="text-xs text-text-3 mt-1">Fields: {Object.entries(t.crewData).filter(([, v]) => v).map(([k]) => k).join(', ') || 'empty'}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Btn variant="ghost" size="xs" onClick={() => handleToggleShared(t)}>{t.isShared ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}</Btn>
                  <Btn variant="ghost" size="xs" onClick={() => handleDelete(t.id)}><Trash2 className="w-3.5 h-3.5 text-danger" /></Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
