import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertOctagon, AlertTriangle } from 'lucide-react'
import { useApp } from '../../../context/AppProvider'
import { useRightsCheck, type RightsStatus } from '../../../hooks/useRightsCheck'
import type { Event } from '../../../data/types'

const SEVERITY_RANK: Record<RightsStatus['severity'], number> = {
  error: 0, warning: 1, info: 2, ok: 3,
}

/**
 * Shows the events whose rights check returned any non-ok verdict,
 * grouped by severity. Pulls from useApp().events so it reflects the
 * same filter/refresh state as the rest of the app, and uses the
 * batched /api/rights/check endpoint for a single round-trip.
 */
export function RightsIssuesWidget() {
  const { events } = useApp()
  const navigate = useNavigate()

  const eventIds = useMemo(() => events.map(e => e.id), [events])
  const rightsMap = useRightsCheck(eventIds)

  const issues = useMemo(() => {
    const rows: Array<{ event: Event; status: RightsStatus }> = []
    for (const ev of events) {
      const status = rightsMap[ev.id]
      if (!status || status.severity === 'ok') continue
      rows.push({ event: ev, status })
    }
    return rows.sort((a, b) =>
      SEVERITY_RANK[a.status.severity] - SEVERITY_RANK[b.status.severity],
    )
  }, [events, rightsMap])

  // Distinguish "no data yet" (rightsMap empty) from "checked, all clean".
  const anyStatusFetched = Object.keys(rightsMap).length > 0

  if (!anyStatusFetched) {
    return <p className="text-xs text-text-3 mt-2">Checking rights…</p>
  }

  if (issues.length === 0) {
    return <p className="text-xs text-text-3 mt-2">No rights issues on visible events.</p>
  }

  const errorCount = issues.filter(i => i.status.severity === 'error').length
  const warningCount = issues.filter(i => i.status.severity === 'warning').length

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-3 text-[11px] text-text-3">
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <AlertOctagon className="w-3 h-3" /> {errorCount} blocked
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1 text-amber-500">
            <AlertTriangle className="w-3 h-3" /> {warningCount} warning
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {issues.slice(0, 6).map(({ event, status }) => {
          const isError = status.severity === 'error'
          const topCode = status.results[0]?.code ?? ''
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => navigate('/planner')}
                className="w-full text-left flex items-center gap-2 py-1 hover:bg-surface-2 rounded px-1 -mx-1"
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                    isError ? 'bg-red-500' : 'bg-amber-400'
                  }`}
                />
                <span className="text-sm truncate flex-1">
                  {event.participants || event.content || `Event #${event.id}`}
                </span>
                <span className="text-[10px] font-mono text-text-3 whitespace-nowrap">
                  {topCode}
                </span>
              </button>
            </li>
          )
        })}
        {issues.length > 6 && (
          <li className="text-[11px] text-text-3 text-center pt-1">
            +{issues.length - 6} more with issues
          </li>
        )}
      </ul>
    </div>
  )
}
