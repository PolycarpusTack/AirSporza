import { useState, useMemo, useEffect } from 'react'
import { Badge } from '../components/ui'
import type { Event, DashboardWidget } from '../data/types'
import { SPORTS, COMPETITIONS, CHANNELS, CONTRACTS } from '../data'
import { dayLabel } from '../utils'
import { useSocket } from '../hooks'

interface PlannerViewProps {
  events: Event[]
  widgets: DashboardWidget[]
  loading?: boolean
}

function getDateKey(date: Date | string): string {
  return typeof date === 'string' ? date : date.toISOString().split('T')[0]
}

export function PlannerView({ events, widgets, loading }: PlannerViewProps) {
  const [channelFilter, setChannelFilter] = useState("all")
  const [realtimeEvents, setRealtimeEvents] = useState<Event[]>(events)
  const visWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order)
  
  const { on } = useSocket()

  useEffect(() => {
    setRealtimeEvents(events)
  }, [events])

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
    return () => {
      unsubCreated()
      unsubUpdated()
      unsubDeleted()
    }
  }, [on])

  const grouped = useMemo(() => {
    const f = channelFilter === "all" ? realtimeEvents : realtimeEvents.filter(e => e.linearChannel === channelFilter)
    const byDate: Record<string, Event[]> = {}
    f.forEach(e => {
      const dateKey = getDateKey(e.startDateBE)
      if (!byDate[dateKey]) byDate[dateKey] = []
      byDate[dateKey].push(e)
    })
    Object.values(byDate).forEach(a => a.sort((a, b) => a.startTimeBE.localeCompare(b.startTimeBE)))
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
  }, [realtimeEvents, channelFilter])

  const liveNow = realtimeEvents.filter(e => e.isLive)
  const getContract = (e: Event) => CONTRACTS.find(c => c.competitionId === e.competitionId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-text-3">Loading events...</div>
      </div>
    )
  }

  const renderWidget = (widget: DashboardWidget) => {
    switch (widget.id) {
      case "liveNow":
        return (
          <div key={widget.id} className="card p-4 animate-fade-in">
            <h4 className="text-xs font-bold text-text-3 uppercase tracking-wider mb-3">Live / Upcoming</h4>
            <div className="space-y-2">
              {liveNow.slice(0, 4).map(e => {
                const sp = SPORTS.find(s => s.id === e.sportId)
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
      case "maxConditions":
        return (
          <div key={widget.id} className="card p-4 animate-fade-in">
            <h4 className="text-xs font-bold text-text-3 uppercase tracking-wider mb-3">VRT MAX Rights</h4>
            <div className="space-y-2">
              {realtimeEvents.slice(0, 5).map(e => {
                const contract = getContract(e)
                const comp = COMPETITIONS.find(c => c.id === e.competitionId)
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
      case "upcomingToday":
        return (
          <div key={widget.id} className="card p-4 animate-fade-in">
            <h4 className="text-xs font-bold text-text-3 uppercase tracking-wider mb-3">Quick Stats</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-surface-2 rounded-lg">
                <div className="text-2xl font-bold text-text">{realtimeEvents.length}</div>
                <div className="text-xs text-text-2">Total Events</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(225, 6, 0, 0.1)' }}>
                <div className="text-2xl font-bold text-primary">{realtimeEvents.filter(e => e.isLive).length}</div>
                <div className="text-xs text-primary">Live</div>
              </div>
              <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(234, 140, 0, 0.1)' }}>
                <div className="text-2xl font-bold text-warning">{realtimeEvents.filter(e => e.isDelayedLive).length}</div>
                <div className="text-xs text-warning">Delayed</div>
              </div>
            </div>
          </div>
        )
      case "channelTimeline":
      default:
        return (
          <div key={widget.id} className="animate-fade-in">
            <div className="flex gap-2 mb-4 flex-wrap">
              {["all", ...CHANNELS].map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${channelFilter === ch ? "bg-text text-white shadow" : "bg-surface text-text-2 border border-border hover:border-border-s"}`}
                >
                  {ch === "all" ? "All Channels" : ch}
                </button>
              ))}
            </div>
            {grouped.length === 0 ? (
              <div className="card p-8 text-center text-text-3">
                No events found
              </div>
            ) : (
              grouped.map(([date, dayEvs]) => (
                <div key={date} className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-1 h-6 rounded-full bg-gradient-to-b from-blue-400 to-blue-700" />
                    <h3 className="font-bold text-base">{dayLabel(date)}</h3>
                  </div>
                  {Object.entries(dayEvs.reduce((acc: Record<string, Event[]>, e) => {
                    const channel = e.linearChannel || 'Unassigned'
                    if (!acc[channel]) acc[channel] = []
                    acc[channel].push(e)
                    return acc
                  }, {})).map(([channel, chEvs]) => (
                    <div key={channel} className="card overflow-hidden mb-3">
                      <div className="px-4 py-2 bg-surface-2 border-b border-border text-xs font-bold text-text-2 uppercase tracking-wider">{channel}</div>
                      <div className="divide-y divide-surface-2">
                        {(chEvs as Event[]).map(ev => {
                          const sp = SPORTS.find(s => s.id === ev.sportId)
                          const comp = COMPETITIONS.find(c => c.id === ev.competitionId)
                          const contract = getContract(ev)
                          return (
                            <div key={ev.id} className="px-4 py-3 hover:bg-surface-2/50 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className="text-right pt-0.5 w-12 flex-shrink-0 font-mono font-semibold text-sm">{ev.linearStartTime || ev.startTimeBE}</div>
                                <div className="text-xl">{sp?.icon}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold">{ev.participants}</span>
                                    {ev.isLive && <Badge variant="live">LIVE</Badge>}
                                    {ev.isDelayedLive && <Badge variant="warning">DELAYED</Badge>}
                                  </div>
                                  <div className="text-xs text-text-3 mt-0.5">{comp?.name} - {ev.phase} - {ev.complex}</div>
                                  {contract && (
                                    <div className="mt-1.5 flex items-center gap-2">
                                      <span className="text-xs text-text-3">VRT MAX:</span>
                                      {contract.maxRights ? <Badge variant="success">YES</Badge> : <Badge variant="danger">NO</Badge>}
                                      {contract.geoRestriction && <span className="text-xs text-text-3">({contract.geoRestriction})</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {visWidgets.filter(w => w.id !== "channelTimeline").map(w => renderWidget(w))}
      </div>
      {visWidgets.find(w => w.id === "channelTimeline") && renderWidget(visWidgets.find(w => w.id === "channelTimeline")!)}
    </div>
  )
}
