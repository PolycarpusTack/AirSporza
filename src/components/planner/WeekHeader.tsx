import React from 'react'
import { dateStr } from '../../utils/dateTime'
import { DAY_NAMES } from '../../utils/calendarLayout'

interface WeekHeaderProps {
  weekDays: Date[]
  todayStr: string
  eventsByDay: Event_[][]  // event counts per day
  headerSelectedIndices: number[] | null
  headerSelectedStyle: React.CSSProperties | undefined
  onHeaderPointerDown: (index: number, e: React.PointerEvent) => void
  onHeaderPointerMove: (index: number) => void
  onHeaderPointerUp: () => void
}

// We only need .length from the events array, so accept any array
type Event_ = unknown

export const WeekHeader = React.memo(function WeekHeader({
  weekDays,
  todayStr,
  eventsByDay,
  headerSelectedIndices,
  headerSelectedStyle,
  onHeaderPointerDown,
  onHeaderPointerMove,
  onHeaderPointerUp,
}: WeekHeaderProps) {
  return (
    <>
      <div className="bg-surface-2 border-b border-border" />
      {weekDays.map((day, i) => {
        const ds = dateStr(day)
        const isToday = ds === todayStr
        const dayEvCount = eventsByDay[i].length
        const isSelected = headerSelectedIndices?.includes(i) ?? false
        return (
          <div
            key={ds}
            className={`bg-surface-2 border-b border-border border-l border-l-border px-2 py-2 text-center select-none ${
              isSelected ? 'ring-2 ring-primary ring-inset' : ''
            }`}
            style={isSelected ? headerSelectedStyle : undefined}
            onPointerDown={(e) => onHeaderPointerDown(i, e)}
            onPointerMove={() => onHeaderPointerMove(i)}
            onPointerUp={() => onHeaderPointerUp()}
          >
            <span className={`block text-xs font-mono font-semibold uppercase tracking-wider ${isToday ? 'text-primary' : 'text-text-3'}`}>
              {DAY_NAMES[i]}
            </span>
            <span className={`block text-lg font-bold font-head leading-tight ${isToday ? 'text-primary' : 'text-text-2'}`}>
              {day.getDate()}
            </span>
            {dayEvCount > 0 && (
              <span className="text-xs text-text-3 font-mono">{dayEvCount}ev</span>
            )}
          </div>
        )
      })}
    </>
  )
})
