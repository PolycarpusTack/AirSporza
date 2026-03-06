import { useMemo } from 'react'
import { X, Copy, ExternalLink, Lock } from 'lucide-react'
import { Badge, Btn } from '../ui'
import type { Event, Sport, Competition, EventStatus, BadgeVariant, TechPlan, Contract, FieldConfig } from '../../data/types'
import type { ConflictWarning } from '../../services/events'
import { isEventLocked, isForwardTransition } from '../../utils/eventLock'
import { computeReadiness } from '../../utils/eventReadiness'

const EVENT_STATUSES: EventStatus[] = ['draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled']

interface EventDetailPanelProps {
  event: Event | null
  onClose: () => void
  onEdit: (event: Event) => void
  sports: Sport[]
  competitions: Competition[]
  onStatusChange?: (event: Event, status: EventStatus) => void
  onDuplicate?: (event: Event) => void
  onNavigateToSports?: (eventId: number) => void
  conflictMap?: Record<number, ConflictWarning[]>
  freezeWindowHours?: number
  userRole?: string
  techPlans?: TechPlan[]
  contracts?: Contract[]
  crewFields?: FieldConfig[]
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

export function EventDetailPanel({ event, onClose, onEdit, sports, competitions, onStatusChange, onDuplicate, onNavigateToSports, conflictMap, freezeWindowHours = 3, userRole, techPlans = [], contracts = [], crewFields = [] }: EventDetailPanelProps) {
  const sport = event ? sports.find(s => s.id === event.sportId) : null
  const competition = event ? competitions.find(c => c.id === event.competitionId) : null
  const conflicts = event ? conflictMap?.[event.id] : undefined
  const lock = event ? isEventLocked(event, freezeWindowHours, userRole) : { locked: false, reason: null, canOverride: false }
  const editDisabled = lock.locked && !lock.canOverride
  const readiness = useMemo(
    () => event ? computeReadiness(event, techPlans, contracts, crewFields) : null,
    [event, techPlans, contracts, crewFields]
  )

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

          {/* Lock indicator */}
          {lock.locked && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-warning/10 border border-warning/20 rounded-lg text-xs text-warning">
              <Lock className="w-3 h-3" />
              {lock.reason === 'status' ? 'Locked (status)' : 'Locked (freeze window)'}
              {lock.canOverride && <span className="text-text-3 ml-1">— admin override available</span>}
            </div>
          )}

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {onStatusChange && (
              <select
                className="inp text-xs py-1 px-2"
                value={event.status ?? 'draft'}
                onChange={e => onStatusChange(event, e.target.value as EventStatus)}
              >
                {EVENT_STATUSES.map(s => {
                  const currentStatus = (event.status ?? 'draft') as EventStatus
                  const forward = isForwardTransition(currentStatus, s)
                  const disabled = s === currentStatus || (lock.locked && !lock.canOverride && !forward)
                  return (
                    <option key={s} value={s} disabled={disabled}>{s}</option>
                  )
                })}
              </select>
            )}
            {onDuplicate && (
              <Btn variant="ghost" size="xs" onClick={() => onDuplicate(event)}>
                <Copy className="w-3 h-3 mr-1" />Duplicate
              </Btn>
            )}
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

          {/* Readiness */}
          {readiness && (
            <div className="text-sm">
              <p className="text-text-3 text-xs uppercase tracking-wider font-semibold mb-1">
                Readiness {readiness.score}/{readiness.total}
              </p>
              <div className="space-y-0.5">
                {readiness.checks.map(c => (
                  <div key={c.key} className="flex items-center gap-2 text-xs">
                    <span className={
                      c.status === 'pass' ? 'text-emerald-400'
                      : c.status === 'fail' ? 'text-red-400'
                      : 'text-zinc-500'
                    }>
                      {c.status === 'pass' ? '\u2713' : c.status === 'fail' ? '\u2717' : '\u2014'}
                    </span>
                    <span className="text-text-2">{c.label}</span>
                    {c.status === 'na' && <span className="text-text-3 ml-auto">N/A</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conflicts */}
          {conflicts && conflicts.length > 0 && (
            <div className="text-sm">
              <p className="text-text-3 text-xs uppercase tracking-wider font-semibold mb-1">Conflicts</p>
              <div className="space-y-1">
                {conflicts.map((c, i) => (
                  <div key={i} className="text-xs bg-warning/10 text-warning rounded px-2 py-1">
                    {c.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tech plans */}
          <div className="text-sm">
            <p className="text-text-3 text-xs uppercase tracking-wider font-semibold mb-1">Tech Plans</p>
            {(event.techPlans?.length ?? 0) > 0 ? (
              onNavigateToSports ? (
                <button
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                  onClick={() => onNavigateToSports(event.id)}
                >
                  <ExternalLink className="w-3 h-3" />
                  {event.techPlans!.length} plan(s) — Open in Sports
                </button>
              ) : (
                <p className="text-text-2">{event.techPlans!.length} plan(s) assigned</p>
              )
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-text-3 text-xs">No plans</span>
                {onNavigateToSports && (
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => onNavigateToSports(event.id)}
                  >
                    Create in Sports
                  </button>
                )}
              </div>
            )}
          </div>

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
            disabled={editDisabled}
            onClick={() => onEdit(event)}
          >
            {editDisabled ? 'View Event (Locked)' : 'Edit Event'}
          </button>
        </div>
      )}
    </div>
  )
}
