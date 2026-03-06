import { useState, useEffect } from 'react'
import { Modal } from '../ui'
import { IntegrationsPanel } from './IntegrationsPanel'
import { FieldConfigurator } from '../admin/FieldConfigurator'

type SettingsTab = 'event' | 'crew' | 'dashboard' | 'integrations'

interface SettingsModalProps {
  onClose: () => void
  defaultTab?: SettingsTab
  defaultIntegrationScope?: 'sports' | 'competitions' | 'teams' | 'events' | 'fixtures' | 'live'
  userRole?: string
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
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab)
  const isAdmin = userRole === 'admin'

  useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

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

      <div className="p-6 max-h-[70vh] overflow-auto">
        {activeTab === 'event' && (
          isAdmin
            ? <FieldConfigurator />
            : <div className="text-sm text-muted">Only admins can edit event field configuration.</div>
        )}

        {activeTab === 'crew' && (
          isAdmin
            ? <FieldConfigurator />
            : <div className="text-sm text-muted">Only admins can edit crew field configuration.</div>
        )}

        {activeTab === 'dashboard' && (
          <div className="text-sm text-muted">
            Dashboard customization is available from the role-specific view.
            Use the gear icon → "Customize Dashboard" from the main header.
          </div>
        )}

        {activeTab === 'integrations' && (
          <IntegrationsPanel userRole={userRole} defaultScope={defaultIntegrationScope} />
        )}
      </div>
    </Modal>
  )
}
