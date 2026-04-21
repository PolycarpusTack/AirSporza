import React, { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Event, Contract, FieldConfig } from '../../data/types'
import { dateStr, getDateKey, timeToMinutes, parseDurationMin } from '../../utils/dateTime'
import {
  CAL_START_HOUR, CAL_END_HOUR, PX_PER_HOUR, CAL_HEIGHT,
  eventTopPx, eventHeightPx, computeOverlapLayout,
} from '../../utils/calendarLayout'
import { isEventLocked } from '../../utils/eventLock'
import { computeReadiness, type ReadinessResult } from '../../utils/eventReadiness'
import { useRightsCheck } from '../../hooks/useRightsCheck'
import { useApp } from '../../context/AppProvider'
import type { ConflictWarning } from '../../services/events'
import { useDrawToCreate, minutesToTime } from '../../hooks/useDrawToCreate'
import { useHeaderDrag } from '../../hooks/useHeaderDrag'
import { useVerticalDrag, type VerticalDragResult } from '../../hooks/useVerticalDrag'
import { TimeGutter } from './TimeGutter'
import { WeekHeader } from './WeekHeader'
import { EventCard, DraggableEventCard } from './EventCard'

// ── DroppableDayColumn (only used inside CalendarGrid) ───────────────────────

function DroppableDayColumn({ date, children }: { date: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: date })
  return (
    <div ref={setNodeRef} className={isOver ? 'ring-2 ring-blue-400 rounded' : ''}>
      {children}
    </div>
  )
}

// ── CalendarGrid Props ───────────────────────────────────────────────────────

export interface CalendarGridProps {
  weekDays: Date[]
  todayStr: string
  events: Event[]
  onEventClick?: (event: Event) => void
  getChannelColor: (channelId?: number | null) => { border: string; bg: string; text: string }
  conflictMap: Record<number, ConflictWarning[]>
  selectionMode: boolean
  selectedIds: Set<number>
  onToggleSelect: (id: number) => void
  onDrawCreate?: (result: { date: string; startTime: string; durationMinutes: number }) => void
  onMultiDayCreate?: (result: { dates: string[]; startTime: string; durationMinutes: number }) => void
  onEventContextMenu?: (e: React.MouseEvent, event: Event, date: string, time: string) => void
  onSlotContextMenu?: (e: React.MouseEvent, date: string, time: string) => void
  onVerticalDragComplete?: (result: VerticalDragResult) => void
  freezeWindowHours: number
  userRole?: string
  contracts: Contract[]
  crewFields: FieldConfig[]
}

// ── CalendarGrid ─────────────────────────────────────────────────────────────

export function CalendarGrid({ weekDays, todayStr, events, onEventClick, getChannelColor, conflictMap, selectionMode, selectedIds, onToggleSelect, onDrawCreate, onMultiDayCreate, onEventContextMenu, onSlotContextMenu, onVerticalDragComplete, freezeWindowHours, userRole, contracts, crewFields }: CalendarGridProps) {
  const { sports, techPlans } = useApp()

  const headerDrag = useHeaderDrag(weekDays, dateStr)

  const drawToCreate = useDrawToCreate({
    calStartHour: CAL_START_HOUR,
    pxPerHour: PX_PER_HOUR,
    enabled: !selectionMode && !!onDrawCreate,
  })

  const verticalDrag = useVerticalDrag({
    enabled: !selectionMode,
    calStartHour: CAL_START_HOUR,
    calEndHour: CAL_END_HOUR,
    pxPerHour: PX_PER_HOUR,
    isLocked: (eventId) => {
      const ev = events.find(e => e.id === eventId)
      return ev ? isEventLocked(ev, freezeWindowHours, userRole).locked : true
    },
    onComplete: (result) => onVerticalDragComplete?.(result),
  })

  // Escape cancels header drag selection
  useEffect(() => {
    if (!headerDrag.headerState) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') headerDrag.cancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [headerDrag.headerState, headerDrag.cancel])

  const sportsMap = useMemo(() => new Map(sports.map(s => [s.id, s])), [sports])

  // Readiness map for all events in this grid
  const readinessMap = useMemo(() => {
    const map = new Map<number, ReadinessResult>()
    for (const ev of events) {
      map.set(ev.id, computeReadiness(ev, techPlans, contracts, crewFields))
    }
    return map
  }, [events, techPlans, contracts, crewFields])

  // Rights-check map. Batched + debounced by the hook so we hit
  // /api/rights/check/batch at most once per quiet period. Absence of an
  // entry means "not yet fetched" and the card renders no badge.
  const eventIds = useMemo(() => events.map(e => e.id), [events])
  const rightsMap = useRightsCheck(eventIds)

  // Current time indicator
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  })
  useEffect(() => {
    const tick = setInterval(() => {
      const n = new Date()
      setNowMinutes(n.getHours() * 60 + n.getMinutes())
    }, 60_000)
    return () => clearInterval(tick)
  }, [])

  const eventsByDay = useMemo(
    () => weekDays.map(day => {
      const ds = dateStr(day)
      return events
        .filter(e => getDateKey(e.startDateBE) === ds)
        .sort((a, b) => a.startTimeBE.localeCompare(b.startTimeBE))
    }),
    [weekDays, events]
  )

  const overlapLayouts = useMemo(
    () => eventsByDay.map(dayEvs => computeOverlapLayout(dayEvs)),
    [eventsByDay]
  )

  // Pre-compute header selection style
  const headerSelectedIndices = headerDrag.headerState?.selectedIndices ?? null
  const headerSelectedStyle: React.CSSProperties | undefined = headerSelectedIndices
    ? { background: 'rgba(225,6,0,0.08)' }
    : undefined

  return (
    <div
      className="card overflow-hidden relative"
      style={{ display: 'grid', gridTemplateColumns: `42px repeat(7, 1fr)` }}
    >
      {/* Multi-day selection badge */}
      {headerDrag.headerState && !headerDrag.headerState.active && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 bg-primary text-black text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-fade-in">
          {headerDrag.headerState.selectedDates.length} days selected — draw a time block
        </div>
      )}

      {/* Header row */}
      <WeekHeader
        weekDays={weekDays}
        todayStr={todayStr}
        eventsByDay={eventsByDay}
        headerSelectedIndices={headerSelectedIndices}
        headerSelectedStyle={headerSelectedStyle}
        onHeaderPointerDown={headerDrag.onHeaderPointerDown}
        onHeaderPointerMove={headerDrag.onHeaderPointerMove}
        onHeaderPointerUp={headerDrag.onHeaderPointerUp}
      />

      {/* Body: time column + day columns */}
      <TimeGutter />

      {/* Day columns */}
      {weekDays.map((day, dayIdx) => {
        const ds = dateStr(day)
        const isToday = ds === todayStr
        const dayEvs = eventsByDay[dayIdx]
        const overlapLayout = overlapLayouts[dayIdx]

        // Current time indicator position
        const nowTopPx = isToday
          ? (nowMinutes - CAL_START_HOUR * 60) * (PX_PER_HOUR / 60)
          : -1

        return (
          <DroppableDayColumn key={ds} date={ds}>
            <div
              className="relative border-l border-border"
              style={{
                height: CAL_HEIGHT,
                background: isToday ? 'rgba(245,158,11,0.02)' : undefined,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX_PER_HOUR - 1}px, rgba(255,255,255,0.025) ${PX_PER_HOUR - 1}px, rgba(255,255,255,0.025) ${PX_PER_HOUR}px)`,
              }}
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('[data-event-card]')) return
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const yOffset = e.clientY - rect.top
                const minutes = CAL_START_HOUR * 60 + (yOffset / PX_PER_HOUR) * 60
                const h = Math.floor(minutes / 60)
                const m = Math.round((minutes % 60) / 5) * 5
                const time = `${String(h).padStart(2,'0')}:${String(m >= 60 ? 0 : m).padStart(2,'0')}`
                onDrawCreate?.({ date: ds, startTime: time, durationMinutes: 90 })
              }}
              onContextMenu={(e) => {
                if ((e.target as HTMLElement).closest('[data-event-card]')) return
                e.preventDefault()
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const yOffset = e.clientY - rect.top
                const minutes = CAL_START_HOUR * 60 + (yOffset / PX_PER_HOUR) * 60
                const h = Math.floor(minutes / 60)
                const m = Math.round((minutes % 60) / 5) * 5
                const time = `${String(h).padStart(2,'0')}:${String(m >= 60 ? 0 : m).padStart(2,'0')}`
                onSlotContextMenu?.(e, ds, time)
              }}
              onPointerDown={(e) => drawToCreate.onPointerDown(ds, e)}
              onPointerMove={(e) => {
                drawToCreate.onPointerMove(e)
                verticalDrag.onPointerMove(e)
              }}
              onPointerUp={() => {
                verticalDrag.onPointerUp()
                const result = drawToCreate.onPointerUp()
                if (!result) return
                if (headerDrag.headerState && !headerDrag.headerState.active) {
                  // Multi-day mode: apply drawn time to all selected days
                  const dates = headerDrag.confirm()
                  if (dates.length > 0) {
                    onMultiDayCreate?.({ dates, startTime: result.startTime, durationMinutes: result.durationMinutes })
                  }
                } else {
                  onDrawCreate?.(result)
                }
              }}
            >
              {/* Current time indicator */}
              {isToday && nowTopPx >= 0 && nowTopPx <= CAL_HEIGHT && (
                <div
                  className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
                  style={{ top: nowTopPx }}
                >
                  <div className="w-2 h-2 rounded-full bg-danger flex-shrink-0 -ml-1" />
                  <div className="flex-1 border-t border-danger" />
                </div>
              )}

              {drawToCreate.draw && drawToCreate.draw.date === ds && drawToCreate.draw.active && (() => {
                const topPx = (drawToCreate.draw.startMin - CAL_START_HOUR * 60) * (PX_PER_HOUR / 60)
                const heightPx = (drawToCreate.draw.endMin - drawToCreate.draw.startMin) * (PX_PER_HOUR / 60)
                const label = `${minutesToTime(drawToCreate.draw.startMin)} – ${minutesToTime(drawToCreate.draw.endMin)}`
                return (
                  <div
                    className="absolute left-1 right-1 rounded bg-primary/20 border-2 border-primary/50 pointer-events-none z-20 flex items-start justify-center"
                    style={{ top: topPx, height: Math.max(heightPx, 2) }}
                  >
                    {heightPx > 15 && (
                      <span className="text-xs font-mono text-primary bg-surface/80 rounded px-1 mt-1">
                        {label}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Vertical drag ghost preview */}
              {verticalDrag.state && verticalDrag.state.date === ds && (() => {
                const vd = verticalDrag.state
                const ghostTop = (vd.startMin - CAL_START_HOUR * 60) * (PX_PER_HOUR / 60)
                const ghostHeight = (vd.endMin - vd.startMin) * (PX_PER_HOUR / 60)
                const timeLabel = `${minutesToTime(vd.startMin)} – ${minutesToTime(vd.endMin)}`
                const durMin = vd.endMin - vd.startMin
                const durH = Math.floor(durMin / 60)
                const durM = durMin % 60
                const durLabel = durH > 0 ? `${durH}h ${durM}m` : `${durM}m`
                return (
                  <div
                    className="absolute left-1 right-1 rounded bg-primary/15 border border-primary/40 pointer-events-none z-20 flex flex-col items-center justify-center"
                    style={{ top: ghostTop, height: Math.max(ghostHeight, 2) }}
                  >
                    {ghostHeight > 15 && (
                      <span className="text-xs font-mono text-primary bg-surface/80 rounded px-1">
                        {vd.mode === 'move' ? timeLabel : durLabel}
                      </span>
                    )}
                  </div>
                )
              })()}

              {dayEvs.map(ev => {
                const time = ev.linearStartTime || ev.startTimeBE
                const top = eventTopPx(time)
                const durationMin = parseDurationMin(ev.duration)
                const height = eventHeightPx(durationMin)
                const col = getChannelColor(ev.channelId)
                const sp = sportsMap.get(ev.sportId)
                const layout = overlapLayout.get(ev.id) ?? { col: 0, totalCols: 1 }
                const evLock = isEventLocked(ev, freezeWindowHours, userRole)
                const startMinutes = timeToMinutes(time)

                // Skip events outside the visible range
                if (top >= CAL_HEIGHT) return null

                const widthPct = 100 / layout.totalCols
                const leftPct = layout.col * widthPct
                const cardH = Math.min(height, CAL_HEIGHT - top)

                const conflicts = conflictMap[ev.id]
                const hasConflict = (conflicts?.length ?? 0) > 0

                const cardStyle: React.CSSProperties = {
                  top,
                  height: cardH,
                  left: `calc(${leftPct}% + 2px)`,
                  width: `calc(${widthPct}% - 4px)`,
                  background: evLock.locked && cardH <= 30 ? `color-mix(in srgb, ${col.bg} 90%, var(--color-warning) 10%)` : col.bg,
                  backgroundImage: evLock.locked ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(245,158,11,0.08) 3px, rgba(245,158,11,0.08) 6px)' : undefined,
                  borderLeft: evLock.locked ? '3px solid var(--color-warning, #F59E0B)' : `3px solid ${col.border}`,
                }

                const card = (
                  <EventCard
                    event={ev}
                    style={cardStyle}
                    channelColor={col}
                    sportName={sp?.name ?? ''}
                    sportIcon={sp?.icon}
                    isSelected={selectedIds.has(ev.id)}
                    isLocked={evLock.locked}
                    hasConflict={hasConflict}
                    conflictTooltip={hasConflict ? conflicts!.map(w => w.message).join('\n') : undefined}
                    readiness={readinessMap.get(ev.id)}
                    rights={rightsMap[ev.id]}
                    selectionMode={selectionMode}
                    cardHeight={cardH}
                    onClick={() => selectionMode ? onToggleSelect(ev.id) : onEventClick?.(ev)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const evTime = ev.linearStartTime || ev.startTimeBE
                      onEventContextMenu?.(e, ev, ds, evTime)
                    }}
                    onToggleSelect={() => onToggleSelect(ev.id)}
                    onPointerDown={(e) => verticalDrag.onPointerDown(e, ev.id, startMinutes, durationMin, ds)}
                  />
                )

                return selectionMode ? (
                  <div key={ev.id}>{card}</div>
                ) : (
                  <DraggableEventCard key={ev.id} event={ev} locked={evLock.locked}>
                    {card}
                  </DraggableEventCard>
                )
              })}
            </div>
          </DroppableDayColumn>
        )
      })}
    </div>
  )
}
