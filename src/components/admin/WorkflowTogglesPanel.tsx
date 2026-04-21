import { useState, useEffect } from 'react'
import { settingsApi } from '../../services/settings'
import { useToast } from '../Toast'
import { handleApiError } from '../../utils/apiError'
import { Toggle } from '../ui/Toggle'

interface WorkflowToggle {
  id: string
  label: string
  description: string
  enabled: boolean
  /** Set to true when backend code actually reads this toggle. UI gates
   *  the interactive switch and badges the row so operators aren't led
   *  to believe an automation is running when the server ignores it. */
  implemented: boolean
}

// Keep implemented flags in sync with IMPLEMENTED_TOGGLES in
// backend/src/utils/workflowToggles.ts. Only the toggles marked
// implemented=true are actually read by server code.
const DEFAULT_TOGGLES: WorkflowToggle[] = [
  { id: 'auto_crew_template', label: 'Auto-apply crew template', description: 'When a tech plan is created, automatically fill crew from the plan-type default template.', enabled: true, implemented: true },
  { id: 'notify_tech_plan_incomplete', label: 'Incomplete tech plan reminder', description: 'Send notification when a tech plan has empty required fields 24h before the event.', enabled: false, implemented: false },
  { id: 'notify_crew_conflict', label: 'Crew conflict notification', description: 'Send notification when a crew assignment creates a scheduling conflict.', enabled: true, implemented: false },
  { id: 'notify_event_change', label: 'Event change notification', description: 'Notify assigned crew when an event date, time, or channel changes.', enabled: false, implemented: false },
  { id: 'auto_status_on_publish', label: 'Auto-set status on publish', description: 'Set event status to "published" when event is pushed to external feeds.', enabled: false, implemented: false },
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
    }).catch(err => handleApiError(err, 'Failed to load workflow settings', toast)).finally(() => setLoading(false))
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
          <div
            key={toggle.id}
            className={`card p-4 flex items-center justify-between gap-4 ${toggle.implemented ? '' : 'opacity-60'}`}
          >
            <div>
              <div className="font-medium text-sm flex items-center gap-2">
                {toggle.label}
                {!toggle.implemented && (
                  <span className="text-[10px] uppercase tracking-wide bg-surface-2 text-muted px-1.5 py-0.5 rounded">
                    Coming soon
                  </span>
                )}
              </div>
              <div className="text-xs text-muted mt-0.5">{toggle.description}</div>
            </div>
            <Toggle
              active={toggle.enabled}
              onChange={v => handleToggle(toggle.id, v)}
              disabled={!toggle.implemented}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
