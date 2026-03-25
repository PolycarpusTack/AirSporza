import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Btn } from '../ui'
import { weekMonday, addDays, dateStr, timeToMinutes } from '../../utils/dateTime'
import type { Resource, ResourceAssignment } from '../../services/resources'
import type { Event, Sport } from '../../data/types'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ResourceTimelineProps {
  resources: Resource[]
  assignments: Record<number, ResourceAssignment[]>
  events: Event[]
  sports: Sport[]
}

type ViewMode = 'weekly' | 'daily'

interface Bar {
  assignmentId: number
  resourceId: number
  eventId: number
  eventName: string
  planType: string
  sportName: string
  quantity: number
  dateKey: string        // YYYY-MM-DD
  startMinutes: number   // minutes from midnight
  durationMinutes: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sportColor(sportName: string): { bg: string; border: string; text: string } {
  let hash = 0
  for (let i = 0; i < sportName.length; i++) {
    hash = sportName.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return {
    bg: `hsla(${hue}, 60%, 50%, 0.15)`,
    border: `hsla(${hue}, 60%, 50%, 0.6)`,
    text: `hsla(${hue}, 60%, 35%, 1)`,
  }
}

const CAL_START_HOUR = 8
const CAL_END_HOUR = 23
const CAL_TOTAL_MINUTES = (CAL_END_HOUR - CAL_START_HOUR) * 60
const DEFAULT_DURATION_HOURS = 3

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fmtShortDate(d: Date): string {
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`
}

function fmtFullDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ResourceTimeline({ resources, assignments, events, sports }: ResourceTimelineProps) {
  const [view, setView] = useState<ViewMode>('weekly')
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayOffset, setDayOffset] = useState(0)

  // Lookups
  const eventsById = useMemo(() => {
    const m = new Map<number, Event>()
    for (const e of events) m.set(e.id, e)
    return m
  }, [events])

  const sportsById = useMemo(() => {
    const m = new Map<number, Sport>()
    for (const s of sports) m.set(s.id, s)
    return m
  }, [sports])

  // Active resources only
  const activeResources = useMemo(() => resources.filter(r => r.isActive), [resources])

  // Build bars from assignments + events
  const allBars = useMemo(() => {
    const bars: Bar[] = []

    for (const resource of activeResources) {
      const ra = assignments[resource.id]
      if (!ra) continue

      for (const a of ra) {
        const ev = a.techPlan?.event
          ? eventsById.get(a.techPlan.event.id) ?? undefined
          : a.techPlan?.eventId
            ? eventsById.get(a.techPlan.eventId) ?? undefined
            : undefined

        if (!ev) continue

        const sport = sportsById.get(ev.sportId)
        const rawDate = ev.startDateBE?.toString() ?? ''
        const dk = rawDate.split('T')[0] // handle ISO or YYYY-MM-DD

        if (!dk) continue

        const startTime = ev.startTimeBE ?? '12:00'
        const startMin = timeToMinutes(startTime)
        const durHours = ev.duration ? parseFloat(ev.duration) : DEFAULT_DURATION_HOURS
        const durMin = Math.max(durHours * 60, 30)

        bars.push({
          assignmentId: a.id,
          resourceId: resource.id,
          eventId: ev.id,
          eventName: ev.participants,
          planType: a.techPlan?.planType ?? '',
          sportName: sport?.name ?? 'Unknown',
          quantity: a.quantity,
          dateKey: dk,
          startMinutes: startMin,
          durationMinutes: durMin,
        })
      }
    }

    return bars
  }, [activeResources, assignments, eventsById, sportsById])

  // Bars grouped by resource
  const barsByResource = useMemo(() => {
    const map = new Map<number, Bar[]>()
    for (const b of allBars) {
      if (!map.has(b.resourceId)) map.set(b.resourceId, [])
      map.get(b.resourceId)!.push(b)
    }
    return map
  }, [allBars])

  // Navigation
  const monday = weekMonday(weekOffset)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const todayKey = dateStr(new Date())

  const dailyDate = addDays(new Date(), dayOffset)
  dailyDate.setHours(0, 0, 0, 0)
  const dailyKey = dateStr(dailyDate)

  const weekLabel = `${fmtShortDate(weekDays[0])} \u2013 ${fmtShortDate(weekDays[6])} ${weekDays[6].getFullYear()}`
  const dayLabel = fmtFullDate(dailyDate)

  // Usage per resource per day
  const usageMap = useMemo(() => {
    const map = new Map<string, number>() // `${resourceId}:${dateKey}` -> total quantity
    for (const b of allBars) {
      const key = `${b.resourceId}:${b.dateKey}`
      map.set(key, (map.get(key) ?? 0) + b.quantity)
    }
    return map
  }, [allBars])

  function getUsage(resourceId: number, dk: string): number {
    return usageMap.get(`${resourceId}:${dk}`) ?? 0
  }

  // Hours for daily view
  const hours = Array.from({ length: CAL_END_HOUR - CAL_START_HOUR }, (_, i) => CAL_START_HOUR + i)

  if (activeResources.length === 0) {
    return <div className="card p-8 text-center text-text-3 text-sm">No active resources</div>
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Btn
            size="sm"
            variant={view === 'weekly' ? 'primary' : 'ghost'}
            onClick={() => setView('weekly')}
          >
            Weekly
          </Btn>
          <Btn
            size="sm"
            variant={view === 'daily' ? 'primary' : 'ghost'}
            onClick={() => setView('daily')}
          >
            Daily
          </Btn>
        </div>

        <div className="flex items-center gap-2">
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => view === 'weekly' ? setWeekOffset(p => p - 1) : setDayOffset(p => p - 1)}
          >
            <ChevronLeft size={16} />
          </Btn>
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => view === 'weekly' ? setWeekOffset(0) : setDayOffset(0)}
          >
            Today
          </Btn>
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => view === 'weekly' ? setWeekOffset(p => p + 1) : setDayOffset(p => p + 1)}
          >
            <ChevronRight size={16} />
          </Btn>
          <span className="text-sm font-semibold text-text-2 ml-2 min-w-[200px]">
            {view === 'weekly' ? weekLabel : dayLabel}
          </span>
        </div>
      </div>

      {/* Timeline */}
      {view === 'weekly' ? (
        <WeeklyView
          resources={activeResources}
          barsByResource={barsByResource}
          weekDays={weekDays}
          todayKey={todayKey}
          getUsage={getUsage}
        />
      ) : (
        <DailyView
          resources={activeResources}
          barsByResource={barsByResource}
          dailyKey={dailyKey}
          todayKey={todayKey}
          hours={hours}
          getUsage={getUsage}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Weekly View                                                        */
/* ------------------------------------------------------------------ */

interface WeeklyViewProps {
  resources: Resource[]
  barsByResource: Map<number, Bar[]>
  weekDays: Date[]
  todayKey: string
  getUsage: (resourceId: number, dk: string) => number
}

function WeeklyView({ resources, barsByResource, weekDays, todayKey, getUsage }: WeeklyViewProps) {
  const weekKeys = weekDays.map(dateStr)

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted sticky left-0 bg-surface-2 z-10 min-w-[140px]">
              Resource
            </th>
            {weekDays.map((d, i) => {
              const dk = weekKeys[i]
              const isToday = dk === todayKey
              return (
                <th
                  key={dk}
                  className={`px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-muted min-w-[120px] ${isToday ? 'bg-primary/5' : ''}`}
                >
                  <div>{DAY_NAMES[i]}</div>
                  <div className="font-normal text-text-3 normal-case">{d.getDate()}/{d.getMonth() + 1}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {resources.map(r => {
            const bars = barsByResource.get(r.id) ?? []
            return (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 sticky left-0 bg-surface z-10 border-r border-border/40">
                  <div className="font-semibold text-xs">{r.name}</div>
                  <div className="text-[10px] text-text-3">Cap: {r.capacity}</div>
                </td>
                {weekKeys.map((dk, i) => {
                  const isToday = dk === todayKey
                  const dayBars = bars.filter(b => b.dateKey === dk)
                  const usage = getUsage(r.id, dk)
                  const isOver = r.capacity > 0 && usage > r.capacity

                  return (
                    <td
                      key={dk + i}
                      className={`px-1 py-1 min-h-[40px] ${isToday ? 'bg-primary/5' : ''} ${isOver ? 'bg-danger/5' : ''}`}
                    >
                      {isOver && (
                        <div className="text-[10px] text-danger font-semibold text-right mb-0.5">
                          {usage}/{r.capacity}
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {dayBars.map(bar => {
                          const colors = sportColor(bar.sportName)
                          return (
                            <div
                              key={bar.assignmentId}
                              className="rounded px-1.5 py-0.5 text-[10px] leading-tight truncate cursor-default"
                              style={{
                                backgroundColor: colors.bg,
                                borderLeft: `3px solid ${colors.border}`,
                                color: colors.text,
                              }}
                              title={`${bar.eventName}\n${bar.planType} \u00b7 ${bar.sportName}${bar.quantity > 1 ? ` \u00b7 \u00d7${bar.quantity}` : ''}`}
                            >
                              <div className="font-semibold truncate">{bar.eventName}</div>
                              <div className="truncate opacity-75">{bar.planType}</div>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Daily View                                                         */
/* ------------------------------------------------------------------ */

interface DailyViewProps {
  resources: Resource[]
  barsByResource: Map<number, Bar[]>
  dailyKey: string
  todayKey: string
  hours: number[]
  getUsage: (resourceId: number, dk: string) => number
}

const BAR_HEIGHT = 28
const ROW_PADDING = 8

function DailyView({ resources, barsByResource, dailyKey, todayKey, hours, getUsage }: DailyViewProps) {
  const isToday = dailyKey === todayKey

  return (
    <div className={`card overflow-x-auto ${isToday ? 'ring-1 ring-primary/20' : ''}`}>
      <div className="min-w-[900px]">
        {/* Hour header */}
        <div className="flex border-b border-border bg-surface-2">
          <div className="min-w-[140px] px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted sticky left-0 bg-surface-2 z-10 border-r border-border/40">
            Resource
          </div>
          <div className="flex-1 relative flex">
            {hours.map(h => (
              <div
                key={h}
                className="text-[10px] text-text-3 text-center border-l border-border/30"
                style={{ width: `${100 / hours.length}%` }}
              >
                {h}:00
              </div>
            ))}
          </div>
        </div>

        {/* Resource rows */}
        {resources.map(r => {
          const bars = (barsByResource.get(r.id) ?? []).filter(b => b.dateKey === dailyKey)
          const usage = getUsage(r.id, dailyKey)
          const isOver = r.capacity > 0 && usage > r.capacity
          const rowHeight = Math.max(BAR_HEIGHT + ROW_PADDING * 2, bars.length * (BAR_HEIGHT + 2) + ROW_PADDING * 2)

          // Capacity line position (fraction of row height)
          const capacityY = r.capacity > 0 && bars.length > 0
            ? Math.min(r.capacity * (BAR_HEIGHT + 2) + ROW_PADDING, rowHeight)
            : null

          return (
            <div
              key={r.id}
              className={`flex border-b border-border/60 ${isOver ? 'bg-danger/5' : ''}`}
              style={{ minHeight: `${rowHeight}px` }}
            >
              {/* Resource label */}
              <div className="min-w-[140px] px-3 py-2 sticky left-0 bg-surface z-10 border-r border-border/40 flex flex-col justify-center">
                <div className="font-semibold text-xs">{r.name}</div>
                <div className="text-[10px] text-text-3">
                  Cap: {r.capacity}
                  {isOver && <span className="text-danger ml-1">({usage} used)</span>}
                </div>
              </div>

              {/* Timeline area */}
              <div className="flex-1 relative">
                {/* Hour grid lines */}
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-l border-border/30"
                    style={{ left: `${((h - CAL_START_HOUR) / hours.length) * 100}%` }}
                  />
                ))}

                {/* Capacity line */}
                {capacityY !== null && (
                  <div
                    className="absolute left-0 right-0 border-t-2 border-dashed border-warning/50 z-[1]"
                    style={{ top: `${capacityY}px` }}
                    title={`Capacity: ${r.capacity}`}
                  />
                )}

                {/* Bars */}
                {bars.map((bar, idx) => {
                  const startOffset = Math.max(bar.startMinutes - CAL_START_HOUR * 60, 0)
                  const leftPct = (startOffset / CAL_TOTAL_MINUTES) * 100
                  const widthPct = Math.min(
                    (bar.durationMinutes / CAL_TOTAL_MINUTES) * 100,
                    100 - leftPct
                  )
                  const colors = sportColor(bar.sportName)

                  return (
                    <div
                      key={bar.assignmentId}
                      className="absolute rounded px-1.5 text-[10px] leading-tight flex items-center gap-1 truncate cursor-default z-[2]"
                      style={{
                        left: `${leftPct}%`,
                        width: `${Math.max(widthPct, 2)}%`,
                        top: `${ROW_PADDING + idx * (BAR_HEIGHT + 2)}px`,
                        height: `${BAR_HEIGHT}px`,
                        backgroundColor: colors.bg,
                        borderLeft: `3px solid ${colors.border}`,
                        color: colors.text,
                      }}
                      title={`${bar.eventName}\n${bar.planType} \u00b7 ${bar.sportName}${bar.quantity > 1 ? ` \u00b7 \u00d7${bar.quantity}` : ''}`}
                    >
                      <span className="font-semibold truncate">{bar.eventName}</span>
                      <span className="opacity-75 truncate hidden sm:inline">{bar.planType}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
