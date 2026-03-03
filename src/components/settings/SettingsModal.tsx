import { useEffect, useState } from 'react'
import { Btn, Modal } from '../ui'
import { IntegrationsPanel } from './IntegrationsPanel'

type SettingsTab = 'event' | 'crew' | 'dashboard' | 'integrations'

interface SettingsModalProps {
  onClose: () => void
  defaultTab?: SettingsTab
  defaultIntegrationScope?: 'sports' | 'competitions' | 'teams' | 'events' | 'fixtures' | 'live'
  userRole?: string
  onOpenEventFields: () => void
  onOpenCrewFields: () => void
  onOpenDashboard: () => void
}

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'event', label: 'Event Fields' },
  { id: 'crew', label: 'Crew Fields' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'integrations', label: 'Integrations' },
]

export function SettingsModal({
  onClose,
  defaultTab = 'event',
  defaultIntegrationScope = 'events',
  userRole,
  onOpenEventFields,
  onOpenCrewFields,
  onOpenDashboard,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab)
  const isAdmin = userRole === 'admin'

  useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

  const openSubModal = (open: () => void) => {
    onClose()
    open()
  }

  return (
    <Modal title="Settings" onClose={onClose} width="max-w-6xl">
      <div className="border-b border-border px-6 pt-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-t-sm border px-3 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'border-border border-b-surface bg-surface text-foreground'
                  : 'border-transparent bg-transparent text-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'event' && (
        <div className="space-y-4 p-6">
          <div>
            <h4 className="section-title">Event Metadata</h4>
            <p className="meta mt-1">Adjust which event fields are visible and required in the planner form.</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Event field editor</div>
                <div className="meta mt-1">Global admin-managed event schema for the planner workflow.</div>
              </div>
              <Btn variant="secondary" disabled={!isAdmin} onClick={() => openSubModal(onOpenEventFields)}>
                Open Editor
              </Btn>
            </div>
            {!isAdmin && <div className="meta mt-3">Only admins can edit the global event field schema.</div>}
          </div>
        </div>
      )}

      {activeTab === 'crew' && (
        <div className="space-y-4 p-6">
          <div>
            <h4 className="section-title">Crew & Technical Fields</h4>
            <p className="meta mt-1">Control which operational fields appear in the sports workspace and technical plans.</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Crew field editor</div>
                <div className="meta mt-1">Global admin-managed crew and technical metadata schema.</div>
              </div>
              <Btn variant="secondary" disabled={!isAdmin} onClick={() => openSubModal(onOpenCrewFields)}>
                Open Editor
              </Btn>
            </div>
            {!isAdmin && <div className="meta mt-3">Only admins can edit the global crew field schema.</div>}
          </div>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="space-y-4 p-6">
          <div>
            <h4 className="section-title">Dashboard Layout</h4>
            <p className="meta mt-1">Choose which widgets are visible for the current role view and in what order they appear.</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Dashboard customizer</div>
                <div className="meta mt-1">Save your own dashboard layout for the active role view. Admin role defaults can be added later.</div>
              </div>
              <Btn variant="secondary" onClick={() => openSubModal(onOpenDashboard)}>
                Open Customizer
              </Btn>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'integrations' && (
        <IntegrationsPanel userRole={userRole} defaultScope={defaultIntegrationScope} />
      )}
    </Modal>
  )
}
