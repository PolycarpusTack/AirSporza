import { useState } from 'react'

interface NotifCategory {
  id: string
  label: string
  description: string
}

const CATEGORIES: NotifCategory[] = [
  { id: 'crew_conflict', label: 'Crew Conflicts', description: 'When a crew member is double-booked' },
  { id: 'event_change', label: 'Event Changes', description: 'When events are created, moved, or cancelled' },
  { id: 'tech_plan', label: 'Tech Plan Updates', description: 'When tech plans are modified' },
  { id: 'encoder_alert', label: 'Encoder Alerts', description: 'Encoder lock conflicts and availability' },
  { id: 'import_result', label: 'Import Results', description: 'When CSV or API imports complete' },
  { id: 'assignment', label: 'My Assignments', description: 'When you are assigned to an event or crew role' },
]

const STORAGE_KEY = 'planza_notif_prefs'

interface NotifPrefs {
  [categoryId: string]: { inApp: boolean; email: boolean }
}

function loadNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<NotifPrefs>(loadNotifPrefs)

  const toggle = (catId: string, channel: 'inApp' | 'email') => {
    setPrefs(prev => {
      const current = prev[catId] ?? { inApp: true, email: false }
      const next = { ...prev, [catId]: { ...current, [channel]: !current[channel] } }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const getVal = (catId: string, channel: 'inApp' | 'email') => {
    return prefs[catId]?.[channel] ?? (channel === 'inApp')
  }

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Notification Preferences</div>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted">Category</th>
              <th className="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-muted w-20">In-App</th>
              <th className="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-muted w-20">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {CATEGORIES.map(cat => (
              <tr key={cat.id} className="hover:bg-surface-2/50">
                <td className="px-4 py-3">
                  <div className="font-medium">{cat.label}</div>
                  <div className="text-xs text-muted">{cat.description}</div>
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={getVal(cat.id, 'inApp')}
                    onChange={() => toggle(cat.id, 'inApp')}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={getVal(cat.id, 'email')}
                    onChange={() => toggle(cat.id, 'email')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted mt-2">Email notifications require SMTP configuration by an admin.</div>
    </div>
  )
}
