import { Modal } from '../ui'
import { usePreferences, type UserPreferences } from '../../hooks/usePreferences'
import { useApp } from '../../context/AppProvider'

interface Props {
  onClose: () => void
}

export function UserPreferencesModal({ onClose }: Props) {
  const { prefs, update, reset } = usePreferences()
  const { sports } = useApp()

  return (
    <Modal title="Preferences" onClose={onClose} width="max-w-lg">
      <div className="p-6 space-y-5">

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Default View on Login</label>
          <select
            className="inp w-full"
            value={prefs.defaultView}
            onChange={e => update({ defaultView: e.target.value as UserPreferences['defaultView'] })}
          >
            <option value="planner">Planning</option>
            <option value="sports">Sports Workspace</option>
            <option value="contracts">Contracts</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Default Sport Filter</label>
          <select
            className="inp w-full"
            value={prefs.defaultSportFilter ?? ''}
            onChange={e => update({ defaultSportFilter: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">All Sports</option>
            {sports.map(s => (
              <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Date Format</label>
          <select
            className="inp w-full"
            value={prefs.dateFormat}
            onChange={e => update({ dateFormat: e.target.value as UserPreferences['dateFormat'] })}
          >
            <option value="en-GB">DD/MM/YYYY (European)</option>
            <option value="en-US">MM/DD/YYYY (US)</option>
            <option value="nl-BE">DD-MM-YYYY (Belgian)</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Compact Mode</div>
            <div className="text-xs text-muted">Reduce spacing in calendar and list views</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.compactMode}
            onChange={e => update({ compactMode: e.target.checked })}
            className="w-4 h-4"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Show Week Numbers</div>
            <div className="text-xs text-muted">Display ISO week numbers in the calendar header</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.showWeekNumbers}
            onChange={e => update({ showWeekNumbers: e.target.checked })}
            className="w-4 h-4"
          />
        </div>

        <div className="pt-4 border-t border-border flex justify-between">
          <button onClick={reset} className="text-xs text-danger hover:underline">
            Reset to defaults
          </button>
          <button onClick={onClose} className="btn btn-p btn-sm">Done</button>
        </div>
      </div>
    </Modal>
  )
}
