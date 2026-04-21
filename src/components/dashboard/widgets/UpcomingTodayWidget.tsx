import { useMemo } from 'react'
import { useApp } from '../../../context/AppProvider'
import { useNavigate } from 'react-router-dom'
import type { Event } from '../../../data/types'

function eventStartMs(ev: Event): number | null {
  if (!ev.startDateBE || !ev.startTimeBE) return null
  // Parse "YYYY-MM-DD" + "HH:MM" as Belgian local time. We don't need DST
  // accuracy to sort events relative to each other within a day, so we
  // treat the result as a naive local timestamp.
  const [h, m] = ev.startTimeBE.split(':').map(Number)
  const d = new Date(ev.startDateBE)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.getTime()
}

export function UpcomingTodayWidget() {
  const { events, sports } = useApp()
  const navigate = useNavigate()
  const sportById = new Map(sports.map(s => [s.id, s]))

  const upcoming = useMemo(() => {
    const now = Date.now()
    const horizon = now + 24 * 60 * 60 * 1000
    return events
      .map(ev => ({ ev, start: eventStartMs(ev) }))
      .filter(({ start }) => start !== null && start >= now && start <= horizon)
      .sort((a, b) => (a.start as number) - (b.start as number))
  }, [events])

  if (upcoming.length === 0) {
    return <p className="text-xs text-text-3">No events scheduled in the next 24 hours.</p>
  }

  return (
    <ul className="space-y-1.5 mt-2">
      {upcoming.slice(0, 6).map(({ ev, start }) => {
        const sport = sportById.get(ev.sportId)
        const timeLabel = new Date(start as number).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        return (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => navigate('/planner')}
              className="w-full text-left flex items-center gap-2 py-1 hover:bg-surface-2 rounded px-1 -mx-1"
            >
              <span className="text-xs font-mono text-text-3 w-10 flex-shrink-0">{timeLabel}</span>
              <span className="text-sm truncate flex-1">
                {ev.participants || ev.content || 'Untitled event'}
              </span>
              <span className="text-[11px] text-text-3 whitespace-nowrap">
                {sport?.icon} {ev.linearChannel ?? '—'}
              </span>
            </button>
          </li>
        )
      })}
      {upcoming.length > 6 && (
        <li className="text-[11px] text-text-3 text-center pt-1">
          +{upcoming.length - 6} more in the next 24h
        </li>
      )}
    </ul>
  )
}
