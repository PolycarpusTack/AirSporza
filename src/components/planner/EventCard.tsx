import React, { type ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Lock } from 'lucide-react'
import { Badge } from '../ui'
import type { Event } from '../../data/types'
import { statusVariant } from '../../utils/calendarLayout'
import type { ReadinessResult } from '../../utils/eventReadiness'
import type { RightsStatus } from '../../hooks/useRightsCheck'
import { RightsStatusBadge } from './RightsStatusBadge'

// ── Skeleton ─────────────────────────────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div className="card p-4 animate-pulse mb-3">
      <div className="h-2.5 bg-surface-2 rounded w-3/4 mb-3" />
      <div className="h-3 bg-surface-2 rounded w-1/2 mb-2" />
      <div className="h-2 bg-surface-2 rounded w-1/3" />
    </div>
  )
}

// ── Drag-and-drop wrapper ────────────────────────────────────────────────────

export function DraggableEventCard({ event, children, locked }: { event: Event; children: ReactNode; locked?: boolean }) {
  const disabled = locked || event.status === 'completed' || event.status === 'cancelled'
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(event.id),
    disabled,
    data: { event },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

// ── EventCard Props ──────────────────────────────────────────────────────────

export interface EventCardProps {
  event: Event
  style: React.CSSProperties          // pre-computed top, height, left, width
  channelColor: { border: string; bg: string; text: string }
  sportName: string
  sportIcon?: string
  isSelected: boolean
  isLocked: boolean
  hasConflict: boolean
  conflictTooltip?: string
  readiness?: ReadinessResult
  /** Optional rights-check outcome. Absent or 'ok' renders nothing. */
  rights?: RightsStatus
  selectionMode: boolean
  cardHeight: number                   // numeric height for conditional rendering
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onToggleSelect: () => void
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
}

// ── EventCard ────────────────────────────────────────────────────────────────

export const EventCard = React.memo(function EventCard({
  event,
  style,
  channelColor: col,
  sportIcon,
  isSelected,
  isLocked,
  hasConflict,
  conflictTooltip,
  readiness,
  rights,
  selectionMode,
  cardHeight,
  onClick,
  onContextMenu,
  onToggleSelect,
  onPointerDown,
}: EventCardProps) {
  const time = event.linearStartTime || event.startTimeBE
  const height = cardHeight

  return (
    <div
      data-event-card="true"
      className={[
        'absolute rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity',
        selectionMode && isSelected ? 'ring-2 ring-blue-400' : '',
        isLocked && height <= 30 ? 'opacity-80' : '',
      ].filter(Boolean).join(' ')}
      style={style}
      title={`${time} · ${event.participants}${isLocked ? ' (locked)' : ''}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
    >
      {isLocked && height > 30 && (
        <Lock className="absolute top-1 right-1 w-3 h-3 text-warning/70 z-10" />
      )}
      {rights && rights.severity !== 'ok' && height > 20 && (
        // Tuck the rights dot next to the lock when both are present; fall
        // back to the same slot when there's no lock.
        <span
          className={`absolute top-1 ${isLocked && height > 30 ? 'right-5' : 'right-1'} z-10`}
        >
          <RightsStatusBadge status={rights} />
        </span>
      )}
      {selectionMode && (
        <input
          type="checkbox"
          className="absolute top-1 left-1 z-10 cursor-pointer"
          checked={isSelected}
          onChange={() => onToggleSelect()}
          onClick={e => e.stopPropagation()}
        />
      )}
      <div className="px-1.5 py-0.5">
        <span
          className="block text-xs font-mono leading-none mb-0.5"
          style={{ color: col.text, opacity: 0.8 }}
        >
          {time}
        </span>
        <span
          className="block text-xs font-semibold leading-tight overflow-hidden"
          style={{
            color: col.text,
            display: '-webkit-box',
            WebkitLineClamp: height > 40 ? 2 : 1,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {sportIcon} {event.participants}
          {hasConflict && (
            <span
              className="inline-flex items-center ml-1"
              title={conflictTooltip}
              aria-label="conflict warning(s)"
            >
              ⚠️
            </span>
          )}
        </span>
        {height > 50 && (event.channel?.name || event.linearChannel) && (
          <span
            className="block text-xs font-mono uppercase tracking-wide leading-none mt-0.5"
            style={{ color: col.text, opacity: 0.65, fontSize: '10px' }}
          >
            {event.channel?.name || event.linearChannel}
          </span>
        )}
        {event.isLive && (
          <span className="inline-flex items-center gap-1 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
            <span className="text-danger font-mono" style={{ fontSize: '9px' }}>LIVE</span>
          </span>
        )}
        {event.status && event.status !== 'draft' && height > 40 && (
          <Badge variant={statusVariant(event.status)} className="mt-0.5" style={{ fontSize: '9px' }}>
            {event.status}
          </Badge>
        )}
        {/* Readiness dots */}
        {(() => {
          const r = readiness
          if (!r) return null
          if (height >= 50) {
            const failedChecks = r.checks.filter(c => c.status === 'fail')
            const tooltipText = failedChecks.length > 0
              ? `Missing: ${failedChecks.map(c => c.label).join(', ')}`
              : `Ready (${r.score}/${r.total})`
            return (
              <div className="flex gap-0.5 mt-auto pt-0.5" title={tooltipText}>
                {r.checks.map(c => (
                  <span
                    key={c.key}
                    className={`inline-block rounded-full ${
                      c.status === 'pass' ? 'bg-emerald-400'
                      : c.status === 'fail' ? 'bg-red-400'
                      : 'bg-zinc-500/30'
                    }`}
                    style={{ width: 5, height: 5 }}
                  />
                ))}
              </div>
            )
          }
          if (height >= 30) {
            const color = r.ready ? 'bg-emerald-400'
              : r.score === 0 ? 'bg-red-400'
              : 'bg-amber-400'
            return (
              <span
                className={`inline-block rounded-full mt-auto ${color}`}
                style={{ width: 5, height: 5 }}
                title={`Readiness: ${r.score}/${r.total}`}
              />
            )
          }
          return null
        })()}
      </div>
      {/* Resize handle — bottom 10px zone with ns-resize cursor */}
      {!isLocked && !selectionMode && height >= 20 && (
        <div
          className="absolute bottom-0 left-0 right-0 cursor-ns-resize"
          style={{ height: Math.min(10, height) }}
        />
      )}
    </div>
  )
})
