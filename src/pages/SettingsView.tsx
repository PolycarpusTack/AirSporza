import { useState } from 'react'
import { Sliders, Trophy, Award, Monitor, Upload, Webhook, Building2, Users, LayoutTemplate, Zap, FileText, ClipboardList, Tv, Shield, Cable } from 'lucide-react'
import type { DashboardWidget } from '../data/types'
import { AdminView } from './AdminView'
import type { AdminTab } from './AdminView'

interface SettingsViewProps {
  widgets: DashboardWidget[]
}

interface SidebarGroup {
  label: string
  items: { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[]
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: 'Workspace',
    items: [
      { id: 'org',           label: 'Organisation',      icon: Building2 },
      { id: 'sports',        label: 'Sports',            icon: Trophy },
      { id: 'competitions',  label: 'Competitions',      icon: Award },
    ],
  },
  {
    label: 'Planning',
    items: [
      { id: 'fields',         label: 'Field Configuration', icon: Sliders },
      { id: 'crew-roster',    label: 'Crew Roster',         icon: Users },
      { id: 'crew-templates', label: 'Crew Templates',      icon: LayoutTemplate },
      { id: 'encoders',       label: 'Encoders',            icon: Monitor },
      { id: 'autofill',       label: 'Auto-Fill Rules',     icon: Zap },
      { id: 'workflows',      label: 'Workflow Automation', icon: ClipboardList },
    ],
  },
  {
    label: 'Data',
    items: [
      { id: 'csv',        label: 'CSV Import',         icon: Upload },
      { id: 'publish',    label: 'Publish & Webhooks', icon: Webhook },
      { id: 'audit-log',  label: 'Audit Log',          icon: FileText },
    ],
  },
  {
    label: 'Broadcast',
    items: [
      { id: 'channels', label: 'Channels',        icon: Tv },
      { id: 'rights',   label: 'Rights Policies', icon: Shield },
      { id: 'adapters',  label: 'Adapters',        icon: Cable },
    ],
  },
]

export function SettingsView({ widgets }: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<AdminTab>('org')

  return (
    <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Settings sidebar nav */}
      <aside className="w-52 flex-shrink-0 space-y-4">
        {SIDEBAR_GROUPS.map(group => (
          <div key={group.label}>
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-widest text-text-3 font-mono mb-1">
              {group.label}
            </p>
            <nav className="space-y-0.5">
              {group.items.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeSection === id
                      ? 'bg-primary/10 text-primary border-l-2 border-primary -ml-px pl-[11px]'
                      : 'text-text-2 hover:bg-surface-2 hover:text-text border-l-2 border-transparent -ml-px pl-[11px]'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                </button>
              ))}
            </nav>
          </div>
        ))}
      </aside>

      {/* Content area */}
      <div className="flex-1 min-w-0">
        <AdminView
          widgets={widgets}
          activeTab={activeSection}
          onTabChange={setActiveSection}
        />
      </div>
    </div>
  )
}
