import { useState } from 'react'
import { Sliders, Trophy, Award, Monitor, Upload, Webhook, Building2 } from 'lucide-react'
import type { DashboardWidget } from '../data/types'
import { AdminView } from './AdminView'
import type { AdminTab } from './AdminView'

interface SettingsViewProps {
  widgets: DashboardWidget[]
}

const SECTIONS: { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'fields',       label: 'Field Definitions', icon: Sliders },
  { id: 'sports',       label: 'Sports',            icon: Trophy },
  { id: 'competitions', label: 'Competitions',      icon: Award },
  { id: 'encoders',     label: 'Encoders',          icon: Monitor },
  { id: 'csv',          label: 'CSV Import',        icon: Upload },
  { id: 'publish',     label: 'Publish',           icon: Webhook },
  { id: 'org',         label: 'Organisation',      icon: Building2 },
]

export function SettingsView({ widgets }: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<AdminTab>('fields')

  return (
    <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Settings sidebar nav */}
      <aside className="w-52 flex-shrink-0">
        <p className="px-3 py-1 text-xs font-semibold uppercase tracking-widest text-text-3 font-mono mb-1">
          Configuration
        </p>
        <nav className="space-y-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
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
