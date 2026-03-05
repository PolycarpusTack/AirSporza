import { Badge } from '../ui'
import type { Event, Sport, Competition } from '../../data/types'
import { fmtDate } from '../../utils'

interface EventDetailCardProps {
  event: Event
  sport?: Sport
  competition?: Competition
}

export function EventDetailCard({ event, sport, competition }: EventDetailCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{sport?.icon}</span>
            <h3 className="font-bold text-xl">{event.participants}</h3>
          </div>
          <div className="meta">{competition?.name} - {event.phase} - {event.complex}</div>
        </div>
        <div className="flex gap-2">
          {event.isLive && <Badge variant="live">LIVE</Badge>}
          {event.isDelayedLive && <Badge variant="warning">DELAYED</Badge>}
          {event.category && <Badge>{event.category}</Badge>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
        <div><div className="text-xs uppercase tracking-wide text-text-2">Date (BE)</div><div className="text-sm font-medium">{fmtDate(event.startDateBE)}</div></div>
        <div><div className="text-xs uppercase tracking-wide text-text-2">Time (BE)</div><div className="font-mono text-sm font-semibold">{event.startTimeBE}</div></div>
        <div><div className="text-xs uppercase tracking-wide text-text-2">Channel</div><div className="text-sm font-medium">{event.linearChannel || '—'}</div></div>
        <div><div className="text-xs uppercase tracking-wide text-text-2">Radio</div><div className="text-sm font-medium">{event.radioChannel || '—'}</div></div>
      </div>
    </div>
  )
}
