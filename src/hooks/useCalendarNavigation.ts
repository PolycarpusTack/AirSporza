import { useState, useEffect, useCallback, useMemo } from 'react'
import { weekMonday, addDays, dateStr } from '../utils/dateTime'
import { savedViewsApi, type SavedView, type PlannerFilterState } from '../services/savedViews'
import { useToast } from '../components/Toast'
import { handleApiError } from '../utils/apiError'

export interface CalendarNavigationFilters {
  channelFilter: number | 'all'
  sportFilter?: number
  competitionFilter?: number
  statusFilter?: string
  localSearch: string
}

export interface CalendarNavigationFilterSetters {
  setChannelFilter: (v: number | 'all') => void
  setSportFilter: (v: number | undefined) => void
  setCompetitionFilter: (v: number | undefined) => void
  setStatusFilter: (v: string | undefined) => void
  setLocalSearch: (v: string) => void
  setSearchInput: (v: string) => void
  /** Channel lookup for resolving legacy string-based filters */
  findChannelByName: (name: string) => { id: number } | undefined
}

export function useCalendarNavigation(
  scrollToDate: string | null | undefined,
  filters: CalendarNavigationFilters,
  filterSetters: CalendarNavigationFilterSetters,
) {
  const toast = useToast()

  // ── Core nav state ──────────────────────────────────────────────────────────
  const [weekOffset, setWeekOffset] = useState(0)
  const [calendarMode, setCalendarMode] = useState(true)

  // ── Saved views state ───────────────────────────────────────────────────────
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [saveViewName, setSaveViewName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  // ── Load saved views on mount ───────────────────────────────────────────────
  useEffect(() => {
    savedViewsApi.list('planner').then(setSavedViews).catch(() => {})
  }, [])

  // ── Keyboard navigation for week ───────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft')  setWeekOffset(o => o - 1)
      if (e.key === 'ArrowRight') setWeekOffset(o => o + 1)
      if (e.key === 't' || e.key === 'T') setWeekOffset(0)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // ── Auto-scroll to a specific date ─────────────────────────────────────────
  useEffect(() => {
    if (!scrollToDate) return
    const eventDate = new Date(scrollToDate + 'T00:00:00')
    const today = new Date()
    const todayDay = today.getDay() || 7
    const todayMonday = new Date(today)
    todayMonday.setDate(today.getDate() - todayDay + 1)
    todayMonday.setHours(0, 0, 0, 0)
    const eventDay = eventDate.getDay() || 7
    const eventMonday = new Date(eventDate)
    eventMonday.setDate(eventDate.getDate() - eventDay + 1)
    eventMonday.setHours(0, 0, 0, 0)
    const diffWeeks = Math.round(
      (eventMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    )
    setWeekOffset(diffWeeks)
  }, [scrollToDate])

  // ── Computed values ─────────────────────────────────────────────────────────
  const monday = weekMonday(weekOffset)
  const sunday = addDays(monday, 6)
  const weekFromStr = dateStr(monday)
  const weekToStr   = dateStr(sunday)

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekFromStr]
  )
  const todayStr = dateStr(new Date())

  const weekLabel = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
    return `${monday.toLocaleDateString('en-GB', opts)} – ${sunday.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekFromStr])

  const currentWeekValue = useMemo(() => {
    const d = new Date(monday)
    d.setUTCHours(0, 0, 0, 0)
    const thursday = new Date(d)
    thursday.setDate(d.getDate() - d.getDay() + 4)
    const yearStart = new Date(thursday.getFullYear(), 0, 1)
    const weekNo = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    const year = thursday.getFullYear()
    return `${year}-W${String(weekNo).padStart(2, '0')}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekFromStr])

  // ── Saved views handlers ────────────────────────────────────────────────────
  const handleSaveView = useCallback(async () => {
    if (!saveViewName.trim()) return
    try {
      const view = await savedViewsApi.create(saveViewName.trim(), 'planner', {
        channelFilter: filters.channelFilter,
        calendarMode: calendarMode ? 'calendar' : 'list',
        sportFilter: filters.sportFilter,
        competitionFilter: filters.competitionFilter,
        statusFilter: filters.statusFilter,
        searchText: filters.localSearch || undefined,
        weekOffset,
      })
      setSavedViews(prev => [...prev, view])
      setSaveViewName('')
      setShowSaveInput(false)
    } catch (err) {
      handleApiError(err, 'Save view failed', toast)
    }
  }, [saveViewName, filters, calendarMode, weekOffset, toast])

  const handleLoadView = useCallback((view: SavedView) => {
    const fs = view.filterState as PlannerFilterState
    if (fs.channelFilter != null) {
      // Support legacy string-based filters — match by name to ID
      if (typeof fs.channelFilter === 'string') {
        const ch = filterSetters.findChannelByName(fs.channelFilter)
        filterSetters.setChannelFilter(ch ? ch.id : 'all')
      } else {
        filterSetters.setChannelFilter(fs.channelFilter)
      }
    }
    if (fs.calendarMode === 'calendar') setCalendarMode(true)
    if (fs.calendarMode === 'list') setCalendarMode(false)
    filterSetters.setSportFilter(fs.sportFilter)
    filterSetters.setCompetitionFilter(fs.competitionFilter)
    filterSetters.setStatusFilter(fs.statusFilter)
    filterSetters.setLocalSearch(fs.searchText ?? '')
    filterSetters.setSearchInput(fs.searchText ?? '')
    if (fs.weekOffset !== undefined) setWeekOffset(fs.weekOffset)
  }, [filterSetters])

  const handleDeleteView = useCallback(async (id: string) => {
    try {
      await savedViewsApi.delete(id)
      setSavedViews(prev => prev.filter(v => v.id !== id))
    } catch (err) {
      handleApiError(err, 'Delete view failed', toast)
    }
  }, [toast])

  // ── Week picker handler ─────────────────────────────────────────────────────
  const handleWeekPickerChange = useCallback((value: string) => {
    if (!value) return
    const [yearStr, weekStr] = value.split('-W')
    const year = Number(yearStr)
    const week = Number(weekStr)
    if (!year || !week) return
    const jan4 = new Date(year, 0, 4)
    const dayOfWeek = jan4.getDay() || 7
    const startOfWeek1 = new Date(jan4)
    startOfWeek1.setDate(jan4.getDate() - dayOfWeek + 1)
    const targetMonday = new Date(startOfWeek1)
    targetMonday.setDate(startOfWeek1.getDate() + (week - 1) * 7)
    const today = new Date()
    const todayDay = today.getDay() || 7
    const todayMonday = new Date(today)
    todayMonday.setDate(today.getDate() - todayDay + 1)
    todayMonday.setHours(0, 0, 0, 0)
    targetMonday.setHours(0, 0, 0, 0)
    const diffMs = targetMonday.getTime() - todayMonday.getTime()
    const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
    filterSetters.setLocalSearch('')
    filterSetters.setSearchInput('')
    setWeekOffset(diffWeeks)
  }, [filterSetters])

  return {
    // State
    weekOffset,
    setWeekOffset,
    calendarMode,
    setCalendarMode,
    savedViews,
    saveViewName,
    setSaveViewName,
    showSaveInput,
    setShowSaveInput,
    // Computed
    monday,
    weekFromStr,
    weekToStr,
    weekDays,
    todayStr,
    weekLabel,
    currentWeekValue,
    // Handlers
    handleSaveView,
    handleLoadView,
    handleDeleteView,
    handleWeekPickerChange,
  }
}
