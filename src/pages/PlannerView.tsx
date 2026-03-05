import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react'
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '../components/ui'
import type { Event, DashboardWidget, Contract, EventStatus, BadgeVariant } from '../data/types'
import { CONTRACTS } from '../data'
import { dayLabel } from '../utils'
import { useSocket } from '../hooks'
import { useApp } from '../context/AppProvider'
import { contractsApi } from '../services/contracts'
import { eventsApi, type ConflictWarning } from '../services'
import { savedViewsApi, type SavedView } from '../services/savedViews'
import { useToast } from '../components/Toast'

interface PlannerViewProps {
  events: Event[]
  widgets: DashboardWidget[]
  loading?: boolean
  onEventClick?: (event: Event) => void
}

// ── Week helpers ─────────────────────────────────────────────────────────────

function weekMonday(offsetWeeks = 0): Date {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offsetWeeks * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getDateKey(date: Date | string): string {
  return typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0]
}

// ── Calendar helpers ─────────────────────────────────────────────────────────

const CAL_START_HOUR = 8   // 08:00
const CAL_END_HOUR   = 23  // 23:00
const CAL_HOURS      = CAL_END_HOUR - CAL_START_HOUR  // 15
const PX_PER_HOUR    = 60
const CAL_HEIGHT     = CAL_HOURS * PX_PER_HOUR        // 900

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function parseDurationMin(duration?: string | null): number {
  if (!duration) return 90
  const n = Number(duration)
  if (!isNaN(n) && n > 0) return n
  // SMPTE timecode: HH:MM:SS;FF or HH:MM:SS:FF
  const smpte = duration.match(/^(\d{1,2}):(\d{2}):(\d{2})[;:](\d{2})$/)
  if (smpte) return Number(smpte[1]) * 60 + Number(smpte[2])
  const match = duration.match(/(\d+)h\s*(\d+)?m?/)
  if (match) return Number(match[1]) * 60 + Number(match[2] || 0)
  return 90
}

function eventTopPx(time: string): number {
  const mins = timeToMinutes(time)
  const calStartMin = CAL_START_HOUR * 60
  return Math.max(0, (mins - calStartMin) * (PX_PER_HOUR / 60))
}

function eventHeightPx(durationMin: number): number {
  return Math.max(20, durationMin * (PX_PER_HOUR / 60))
}

const FALLBACK_COLOR = { border: '#4B5563', bg: 'rgba(75,85,99,0.1)', text: '#9CA3AF' }

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

function hexToChannelColor(hex: string): { border: string; bg: string; text: string } {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return FALLBACK_COLOR
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Lighten by ~35% for text
  const lr = Math.round(r + (255 - r) * 0.35).toString(16).padStart(2, '0')
  const lg = Math.round(g + (255 - g) * 0.35).toString(16).padStart(2, '0')
  const lb = Math.round(b + (255 - b) * 0.35).toString(16).padStart(2, '0')
  return { border: hex, bg: `rgba(${r},${g},${b},0.1)`, text: `#${lr}${lg}${lb}` }
}

function buildColorMap(channels: { name: string; color: string }[]): Record<string, { border: string; bg: string; text: string }> {
  const map: Record<string, { border: string; bg: string; text: string }> = {}
  for (const ch of channels) {
    map[ch.name] = hexToChannelColor(ch.color)
  }
  return map
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card p-4 animate-pulse mb-3">
      <div className="h-2.5 bg-surface-2 rounded w-3/4 mb-3" />
      <div className="h-3 bg-surface-2 rounded w-1/2 mb-2" />
      <div className="h-2 bg-surface-2 rounded w-1/3" />
    </div>
  )
}

// ── Drag-and-drop wrappers ────────────────────────────────────────────────────

function DraggableEventCard({ event, children }: { event: Event; children: ReactNode }) {
  const disabled = event.status === 'completed' || event.status === 'cancelled'
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

function DroppableDayColumn({ date, children }: { date: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: date })
  return (
    <div ref={setNodeRef} className={isOver ? 'ring-2 ring-blue-400 rounded' : ''}>
      {children}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function PlannerView({ events, widgets, loading, onEventClick }: PlannerViewProps) {
  const [channelFilter, setChannelFilter] = useState('all')
  const [weekOffset, setWeekOffset] = useState(0)
  const [realtimeEvents, setRealtimeEvents] = useState<Event[]>(events)
  const [calendarMode, setCalendarMode] = useState(true)
  const [contracts, setContracts] = useState<Contract[]>(CONTRACTS)
  const [conflictMap, setConflictMap] = useState<Record<number, ConflictWarning[]>>({})

  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [saveViewName, setSaveViewName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const { sports, competitions, orgConfig, setEvents } = useApp()
  const toast = useToast()
  const { on } = useSocket()

  useEffect(() => {
    savedViewsApi.list('planner').then(setSavedViews).catch(() => {})
  }, [])

  const handleSaveView = async () => {
    if (!saveViewName.trim()) return
    try {
      const view = await savedViewsApi.create(saveViewName.trim(), 'planner', { channelFilter })
      setSavedViews(prev => [...prev, view])
      setSaveViewName('')
      setShowSaveInput(false)
    } catch {
      toast.error('Failed to save view')
    }
  }

  const handleLoadView = (view: SavedView) => {
    const fs = view.filterState as { channelFilter?: string }
    if (fs.channelFilter) setChannelFilter(fs.channelFilter)
  }

  const handleDeleteView = async (id: string) => {
    try {
      await savedViewsApi.delete(id)
      setSavedViews(prev => prev.filter(v => v.id !== id))
    } catch {
      toast.error('Failed to delete view')
    }
  }

  const channelColorMap = useMemo(() => buildColorMap(orgConfig.channels), [orgConfig.channels])
  const getChannelColor = useCallback(
    (channel?: string | null) => channel ? (channelColorMap[channel] ?? FALLBACK_COLOR) : FALLBACK_COLOR,
    [channelColorMap]
  )

  // Load contracts from API
  useEffect(() => {
    contractsApi.list().then(data => setContracts(data as Contract[])).catch(() => {})
  }, [])

  useEffect(() => { setRealtimeEvents(events) }, [events])

  useEffect(() => {
    const unsubCreated = on('event:created', (event: Event) => {
      setRealtimeEvents(prev => [...prev, event])
    })
    const unsubUpdated = on('event:updated', (event: Event) => {
      setRealtimeEvents(prev => prev.map(e => e.id === event.id ? event : e))
    })
    const unsubDeleted = on('event:deleted', ({ id }: { id: number }) => {
      setRealtimeEvents(prev => prev.filter(e => e.id !== id))
    })
    return () => { unsubCreated(); unsubUpdated(); unsubDeleted() }
  }, [on])

  // Keyboard navigation for week
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft')  setWeekOffset(o => o - 1)
      if (e.key === 'ArrowRight') setWeekOffset(o => o + 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const monday = weekMonday(weekOffset)
  const sunday = addDays(monday, 6)
  const weekFromStr = dateStr(monday)
  const weekToStr   = dateStr(sunday)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const todayStr = dateStr(new Date())

  const weekLabel = (() => {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
    return `${monday.toLocaleDateString('en-GB', opts)} – ${sunday.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })}`
  })()

  // Memoised lookup Maps for performance
  const sportsMap = useMemo(() => new Map(sports.map(s => [s.id, s])), [sports])
  const compsMap  = useMemo(() => new Map(competitions.map(c => [c.id, c])), [competitions])
  const contractsByCompId = useMemo(
    () => new Map(contracts.map(c => [c.competitionId, c])),
    [contracts]
  )

  const weekEvents = useMemo(
    () => realtimeEvents.filter(e => {
      const k = getDateKey(e.startDateBE)
      return k >= weekFromStr && k <= weekToStr
    }),
    [realtimeEvents, weekFromStr, weekToStr]
  )

  // Fetch conflicts for visible week events
  useEffect(() => {
    if (weekEvents.length === 0) {
      setConflictMap({})
      return
    }
    const ids = weekEvents.map(e => e.id)
    eventsApi.checkBulkConflicts(ids)
      .then(map => setConflictMap(map))
      .catch(() => {})
  }, [weekFromStr, weekToStr, weekEvents.length])

  const filteredWeekEvents = useMemo(
    () => channelFilter === 'all' ? weekEvents : weekEvents.filter(e => e.linearChannel === channelFilter),
    [weekEvents, channelFilter]
  )

  // Only show live events happening today
  const liveNow = realtimeEvents.filter(e => e.isLive && getDateKey(e.startDateBE) === todayStr)

  const getContract = useCallback(
    (e: Event) => contractsByCompId.get(e.competitionId),
    [contractsByCompId]
  )

  // Group by date for list mode fallback
  const grouped = useMemo(() => {
    const byDate: Record<string, Event[]> = {}
    filteredWeekEvents.forEach(e => {
      const dateKey = getDateKey(e.startDateBE)
      if (!byDate[dateKey]) byDate[dateKey] = []
      byDate[dateKey].push(e)
    })
    Object.values(byDate).forEach(a => a.sort((a, b) => a.startTimeBE.localeCompare(b.startTimeBE)))
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredWeekEvents])

  const handleDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
    if (!over) return
    const eventId = Number(active.id)
    const newDate = over.id as string
    const event = realtimeEvents.find(e => e.id === eventId)
    if (!event) return
    const currentDateStr = typeof event.startDateBE === 'string'
      ? event.startDateBE.slice(0, 10)
      : (event.startDateBE as Date).toISOString().slice(0, 10)
    if (newDate === currentDateStr) return  // same day, no-op
    const snapshot = event.startDateBE
    // Optimistic: update local display only
    setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
    try {
      await eventsApi.update(eventId, { ...event, startDateBE: newDate })
      // Confirm: update global context after API success
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
    } catch {
      // Revert local only
      setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: snapshot } : e))
      toast.error('Failed to reschedule event')
    }
  }, [realtimeEvents, setEvents, toast])

  const visWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order)
  const showSidePanels = visWidgets.filter(w => w.id !== 'channelTimeline')
  const showTimeline = visWidgets.find(w => w.id === 'channelTimeline')

  // Event counts per channel (for filter chips)
  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    weekEvents.forEach(e => {
      if (e.linearChannel) counts[e.linearChannel] = (counts[e.linearChannel] ?? 0) + 1
    })
    return counts
  }, [weekEvents])

  const renderSideWidget = (widget: DashboardWidget) => {
    switch (widget.id) {
      case 'liveNow':
        return (
          <div key={widget.id} className="card p-4 animate-fade-in">
            <h4 className="text-xs font-bold text-text-3 uppercase tracking-wider mb-3">Live / Upcoming</h4>
            <div className="space-y-2">
              {liveNow.slice(0, 4).map(e => {
                const sp = sportsMap.get(e.sportId)
                return (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <span>{sp?.icon}</span>
                    <span className="font-medium truncate">{e.participants}</span>
                    <span className="ml-auto font-mono text-xs text-text-3">{e.startTimeBE}</span>
                  </div>
                )
              })}
              {liveNow.length === 0 && <div className="text-sm text-text-3">No live events</div>}
            </div>
          </div>
        )

      case 'maxConditions':
        return (
          <div key={widget.id} className="card p-4 animate-fade-in">
            <h4 className="text-xs font-bold text-text-3 uppercase tracking-wider mb-3">VRT MAX Rights</h4>
            <div className="space-y-2">
              {realtimeEvents.slice(0, 5).map(e => {
                const contract = getContract(e)
                const comp = compsMap.get(e.competitionId)
                return (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-text-2">{comp?.name}</span>
                    {contract?.maxRights ? <Badge variant="success">MAX</Badge> : <Badge variant="danger">No MAX</Badge>}
                  </div>
                )
              })}
            </div>
          </div>
        )

      case 'upcomingToday':
        return (
          <div key={widget.id} className="card p-4 animate-fade-in">
            <h4 className="text-xs font-bold text-text-3 uppercase tracking-wider mb-3">Quick Stats</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-surface-2 rounded-lg">
                <div className="text-2xl font-bold text-text">{weekEvents.length}</div>
                <div className="text-xs text-text-2">This Week</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(225,6,0,0.1)' }}>
                <div className="text-2xl font-bold text-primary">{liveNow.length}</div>
                <div className="text-xs text-primary">Live</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(234,140,0,0.1)' }}>
                <div className="text-2xl font-bold text-warning">{realtimeEvents.filter(e => e.isDelayedLive).length}</div>
                <div className="text-xs text-warning">Delayed</div>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div>
      {/* Side panels row */}
      {showSidePanels.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {showSidePanels.map(w => renderSideWidget(w))}
        </div>
      )}

      {/* Main calendar / timeline area */}
      {showTimeline && (
        <div className="animate-fade-in">
          {/* Controls row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {/* Week nav */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekOffset(0)}
                className="px-3 py-1.5 text-xs border border-border text-text-2 rounded-lg hover:bg-surface-2 transition font-sans"
              >
                This week
              </button>
              <button
                onClick={() => setWeekOffset(o => o - 1)}
                className="px-2.5 py-1.5 text-sm border border-border text-text-2 rounded-lg hover:bg-surface-2 transition"
                aria-label="Previous week (←)"
                title="Previous week (←)"
              >
                ‹
              </button>
              <span className="px-3 py-1.5 text-xs text-text font-medium font-mono min-w-[11rem] text-center border border-transparent">
                {weekLabel}
              </span>
              <button
                onClick={() => setWeekOffset(o => o + 1)}
                className="px-2.5 py-1.5 text-sm border border-border text-text-2 rounded-lg hover:bg-surface-2 transition"
                aria-label="Next week (→)"
                title="Next week (→)"
              >
                ›
              </button>
            </div>

            <div className="flex-1" />

            {/* Stats inline */}
            <span className="text-xs text-text-2 font-mono bg-surface border border-border px-2 py-1 rounded">
              {weekEvents.length} events
            </span>
            {liveNow.length > 0 && (
              <span className="text-xs text-danger font-mono bg-danger/10 border border-danger/20 px-2 py-1 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                {liveNow.length} live
              </span>
            )}

            {/* View toggle */}
            <div className="flex border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setCalendarMode(true)}
                className={`px-3 py-1.5 text-xs font-medium transition ${calendarMode ? 'bg-primary text-black' : 'text-text-2 hover:bg-surface-2'}`}
              >
                Calendar
              </button>
              <button
                onClick={() => setCalendarMode(false)}
                className={`px-3 py-1.5 text-xs font-medium transition ${!calendarMode ? 'bg-primary text-black' : 'text-text-2 hover:bg-surface-2'}`}
              >
                List
              </button>
            </div>
          </div>

          {/* Saved views chip bar */}
          <div className="flex gap-1 flex-wrap items-center mb-2">
            {savedViews.map(v => (
              <div key={v.id} className="flex items-center gap-1 bg-surface-2 rounded px-2 py-0.5 text-xs">
                <button onClick={() => handleLoadView(v)}>{v.name}</button>
                <button onClick={() => handleDeleteView(v.id)} className="text-muted hover:text-danger">×</button>
              </div>
            ))}
            {showSaveInput ? (
              <div className="flex gap-1">
                <input
                  className="inp text-xs px-2 py-0.5 w-32"
                  value={saveViewName}
                  onChange={e => setSaveViewName(e.target.value)}
                  placeholder="View name…"
                  onKeyDown={e => e.key === 'Enter' && handleSaveView()}
                  autoFocus
                />
                <button className="btn btn-sm btn-p" onClick={handleSaveView}>Save</button>
                <button className="btn btn-sm btn-g" onClick={() => setShowSaveInput(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-sm btn-g" onClick={() => setShowSaveInput(true)}>+ Save view</button>
            )}
          </div>

          {/* Channel chips */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setChannelFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                channelFilter === 'all'
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'border-border bg-surface text-text-2 hover:border-text-3 hover:text-text'
              }`}
            >
              All channels
              {channelFilter !== 'all' && (
                <span className="ml-1.5 opacity-60">{weekEvents.length}</span>
              )}
            </button>
            {orgConfig.channels.map(({ name: ch }: { name: string; color: string }) => {
              const col = getChannelColor(ch)
              const isActive = channelFilter === ch
              const count = channelCounts[ch] ?? 0
              return (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className="px-3 py-1 rounded-full text-xs font-medium border transition"
                  style={{
                    borderColor: isActive ? col.border : undefined,
                    background: isActive ? col.bg : undefined,
                    color: isActive ? col.text : undefined,
                  }}
                >
                  {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: col.border }} />}
                  {ch}
                  {count > 0 && (
                    <span className="ml-1.5 opacity-60">{count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : calendarMode ? (
            <DndContext onDragEnd={handleDragEnd}>
              <CalendarGrid
                weekDays={weekDays}
                todayStr={todayStr}
                events={filteredWeekEvents}
                onEventClick={onEventClick}
                getChannelColor={getChannelColor}
                conflictMap={conflictMap}
              />
            </DndContext>
          ) : (
            /* List mode — fallback */
            grouped.length === 0 ? (
              <div className="card p-8 text-center text-text-3">
                No events for this week
              </div>
            ) : (
              grouped.map(([date, dayEvs]) => (
                <div key={date} className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-1 h-6 rounded-full bg-gradient-to-b from-blue-400 to-blue-700" />
                    <h3 className="font-bold text-base">{dayLabel(date)}</h3>
                  </div>
                  {Object.entries(
                    dayEvs.reduce((acc: Record<string, Event[]>, e) => {
                      const channel = e.linearChannel || 'Unassigned'
                      if (!acc[channel]) acc[channel] = []
                      acc[channel].push(e)
                      return acc
                    }, {})
                  ).map(([channel, chEvs]) => {
                    const col = getChannelColor(channel)
                    return (
                      <div key={channel} className="card overflow-hidden mb-3">
                        <div
                          className="px-4 py-2 border-b border-border text-xs font-bold uppercase tracking-wider"
                          style={{ color: col.text, borderLeftWidth: 3, borderLeftColor: col.border }}
                        >
                          {channel}
                        </div>
                        <div className="divide-y divide-surface-2">
                          {(chEvs as Event[]).map(ev => {
                            const sp = sportsMap.get(ev.sportId)
                            const comp = compsMap.get(ev.competitionId)
                            const contract = getContract(ev)
                            return (
                              <div
                                key={ev.id}
                                className="px-4 py-3 hover:bg-surface-2/50 transition-colors cursor-pointer"
                                onClick={() => onEventClick?.(ev)}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="text-right pt-0.5 w-12 flex-shrink-0 font-mono font-semibold text-sm">
                                    {ev.linearStartTime || ev.startTimeBE}
                                  </div>
                                  <div className="text-xl">{sp?.icon}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold">{ev.participants}</span>
                                      {(conflictMap[ev.id]?.length ?? 0) > 0 && (
                                        <span
                                          className="inline-flex items-center"
                                          title={conflictMap[ev.id].map(w => w.message).join('\n')}
                                          aria-label={`${conflictMap[ev.id].length} conflict warning(s)`}
                                        >
                                          ⚠️
                                        </span>
                                      )}
                                      {ev.isLive && <Badge variant="live">LIVE</Badge>}
                                      {ev.isDelayedLive && <Badge variant="warning">DELAYED</Badge>}
                                      {ev.status && ev.status !== 'draft' && (
                                        <Badge variant={statusVariant(ev.status)}>{ev.status}</Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-text-3 mt-0.5">
                                      {comp?.name} · {ev.phase} · {ev.complex}
                                    </div>
                                    {contract && (
                                      <div className="mt-1.5 flex items-center gap-2">
                                        <span className="text-xs text-text-3">VRT MAX:</span>
                                        {contract.maxRights
                                          ? <Badge variant="success">YES</Badge>
                                          : <Badge variant="danger">NO</Badge>}
                                        {contract.geoRestriction && (
                                          <span className="text-xs text-text-3">({contract.geoRestriction})</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── Calendar Grid ─────────────────────────────────────────────────────────────

interface CalendarGridProps {
  weekDays: Date[]
  todayStr: string
  events: Event[]
  onEventClick?: (event: Event) => void
  getChannelColor: (channel?: string | null) => { border: string; bg: string; text: string }
  conflictMap: Record<number, ConflictWarning[]>
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_LABELS = Array.from({ length: CAL_HOURS }, (_, i) => {
  const h = CAL_START_HOUR + i
  return `${String(h).padStart(2, '0')}:00`
})

function CalendarGrid({ weekDays, todayStr, events, onEventClick, getChannelColor, conflictMap }: CalendarGridProps) {
  const { sports } = useApp()
  const sportsMap = useMemo(() => new Map(sports.map(s => [s.id, s])), [sports])

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

  return (
    <div
      className="card overflow-hidden"
      style={{ display: 'grid', gridTemplateColumns: `42px repeat(7, 1fr)` }}
    >
      {/* Header row */}
      <div className="bg-surface-2 border-b border-border" />
      {weekDays.map((day, i) => {
        const ds = dateStr(day)
        const isToday = ds === todayStr
        const dayEvCount = eventsByDay[i].length
        return (
          <div
            key={ds}
            className="bg-surface-2 border-b border-border border-l border-l-border px-2 py-2 text-center"
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

      {/* Body: time column + day columns */}
      {/* Time column */}
      <div
        className="bg-surface-2/50 relative"
        style={{ height: CAL_HEIGHT }}
      >
        {HOUR_LABELS.map((label, i) => (
          <div
            key={label}
            className="absolute right-1 text-right"
            style={{ top: i * PX_PER_HOUR, lineHeight: '1' }}
          >
            <span className="text-xs text-text-3 font-mono">{label.replace(':00', '')}</span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      {weekDays.map((day, dayIdx) => {
        const ds = dateStr(day)
        const isToday = ds === todayStr
        const dayEvs = eventsByDay[dayIdx]

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

              {dayEvs.map(ev => {
                const time = ev.linearStartTime || ev.startTimeBE
                const top = eventTopPx(time)
                const height = eventHeightPx(parseDurationMin(ev.duration))
                const col = getChannelColor(ev.linearChannel)
                const sp = sportsMap.get(ev.sportId)

                // Skip events outside the visible range
                if (top >= CAL_HEIGHT) return null

                return (
                  <DraggableEventCard key={ev.id} event={ev}>
                    <div
                      className="absolute left-1 right-1 rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        top,
                        height: Math.min(height, CAL_HEIGHT - top),
                        background: col.bg,
                        borderLeft: `3px solid ${col.border}`,
                      }}
                      title={`${time} · ${ev.participants}`}
                      onClick={() => onEventClick?.(ev)}
                    >
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
                          {sp?.icon} {ev.participants}
                          {(conflictMap[ev.id]?.length ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center ml-1"
                              title={conflictMap[ev.id].map(w => w.message).join('\n')}
                              aria-label={`${conflictMap[ev.id].length} conflict warning(s)`}
                            >
                              ⚠️
                            </span>
                          )}
                        </span>
                        {height > 50 && ev.linearChannel && (
                          <span
                            className="block text-xs font-mono uppercase tracking-wide leading-none mt-0.5"
                            style={{ color: col.text, opacity: 0.65, fontSize: '10px' }}
                          >
                            {ev.linearChannel}
                          </span>
                        )}
                        {ev.isLive && (
                          <span className="inline-flex items-center gap-1 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                            <span className="text-danger font-mono" style={{ fontSize: '9px' }}>LIVE</span>
                          </span>
                        )}
                        {ev.status && ev.status !== 'draft' && height > 40 && (
                          <Badge variant={statusVariant(ev.status)} className="mt-0.5" style={{ fontSize: '9px' }}>
                            {ev.status}
                          </Badge>
                        )}
                      </div>
                    </div>
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
