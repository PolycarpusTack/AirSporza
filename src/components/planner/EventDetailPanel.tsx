import { X } from 'lucide-react'
import { Badge } from '../ui'
import type { Event, Sport, Competition, EventStatus, BadgeVariant } from '../../data/types'

interface EventDetailPanelProps {
  event: Event | null
  onClose: () => void
  onEdit: (event: Event) => void
  sports: Sport[]
  competitions: Competition[]
}

function statusVariant(s: EventStatus): BadgeVariant {
  const map: Record<EventStatus, BadgeVariant> = {
    draft: 'draft',
    ready: 'warning',
    approved: 'success',
    published: 'live',
    live: 'live',
    completed: 'default',
    cancelled: 'danger',
  }
  return map[s] ?? 'default'
}

export function EventDetailPanel({ event, onClose, onEdit, sports, competitions }: EventDetailPanelProps) {
  const sport = event ? sports.find(s => s.id === event.sportId) : null
  const competition = event ? competitions.find(c => c.id === event.competitionId) : null

  return (
    <div
      className={[
        'fixed top-0 right-0 h-full w-80 bg-surface border-l shadow-xl z-30',
        'flex flex-col transition-transform duration-200',
        event ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          {sport?.icon && <span className="text-lg">{sport.icon}</span>}
          <span className="text-sm font-semibold text-text-2 truncate">
            {competition?.name ?? 'Event'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="btn btn-g btn-sm"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      {event && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h2 className="text-base font-bold text-text-1">{event.participants}</h2>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-text-3 w-20 shrink-0">Date</span>
              <span className="text-text-2">
                {typeof event.startDateBE === 'string'
                  ? new Date(event.startDateBE + 'T00:00:00').toLocaleDateString('en-GB', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    })
                  : (event.startDateBE as Date).toLocaleDateString('en-GB')}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-text-3 w-20 shrink-0">Time</span>
              <span className="text-text-2">{event.startTimeBE}</span>
            </div>
            {event.duration && (
              <div className="flex gap-2">
                <span className="text-text-3 w-20 shrink-0">Duration</span>
                <span className="text-text-2">{event.duration}</span>
              </div>
            )}
          </div>

          <div>
            <Badge variant={statusVariant(event.status ?? 'draft')}>
              {event.status ?? 'draft'}
            </Badge>
          </div>

          {(event.linearChannel || event.radioChannel || event.onDemandChannel) && (
            <div className="space-y-1 text-sm">
              <p className="text-text-3 text-xs uppercase tracking-wider font-semibold">Channels</p>
              {event.linearChannel && (
                <div className="flex gap-2">
                  <span className="text-text-3 w-20 shrink-0">Linear</span>
                  <span className="text-text-2">{event.linearChannel}</span>
                </div>
              )}
              {event.radioChannel && (
                <div className="flex gap-2">
                  <span className="text-text-3 w-20 shrink-0">Radio</span>
                  <span className="text-text-2">{event.radioChannel}</span>
                </div>
              )}
              {event.onDemandChannel && (
                <div className="flex gap-2">
                  <span className="text-text-3 w-20 shrink-0">On Demand</span>
                  <span className="text-text-2">{event.onDemandChannel}</span>
                </div>
              )}
            </div>
          )}

          {(event.techPlans?.length ?? 0) > 0 && (
            <div className="text-sm">
              <span className="text-text-3 text-xs uppercase tracking-wider font-semibold">Tech Plans</span>
              <p className="text-text-2 mt-1">{event.techPlans!.length} plan(s) assigned</p>
            </div>
          )}

          {event.phase && (
            <div className="text-sm">
              <span className="text-text-3 w-20">Phase</span>
              <span className="text-text-2 ml-2">{event.phase}</span>
            </div>
          )}

          {event.complex && (
            <div className="text-sm">
              <span className="text-text-3 w-20">Complex</span>
              <span className="text-text-2 ml-2">{event.complex}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {event && (
        <div className="p-4 border-t">
          <button
            className="btn btn-p w-full"
            onClick={() => onEdit(event)}
          >
            Edit Event
          </button>
        </div>
      )}
    </div>
  )
}
