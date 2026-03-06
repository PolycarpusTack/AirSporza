import { useState, useEffect } from 'react'
import { settingsApi } from '../../services/settings'
import { useToast } from '../Toast'
import { Toggle } from '../ui/Toggle'

interface WorkflowToggle {
  id: string
  label: string
  description: string
  enabled: boolean
}

const DEFAULT_TOGGLES: WorkflowToggle[] = [
  { id: 'auto_crew_template', label: 'Auto-apply crew template', description: 'When a tech plan is created, automatically fill crew from the plan-type default template.', enabled: true },
  { id: 'notify_tech_plan_incomplete', label: 'Incomplete tech plan reminder', description: 'Send notification when a tech plan has empty required fields 24h before the event.', enabled: false },
  { id: 'notify_crew_conflict', label: 'Crew conflict notification', description: 'Send notification when a crew assignment creates a scheduling conflict.', enabled: true },
  { id: 'notify_event_change', label: 'Event change notification', description: 'Notify assigned crew when an event date, time, or channel changes.', enabled: false },
  { id: 'auto_status_on_publish', label: 'Auto-set status on publish', description: 'Set event status to "published" when event is pushed to external feeds.', enabled: false },
]

export function WorkflowTogglesPanel() {
  const [toggles, setToggles] = useState<WorkflowToggle[]>(DEFAULT_TOGGLES)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    settingsApi.getApp('admin').then(settings => {
      const org = settings.orgConfig as Record<string, unknown> | null
      const saved = org?.workflowToggles as Record<string, boolean> | undefined
      if (saved) {
        setToggles(prev => prev.map(t => ({ ...t, enabled: saved[t.id] ?? t.enabled })))
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleToggle = async (id: string, enabled: boolean) => {
    setToggles(prev => prev.map(t => t.id === id ? { ...t, enabled } : t))
    try {
      const toggleMap = Object.fromEntries(
        toggles.map(t => [t.id, t.id === id ? enabled : t.enabled])
      )
      const currentSettings = await settingsApi.getApp('admin')
      const currentOrg = (currentSettings.orgConfig ?? {}) as Record<string, unknown>
      await settingsApi.updateOrgConfig({ ...currentOrg, workflowToggles: toggleMap } as unknown as Parameters<typeof settingsApi.updateOrgConfig>[0])
      toast.success('Workflow updated')
    } catch {
      toast.error('Failed to save')
    }
  }

  if (loading) return <div className="text-sm text-muted py-4">Loading...</div>

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-bold">Workflow Automation</h4>
        <p className="text-xs text-muted mt-1">Toggle automated behaviors. These run server-side when triggered by user actions.</p>
      </div>

      <div className="space-y-3">
        {toggles.map(toggle => (
          <div key={toggle.id} className="card p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-sm">{toggle.label}</div>
              <div className="text-xs text-muted mt-0.5">{toggle.description}</div>
            </div>
            <Toggle active={toggle.enabled} onChange={v => handleToggle(toggle.id, v)} />
          </div>
        ))}
      </div>
    </div>
  )
}
