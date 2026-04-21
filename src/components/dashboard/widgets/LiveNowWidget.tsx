import { useApp } from '../../../context/AppProvider'
import { useNavigate } from 'react-router-dom'
import type { Event } from '../../../data/types'

function isLiveEvent(ev: Event): boolean {
  // Prefer the DB status when present; fall back to the legacy isLive
  // flag for events imported before status was adopted.
  if ((ev as { status?: string }).status === 'live') return true
  return ev.isLive === true
}

export function LiveNowWidget() {
  const { events, sports } = useApp()
  const navigate = useNavigate()
  const sportById = new Map(sports.map(s => [s.id, s]))

  const live = events.filter(isLiveEvent)

  if (live.length === 0) {
    return <p className="text-xs text-text-3">No events live right now.</p>
  }

  return (
    <ul className="space-y-2 mt-2">
      {live.slice(0, 6).map(ev => {
        const sport = sportById.get(ev.sportId)
        return (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => navigate('/planner')}
              className="w-full text-left flex items-center gap-2 py-1 hover:bg-surface-2 rounded px-1 -mx-1"
            >
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-label="Live" />
              <span className="text-sm font-medium truncate flex-1">
                {ev.participants || ev.content || 'Untitled event'}
              </span>
              <span className="text-[11px] text-text-3 whitespace-nowrap">
                {sport?.icon} {ev.linearChannel ?? '—'}
              </span>
            </button>
          </li>
        )
      })}
      {live.length > 6 && (
        <li className="text-[11px] text-text-3 text-center pt-1">
          +{live.length - 6} more
        </li>
      )}
    </ul>
  )
}
