import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { settingsApi, type AutoFillRule } from '../../services/settings'
import { channelsApi } from '../../services/channels'
import type { Channel } from '../../data/types'
import { useApp } from '../../context/AppProvider'
import { useToast } from '../Toast'
import { handleApiError } from '../../utils/apiError'

export function AutoFillRulesPanel() {
  const [rules, setRules] = useState<AutoFillRule[]>([])
  const [loading, setLoading] = useState(true)
  const { sports, competitions } = useApp()
  const toast = useToast()
  const [channelList, setChannelList] = useState<Channel[]>([])

  useEffect(() => {
    channelsApi.list().then(setChannelList).catch(err => handleApiError(err, 'Failed to load channels', toast))
  }, [])

  useEffect(() => {
    settingsApi.getAutoFillRules()
      .then(r => setRules(r.rules))
      .catch(err => handleApiError(err, 'Failed to load auto-fill rules', toast))
      .finally(() => setLoading(false))
  }, [])

  const save = async (updated: AutoFillRule[]) => {
    try {
      await settingsApi.updateAutoFillRules(updated)
      setRules(updated)
      toast.success('Auto-fill rules saved')
    } catch {
      toast.error('Failed to save rules')
    }
  }

  const addRule = () => {
    const newRule: AutoFillRule = {
      id: crypto.randomUUID(),
      trigger: 'sport',
      triggerValue: '',
      field: 'linearChannel',
      value: '',
      label: '',
    }
    setRules(prev => [...prev, newRule])
  }

  const updateRule = (id: string, patch: Partial<AutoFillRule>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const removeRule = (id: string) => {
    const updated = rules.filter(r => r.id !== id)
    save(updated)
  }

  const channels = channelList

  if (loading) return <div className="text-sm text-muted py-4">Loading...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold">Auto-Fill Rules</h4>
          <p className="text-xs text-muted mt-1">When a trigger matches, the target field is auto-populated in new events.</p>
        </div>
        <button onClick={addRule} className="btn btn-p btn-sm flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Rule
        </button>
      </div>

      {rules.length === 0 && (
        <div className="text-sm text-muted text-center py-8">No auto-fill rules configured.</div>
      )}

      {rules.map(rule => (
        <div key={rule.id} className="card p-4 flex gap-3 items-end">
          <div className="flex-1 grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">When</label>
              <select
                className="inp text-sm w-full"
                value={rule.trigger}
                onChange={e => updateRule(rule.id, { trigger: e.target.value as AutoFillRule['trigger'] })}
              >
                <option value="sport">Sport is</option>
                <option value="competition">Competition is</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Equals</label>
              <select
                className="inp text-sm w-full"
                value={rule.triggerValue}
                onChange={e => updateRule(rule.id, { triggerValue: e.target.value })}
              >
                <option value="">Select...</option>
                {rule.trigger === 'sport' && sports.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.icon} {s.name}</option>
                ))}
                {rule.trigger === 'competition' && competitions.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Set field</label>
              <select
                className="inp text-sm w-full"
                value={rule.field}
                onChange={e => updateRule(rule.id, { field: e.target.value })}
              >
                <option value="linearChannel">Linear Channel</option>
                <option value="radioChannel">Radio Channel</option>
                <option value="onDemandChannel">On-Demand Channel</option>
                <option value="duration">Duration</option>
                <option value="complex">Complex</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">To value</label>
              {(rule.field === 'linearChannel' || rule.field === 'radioChannel' || rule.field === 'onDemandChannel') ? (
                <select className="inp text-sm w-full" value={rule.value} onChange={e => updateRule(rule.id, { value: e.target.value })}>
                  <option value="">Select...</option>
                  {channels.map((ch) => <option key={ch.id} value={String(ch.id)}>{ch.name}</option>)}
                </select>
              ) : (
                <input
                  className="inp text-sm w-full"
                  value={rule.value}
                  onChange={e => updateRule(rule.id, { value: e.target.value })}
                  placeholder="Value"
                />
              )}
            </div>
          </div>
          <button onClick={() => removeRule(rule.id)} className="p-2 text-danger hover:bg-danger/10 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      {rules.length > 0 && (
        <div className="flex justify-end">
          <button onClick={() => save(rules)} className="btn btn-p btn-sm">Save Rules</button>
        </div>
      )}
    </div>
  )
}
