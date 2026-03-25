import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Badge } from '../components/ui'
import type { Event, DashboardWidget, Contract, EventStatus } from '../data/types'
import { CONTRACTS } from '../data'
import { dayLabel } from '../utils'
import { dateStr, getDateKey } from '../utils/dateTime'
import {
  FALLBACK_COLOR,
  buildColorMapById, statusVariant,
} from '../utils/calendarLayout'
import { isEventLocked, isForwardTransition, lockReasonLabel } from '../utils/eventLock'
import { computeReadiness } from '../utils/eventReadiness'
import { useApp } from '../context/AppProvider'
import { useAuth } from '../hooks'
import { contractsApi } from '../services/contracts'
import { eventsApi, type ConflictWarning } from '../services'
import { useToast } from '../components/Toast'
import { useChannelLookup } from '../components/ui/ChannelSelect'
import { BulkActionBar } from '../components/planner/BulkActionBar'
import { UndoBar } from '../components/planner/UndoBar'
import { EventDetailPanel } from '../components/planner/EventDetailPanel'
import { ContextMenu, type MenuItem } from '../components/planner/ContextMenu'
import { DuplicatePopover } from '../components/planner/DuplicatePopover'
import { CalendarGrid } from '../components/planner/CalendarGrid'
import { SkeletonCard } from '../components/planner/EventCard'
import { minutesToTime } from '../hooks/useDrawToCreate'
import type { VerticalDragResult } from '../hooks/useVerticalDrag'
import { minutesToSmpte } from '../utils'
import { useCalendarNavigation } from '../hooks/useCalendarNavigation'
import { useEventActions } from '../hooks/useEventActions'

interface PlannerViewProps {
  widgets: DashboardWidget[]
  loading?: boolean
  onEventClick?: (event: Event) => void
  scrollToDate?: string | null
  onDrawCreate?: (prefill: { startDateBE: string; startTimeBE: string; duration: string }) => void
  onMultiDayCreate?: (prefill: { dates: string[]; startTimeBE: string; duration: string }) => void
}

// ── Main component ───────────────────────────────────────────────────────────

export function PlannerView({ widgets, loading, onEventClick, scrollToDate, onDrawCreate, onMultiDayCreate }: PlannerViewProps) {
  const [channelFilter, setChannelFilter] = useState<number | 'all'>('all')
  const [sportFilter, setSportFilter] = useState<number | undefined>()
  const [competitionFilter, setCompetitionFilter] = useState<number | undefined>()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [readinessFilter, setReadinessFilter] = useState<string>('all')
  const [contracts, setContracts] = useState<Contract[]>(CONTRACTS)
  const [conflictMap, setConflictMap] = useState<Record<number, ConflictWarning[]>>({})
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const lastDragRef = useRef<{
    eventId: number
    previousDate?: string        // for horizontal drag
    previousTime?: string        // for vertical drag (time reschedule)
    previousDuration?: string    // for resize
  } | null>(null)
  const [undoBar, setUndoBar] = useState<{ message: string } | null>(null)

  const [detailEvent, setDetailEvent] = useState<Event | null>(null)
  const [localSearch, setLocalSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const listObserverRef = useRef<IntersectionObserver | null>(null)
  const [visibleDays, setVisibleDays] = useState<Set<string>>(new Set())

  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number
    event?: Event
    date?: string
    time?: string
  } | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<Event | null>(null)

  const { sports, competitions, orgConfig, setEvents, events: contextEvents, applyOptimisticEvent, revertOptimisticEvent, crewFields, techPlans } = useApp()
  const { user } = useAuth()
  const toast = useToast()
  const freezeHours = orgConfig.freezeWindowHours ?? 3

  const { channels: apiChannels, getChannel } = useChannelLookup()

  // ── Calendar navigation hook ──────────────────────────────────────────────
  const nav = useCalendarNavigation(scrollToDate, {
    channelFilter, sportFilter, competitionFilter, statusFilter, localSearch,
  }, {
    setChannelFilter, setSportFilter, setCompetitionFilter, setStatusFilter,
    setLocalSearch, setSearchInput,
    findChannelByName: (name: string) => apiChannels.find(c => c.name === name),
  })
  const {
    setWeekOffset, calendarMode, setCalendarMode,
    savedViews, saveViewName, setSaveViewName, showSaveInput, setShowSaveInput,
    weekFromStr, weekToStr, weekDays, todayStr, weekLabel, currentWeekValue,
    handleSaveView, handleLoadView, handleDeleteView, handleWeekPickerChange,
  } = nav

  // ── Event actions hook ────────────────────────────────────────────────────
  const { handleCtxStatusChange, handleCtxDelete, handleCtxDuplicate, handleCtxPaste, clipboardRef } = useEventActions({
    setEvents, freezeHours, userRole: user?.role,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )
  const channelColorMap = useMemo(() => buildColorMapById(apiChannels), [apiChannels])
  const getChannelColor = useCallback(
    (channelId?: number | null) => channelId ? (channelColorMap[channelId] ?? FALLBACK_COLOR) : FALLBACK_COLOR,
    [channelColorMap]
  )

  // Load contracts from API
  useEffect(() => {
    contractsApi.list().then(data => setContracts(data as Contract[])).catch(() => {})
  }, [])

  // Intersection Observer for list mode virtualization
  useEffect(() => {
    if (calendarMode) return
    const obs = new IntersectionObserver(
      (entries) => {
        setVisibleDays(prev => {
          const next = new Set(prev)
          for (const entry of entries) {
            const date = (entry.target as HTMLElement).dataset.dayDate
            if (!date) continue
            if (entry.isIntersecting) next.add(date)
            else next.delete(date)
          }
          return next
        })
      },
      { rootMargin: '200px 0px' }
    )
    listObserverRef.current = obs
    return () => obs.disconnect()
  }, [calendarMode])

  // Memoised lookup Maps for performance
  const sportsMap = useMemo(() => new Map(sports.map(s => [s.id, s])), [sports])
  const compsMap  = useMemo(() => new Map(competitions.map(c => [c.id, c])), [competitions])
  const contractsByCompId = useMemo(
    () => new Map(contracts.map(c => [c.competitionId, c])),
    [contracts]
  )

  const weekEvents = useMemo(
    () => contextEvents.filter(e => {
      const k = getDateKey(e.startDateBE)
      return k >= weekFromStr && k <= weekToStr
    }),
    [contextEvents, weekFromStr, weekToStr]
  )

  const filteredWeekEvents = useMemo(() => {
    let result = weekEvents
    if (channelFilter !== 'all') result = result.filter(e => e.channelId === channelFilter)
    if (sportFilter) result = result.filter(e => e.sportId === sportFilter)
    if (competitionFilter) result = result.filter(e => e.competitionId === competitionFilter)
    if (statusFilter) result = result.filter(e => (e.status ?? 'draft') === statusFilter)
    if (localSearch) {
      const q = localSearch.toLowerCase()
      result = result.filter(ev =>
        ev.participants?.toLowerCase().includes(q) ||
        (ev.channel?.name ?? ev.linearChannel)?.toLowerCase().includes(q) ||
        sportsMap.get(ev.sportId)?.name?.toLowerCase().includes(q) ||
        compsMap.get(ev.competitionId)?.name?.toLowerCase().includes(q)
      )
    }
    if (readinessFilter !== 'all') {
      result = result.filter(ev => {
        const r = computeReadiness(ev, techPlans, contracts, crewFields)
        if (readinessFilter === 'ready') return r.ready
        if (readinessFilter === 'not-ready') return r.score === 0
        if (readinessFilter === 'partial') return r.score > 0 && r.score < r.total
        return true
      })
    }
    return result
  }, [weekEvents, channelFilter, sportFilter, competitionFilter, statusFilter, localSearch, sportsMap, compsMap, readinessFilter, techPlans, contracts, crewFields])

  // Stable key for conflict refetch: based on filtered events to avoid unnecessary re-checks
  const weekEventKey = useMemo(
    () => filteredWeekEvents.map(e => `${e.id}:${getDateKey(e.startDateBE)}:${e.startTimeBE}:${e.duration ?? ''}`).sort().join(','),
    [filteredWeekEvents]
  )

  // Fetch conflicts for filtered week events
  useEffect(() => {
    if (filteredWeekEvents.length === 0) {
      setConflictMap({})
      return
    }
    const ids = filteredWeekEvents.map(e => e.id)
    let cancelled = false
    // Chunk into batches of 50 to avoid backend limits
    const chunks: number[][] = []
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50))
    Promise.all(chunks.map(chunk => eventsApi.checkBulkConflicts(chunk)))
      .then(results => {
        if (cancelled) return
        const merged: Record<number, ConflictWarning[]> = {}
        for (const r of results) Object.assign(merged, r)
        setConflictMap(merged)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [weekEventKey])

  // Only show live events happening today
  const liveNow = contextEvents.filter(e => e.isLive && getDateKey(e.startDateBE) === todayStr)

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
    const event = contextEvents.find(e => e.id === eventId)
    if (!event) return
    // Lock check: prevent dragging locked events
    const lock = isEventLocked(event, freezeHours, user?.role)
    if (lock.locked && !lock.canOverride) return
    if (lock.locked && lock.canOverride) {
      if (!window.confirm(`This event is locked (${lockReasonLabel(lock)}). Changes may disrupt operations. Continue?`)) return
    }
    const currentDateStr = typeof event.startDateBE === 'string'
      ? event.startDateBE.slice(0, 10)
      : dateStr(event.startDateBE as Date)
    if (newDate === currentDateStr) return  // same day, no-op
    // Optimistic: apply patch immediately
    applyOptimisticEvent({ id: eventId, startDateBE: newDate })
    try {
      await eventsApi.update(eventId, { ...event, startDateBE: newDate })
      // Confirm: update base state, then remove optimistic patch
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
      revertOptimisticEvent(eventId)
      // Store undo info and show undo bar
      lastDragRef.current = { eventId, previousDate: currentDateStr }
      const label = new Date(newDate + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
      })
      setUndoBar({ message: `Moved to ${label}` })
    } catch {
      // Revert optimistic patch
      revertOptimisticEvent(eventId)
      toast.error('Failed to reschedule event')
    }
  }, [contextEvents, setEvents, toast, applyOptimisticEvent, revertOptimisticEvent])

  // ── Vertical drag complete ────────────────────────────────────────────────

  const handleVerticalDragComplete = useCallback(async (result: VerticalDragResult) => {
    const ev = contextEvents.find(e => e.id === result.eventId)
    if (!ev) return

    const newTime = minutesToTime(result.newStartMin)
    const newDuration = minutesToSmpte(result.newDurationMin)
    const oldTime = ev.linearStartTime || ev.startTimeBE
    const oldDuration = ev.duration

    // Determine what changed
    const timeChanged = newTime !== oldTime
    const durationChanged = newDuration !== oldDuration

    if (!timeChanged && !durationChanged) return

    // Build patch
    const patch: Partial<Event> = {}
    if (timeChanged) {
      // Update linearStartTime if it exists, otherwise startTimeBE
      if (ev.linearStartTime) {
        patch.linearStartTime = newTime
      } else {
        patch.startTimeBE = newTime
      }
    }
    if (durationChanged) {
      patch.duration = newDuration
    }

    // Optimistic update
    applyOptimisticEvent({ id: result.eventId, ...patch })
    try {
      await eventsApi.update(result.eventId, { ...ev, ...patch })
      setEvents(prev => prev.map(e => e.id === result.eventId ? { ...e, ...patch } : e))
      revertOptimisticEvent(result.eventId)

      // Store undo info
      if (timeChanged && !durationChanged) {
        lastDragRef.current = { eventId: result.eventId, previousTime: oldTime }
        setUndoBar({ message: `Rescheduled to ${newTime}` })
      } else if (durationChanged && !timeChanged) {
        lastDragRef.current = { eventId: result.eventId, previousDuration: oldDuration }
        const h = Math.floor(result.newDurationMin / 60)
        const m = result.newDurationMin % 60
        const durLabel = h > 0 ? `${h}h ${m}m` : `${m}m`
        setUndoBar({ message: `Duration changed to ${durLabel}` })
      } else {
        // Both changed (shouldn't normally happen but handle it)
        lastDragRef.current = { eventId: result.eventId, previousTime: oldTime, previousDuration: oldDuration }
        setUndoBar({ message: `Rescheduled to ${newTime}` })
      }
    } catch {
      revertOptimisticEvent(result.eventId)
      toast.error('Failed to update event')
    }
  }, [contextEvents, setEvents, toast, applyOptimisticEvent, revertOptimisticEvent])

  // ── Undo drag ──────────────────────────────────────────────────────────────

  const handleUndoDrag = useCallback(async () => {
    if (!lastDragRef.current) return
    const { eventId, previousDate, previousTime, previousDuration } = lastDragRef.current
    lastDragRef.current = null
    const ev = contextEvents.find(e => e.id === eventId)
    if (!ev) return

    // Build revert patch
    const patch: Partial<Event> = {}
    if (previousDate) patch.startDateBE = previousDate
    if (previousTime) {
      if (ev.linearStartTime) patch.linearStartTime = previousTime
      else patch.startTimeBE = previousTime
    }
    if (previousDuration) patch.duration = previousDuration

    applyOptimisticEvent({ id: eventId, ...patch })
    try {
      await eventsApi.update(eventId, { ...ev, ...patch })
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...patch } : e))
      revertOptimisticEvent(eventId)
    } catch {
      revertOptimisticEvent(eventId)
      toast.error('Undo failed')
    }
  }, [contextEvents, setEvents, toast, applyOptimisticEvent, revertOptimisticEvent])

  const dismissUndoBar = useCallback(() => {
    setUndoBar(null)
    lastDragRef.current = null
  }, [])

  // ── Selection mode ──────────────────────────────────────────────────────────

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }, [])

  const toggleSelectId = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── Bulk operation handlers ────────────────────────────────────────────────

  /** Filter out locked events from a bulk operation. Shows a warning if some are skipped. Returns IDs to proceed with. */
  const filterLockedForBulk = useCallback((ids: number[]): number[] | null => {
    const events = contextEvents.filter(e => ids.includes(e.id))
    const locked = events.filter(e => {
      const lock = isEventLocked(e, freezeHours, user?.role)
      return lock.locked && !lock.canOverride
    })
    if (locked.length === ids.length) {
      toast.warning('All selected events are locked and will be skipped')
      return null
    }
    if (locked.length > 0) {
      if (!window.confirm(`${locked.length} of ${ids.length} event(s) are locked and will be skipped. Continue with the remaining ${ids.length - locked.length}?`)) {
        return null
      }
      const lockedIds = new Set(locked.map(e => e.id))
      return ids.filter(id => !lockedIds.has(id))
    }
    return ids
  }, [contextEvents, freezeHours, user?.role, toast])

  const handleBulkDelete = useCallback(async () => {
    const filtered = filterLockedForBulk(Array.from(selectedIds))
    if (!filtered || filtered.length === 0) return
    setBulkLoading(true)
    try {
      await eventsApi.bulkDelete(filtered)
      const filteredSet = new Set(filtered)
      setEvents(prev => prev.filter(e => !filteredSet.has(e.id)))
      setSelectedIds(new Set())
      toast.success(`Deleted ${filtered.length} event(s)`)
    } catch {
      toast.error('Bulk delete failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, setEvents, toast, filterLockedForBulk])

  const handleBulkStatus = useCallback(async (status: EventStatus) => {
    const filtered = filterLockedForBulk(Array.from(selectedIds))
    if (!filtered || filtered.length === 0) return
    setBulkLoading(true)
    try {
      await eventsApi.bulkStatus(filtered, status)
      const filteredSet = new Set(filtered)
      setEvents(prev => prev.map(e => filteredSet.has(e.id) ? { ...e, status } : e))
      toast.success(`Updated status for ${filtered.length} event(s)`)
    } catch {
      toast.error('Bulk status update failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, setEvents, toast, filterLockedForBulk])

  const handleBulkReschedule = useCallback(async (shiftDays: number) => {
    const filtered = filterLockedForBulk(Array.from(selectedIds))
    if (!filtered || filtered.length === 0) return
    setBulkLoading(true)
    try {
      await eventsApi.bulkReschedule(filtered, shiftDays)
      const updated = await eventsApi.list()
      setEvents(updated as Event[])
      toast.success(`Rescheduled ${filtered.length} event(s) by ${shiftDays} day(s)`)
    } catch {
      toast.error('Bulk reschedule failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, setEvents, toast, filterLockedForBulk])

  const handleBulkAssignChannel = useCallback(async (channelId: number) => {
    const ids = Array.from(selectedIds)
    setBulkLoading(true)
    try {
      await eventsApi.bulkAssign(ids, 'channelId', channelId)
      const ch = getChannel(channelId)
      setEvents(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, channelId, channel: ch ? { id: ch.id, name: ch.name, color: ch.color, types: ch.types } : e.channel } : e))
      toast.success(`Assigned channel to ${ids.length} event(s)`)
    } catch {
      toast.error('Bulk assign failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, setEvents, toast, getChannel])

  const handleBulkAssignSport = useCallback(async (sportId: number) => {
    const ids = Array.from(selectedIds)
    setBulkLoading(true)
    try {
      await eventsApi.bulkAssign(ids, 'sportId', sportId)
      setEvents(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, sportId } : e))
      toast.success(`Assigned sport to ${ids.length} event(s)`)
    } catch {
      toast.error('Bulk assign failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, setEvents, toast])

  const handleBulkAssignCompetition = useCallback(async (competitionId: number) => {
    const ids = Array.from(selectedIds)
    setBulkLoading(true)
    try {
      await eventsApi.bulkAssign(ids, 'competitionId', competitionId)
      setEvents(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, competitionId } : e))
      toast.success(`Assigned competition to ${ids.length} event(s)`)
    } catch {
      toast.error('Bulk assign failed')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, setEvents, toast])

  // ── Context menu builders ──────────────────────────────────────────────────

  const ALL_STATUSES: EventStatus[] = ['draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled']

  const buildEventMenuItems = useCallback((event: Event): MenuItem[] => {
    const lock = isEventLocked(event, freezeHours, user?.role)
    const editDisabled = lock.locked && !lock.canOverride
    const currentStatus = (event.status ?? 'draft') as EventStatus
    return [
      { type: 'action', label: 'Open details', onClick: () => setDetailEvent(event) },
      { type: 'action', label: 'Edit event', disabled: editDisabled, onClick: () => { setDetailEvent(null); onEventClick?.(event) } },
      { type: 'separator' },
      { type: 'action', label: 'Duplicate...', onClick: () => setDuplicateTarget(event) },
      {
        type: 'submenu',
        label: 'Status',
        children: ALL_STATUSES.map(s => ({
          type: 'action' as const,
          label: s.charAt(0).toUpperCase() + s.slice(1),
          disabled: event.status === s || (lock.locked && !lock.canOverride && !isForwardTransition(currentStatus, s)),
          onClick: () => handleCtxStatusChange(event, s),
        })),
      },
      { type: 'separator' },
      { type: 'action', label: 'Delete', danger: true, disabled: editDisabled, onClick: () => handleCtxDelete(event) },
    ]
  }, [handleCtxStatusChange, handleCtxDelete, onEventClick, freezeHours, user?.role])

  const buildSlotMenuItems = useCallback((date: string, time?: string): MenuItem[] => {
    const items: MenuItem[] = [
      {
        type: 'action',
        label: 'Create event here',
        onClick: () => {
          onDrawCreate?.({
            startDateBE: date,
            startTimeBE: time || '12:00',
            duration: '01:30:00;00',
          })
        },
      },
    ]
    if (clipboardRef.current) {
      items.push({
        type: 'action',
        label: 'Paste event here',
        onClick: () => handleCtxPaste(date, time),
      })
    }
    return items
  }, [onDrawCreate, handleCtxPaste])

  const visWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order)
  const showTimeline = visWidgets.find(w => w.id === 'channelTimeline')

  // Event counts per channel (for filter chips)
  const channelCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    weekEvents.forEach(e => {
      if (e.channelId) counts[e.channelId] = (counts[e.channelId] ?? 0) + 1
    })
    return counts
  }, [weekEvents])

  return (
    <div>
      {/* Main calendar / timeline area */}
      {showTimeline && (
        <div className="animate-fade-in">
          {/* Controls row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {/* Week nav */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setWeekOffset(0); setLocalSearch(''); setSearchInput(''); setSelectedIds(new Set()) }}
                className="px-3 py-1.5 text-xs border border-border text-text-2 rounded-lg hover:bg-surface-2 transition font-sans"
              >
                This week
              </button>
              <button
                onClick={() => { setWeekOffset(o => o - 1); setLocalSearch(''); setSearchInput(''); setSelectedIds(new Set()) }}
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
                onClick={() => { setWeekOffset(o => o + 1); setLocalSearch(''); setSearchInput(''); setSelectedIds(new Set()) }}
                className="px-2.5 py-1.5 text-sm border border-border text-text-2 rounded-lg hover:bg-surface-2 transition"
                aria-label="Next week (→)"
                title="Next week (→)"
              >
                ›
              </button>
              <input
                type="week"
                className="inp text-sm px-2 py-1"
                value={currentWeekValue}
                onChange={e => {
                  handleWeekPickerChange(e.target.value)
                  setSelectedIds(new Set())
                }}
              />
            </div>

            <div className="flex-1" />

            <input
              type="search"
              placeholder="Search events..."
              className="inp text-sm px-2 py-1 w-48"
              value={searchInput}
              onChange={e => {
                setSearchInput(e.target.value)
                clearTimeout(searchTimerRef.current)
                searchTimerRef.current = setTimeout(() => setLocalSearch(e.target.value), 200)
              }}
            />

            {/* Sport filter */}
            <select
              className="inp text-sm py-1 px-2"
              value={sportFilter ?? ''}
              onChange={e => setSportFilter(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All sports</option>
              {sports.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Competition filter */}
            <select
              className="inp text-sm py-1 px-2"
              value={competitionFilter ?? ''}
              onChange={e => setCompetitionFilter(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All competitions</option>
              {competitions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Status filter */}
            <select
              className="inp text-sm py-1 px-2"
              value={statusFilter ?? ''}
              onChange={e => setStatusFilter(e.target.value || undefined)}
            >
              <option value="">All statuses</option>
              {(['draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled']).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Readiness filter */}
            <select
              className="inp text-sm py-1 px-2"
              value={readinessFilter}
              onChange={e => setReadinessFilter(e.target.value)}
            >
              <option value="all">All readiness</option>
              <option value="ready">Ready</option>
              <option value="not-ready">Not Ready</option>
              <option value="partial">Partial</option>
            </select>

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

            {/* Selection mode toggle */}
            <button
              className={`btn ${selectionMode ? 'btn-s' : 'btn-g'} btn-sm`}
              onClick={toggleSelectionMode}
            >
              {selectionMode ? 'Cancel' : 'Select'}
            </button>

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
            {apiChannels.filter(ch => !ch.parentId).map(ch => {
              const col = getChannelColor(ch.id)
              const isActive = channelFilter === ch.id
              const count = channelCounts[ch.id] ?? 0
              return (
                <button
                  key={ch.id}
                  onClick={() => setChannelFilter(ch.id)}
                  className="px-3 py-1 rounded-full text-xs font-medium border transition"
                  style={{
                    borderColor: isActive ? col.border : undefined,
                    background: isActive ? col.bg : undefined,
                    color: isActive ? col.text : undefined,
                  }}
                >
                  {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: col.border }} />}
                  {ch.name}
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
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <CalendarGrid
                weekDays={weekDays}
                todayStr={todayStr}
                events={filteredWeekEvents}
                freezeWindowHours={freezeHours}
                userRole={user?.role}
                onEventClick={ev => setDetailEvent(ev)}
                getChannelColor={getChannelColor}
                conflictMap={conflictMap}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelectId}
                onEventContextMenu={(e, ev, date, time) => {
                  e.preventDefault()
                  setCtxMenu({ x: e.clientX, y: e.clientY, event: ev, date, time })
                }}
                onSlotContextMenu={(e, date, time) => {
                  e.preventDefault()
                  setCtxMenu({ x: e.clientX, y: e.clientY, date, time })
                }}
                onDrawCreate={(result) => {
                  const durMin = result.durationMinutes
                  const h = Math.floor(durMin / 60)
                  const m = durMin % 60
                  const smpte = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00;00`
                  onDrawCreate?.({ startDateBE: result.date, startTimeBE: result.startTime, duration: smpte })
                }}
                onMultiDayCreate={(result) => {
                  const durMin = result.durationMinutes
                  const h = Math.floor(durMin / 60)
                  const m = durMin % 60
                  const smpte = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00;00`
                  onMultiDayCreate?.({ dates: result.dates, startTimeBE: result.startTime, duration: smpte })
                }}
                onVerticalDragComplete={handleVerticalDragComplete}
                contracts={contracts}
                crewFields={crewFields}
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
                <div key={date} className="mb-6" data-day-date={date} ref={el => {
                  if (el && listObserverRef.current) listObserverRef.current.observe(el)
                }}>
                  {visibleDays.has(date) || visibleDays.size === 0 ? (<>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-1 h-6 rounded-full bg-gradient-to-b from-blue-400 to-blue-700" />
                    <h3 className="font-bold text-base">{dayLabel(date)}</h3>
                  </div>
                  {Object.entries(
                    dayEvs.reduce((acc: Record<string, Event[]>, e) => {
                      const channel = e.channel?.name || e.linearChannel || 'Unassigned'
                      if (!acc[channel]) acc[channel] = []
                      acc[channel].push(e)
                      return acc
                    }, {})
                  ).map(([channel, chEvs]) => {
                    const firstEv = (chEvs as Event[])[0]
                    const col = getChannelColor(firstEv?.channelId)
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
                                className={`px-4 py-3 hover:bg-surface-2/50 transition-colors cursor-pointer ${selectionMode && selectedIds.has(ev.id) ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
                                onClick={() => selectionMode ? toggleSelectId(ev.id) : setDetailEvent(ev)}
                                onContextMenu={(e) => {
                                  e.preventDefault()
                                  setCtxMenu({ x: e.clientX, y: e.clientY, event: ev, date: getDateKey(ev.startDateBE) })
                                }}
                              >
                                <div className="flex items-start gap-3">
                                  {selectionMode && (
                                    <input
                                      type="checkbox"
                                      className="mt-1 cursor-pointer"
                                      checked={selectedIds.has(ev.id)}
                                      onChange={() => toggleSelectId(ev.id)}
                                      onClick={e => e.stopPropagation()}
                                    />
                                  )}
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
                  </>) : (
                    <div style={{ minHeight: 100 }} />
                  )}
                </div>
              ))
            )
          )}
        </div>
      )}

      {undoBar && (
        <UndoBar
          message={undoBar.message}
          onUndo={handleUndoDrag}
          onDismiss={dismissUndoBar}
        />
      )}

      {selectionMode && (
        <BulkActionBar
          count={selectedIds.size}
          onDelete={handleBulkDelete}
          onStatusChange={handleBulkStatus}
          onReschedule={handleBulkReschedule}
          onAssignChannel={handleBulkAssignChannel}
          onAssignSport={handleBulkAssignSport}
          onAssignCompetition={handleBulkAssignCompetition}
          sports={sports}
          competitions={competitions}
          loading={bulkLoading}
        />
      )}

      <EventDetailPanel
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onEdit={(ev) => { setDetailEvent(null); onEventClick?.(ev) }}
        onStatusChange={handleCtxStatusChange}
        onDuplicate={(ev) => setDuplicateTarget(ev)}
        onNavigateToSports={(eventId) => {
          window.location.href = `/sports?eventId=${eventId}`
        }}
        sports={sports}
        competitions={competitions}
        conflictMap={conflictMap}
        freezeWindowHours={freezeHours}
        userRole={user?.role}
        techPlans={techPlans}
        contracts={contracts}
        crewFields={crewFields}
      />

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.event
            ? buildEventMenuItems(ctxMenu.event)
            : buildSlotMenuItems(ctxMenu.date!, ctxMenu.time)
          }
          onClose={() => setCtxMenu(null)}
        />
      )}

      {duplicateTarget && (
        <DuplicatePopover
          event={duplicateTarget}
          onDuplicate={(date) => { handleCtxDuplicate(duplicateTarget, date); setDuplicateTarget(null) }}
          onClose={() => setDuplicateTarget(null)}
        />
      )}
    </div>
  )
}

