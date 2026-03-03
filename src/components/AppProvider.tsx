import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import {
  DEFAULT_EVENT_FIELDS,
  DEFAULT_CREW_FIELDS,
  DEFAULT_DASHBOARD_WIDGETS,
  ROLE_CONFIG,
  SPORTS,
  COMPETITIONS,
  INITIAL_EVENTS,
  INITIAL_TECH_PLANS,
} from '../data'
import { eventsApi, settingsApi, techPlansApi } from '../services'
import { useToast } from './Toast'
import { useAuth } from '../hooks'
import type { Event, TechPlan, FieldConfig, DashboardWidget, Role, RoleConfig } from '../data/types'

interface AppContextType {
  activeRole: Role
  setActiveRole: (r: Role) => void
  events: Event[]
  setEvents: (e: Event[] | ((prev: Event[]) => Event[])) => void
  techPlans: TechPlan[]
  setTechPlans: (t: TechPlan[] | ((prev: TechPlan[]) => TechPlan[])) => void
  loading: boolean
  searchQuery: string
  setSearchQuery: (q: string) => void
  eventFields: FieldConfig[]
  setEventFields: (f: FieldConfig[] | ((prev: FieldConfig[]) => FieldConfig[])) => void
  crewFields: FieldConfig[]
  setCrewFields: (f: FieldConfig[] | ((prev: FieldConfig[]) => FieldConfig[])) => void
  dashWidgets: Record<string, DashboardWidget[]>
  setDashWidgets: (w: Record<string, DashboardWidget[]> | ((prev: Record<string, DashboardWidget[]>) => Record<string, DashboardWidget[]>)) => void
  currentWidgets: DashboardWidget[]
  setCurrentWidgets: (w: DashboardWidget[] | ((prev: DashboardWidget[]) => DashboardWidget[])) => void
  roleConfig: Record<Role, RoleConfig>
  handleSaveEvent: (ev: Event) => Promise<void>
  filteredEvents: Event[]
}

const AppContext = createContext<AppContextType | null>(null)

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [activeRole, setActiveRole] = useState<Role>('planner')
  const [events, setEvents] = useState<Event[]>([])
  const [techPlans, setTechPlans] = useState<TechPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [eventFields, setEventFields] = useState<FieldConfig[]>(DEFAULT_EVENT_FIELDS)
  const [crewFields, setCrewFields] = useState<FieldConfig[]>(DEFAULT_CREW_FIELDS)
  const [dashWidgets, setDashWidgets] = useState<Record<string, DashboardWidget[]>>(
    DEFAULT_DASHBOARD_WIDGETS
  )

  const toast = useToast()

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [eventsData, plansData, settingsData] = await Promise.all([
          eventsApi.list().catch(() => null),
          techPlansApi.list().catch(() => null),
          settingsApi.getApp(activeRole).catch(() => null),
        ])

        if (eventsData) {
          setEvents(eventsData as Event[])
        } else {
          setEvents(INITIAL_EVENTS)
          toast.warning('Using sample data — API unavailable')
        }

        if (plansData) {
          setTechPlans(plansData as TechPlan[])
        } else {
          setTechPlans(INITIAL_TECH_PLANS)
        }

        if (settingsData) {
          if (settingsData.eventFields) {
            setEventFields(settingsData.eventFields)
          }
          if (settingsData.crewFields) {
            setCrewFields(settingsData.crewFields)
          }
          if (settingsData.dashboardWidgets) {
            setDashWidgets(prev => ({
              ...prev,
              [activeRole]: settingsData.dashboardWidgets || DEFAULT_DASHBOARD_WIDGETS[activeRole],
            }))
          }
        }
      } catch (error) {
        console.error('Failed to fetch data:', error)
        setEvents(INITIAL_EVENTS)
        setTechPlans(INITIAL_TECH_PLANS)
        toast.error('Failed to load data — using samples')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsData = await settingsApi.getApp(activeRole)
        if (settingsData.eventFields) {
          setEventFields(settingsData.eventFields)
        }
        if (settingsData.crewFields) {
          setCrewFields(settingsData.crewFields)
        }
        setDashWidgets(prev => ({
          ...prev,
          [activeRole]: settingsData.dashboardWidgets || prev[activeRole] || DEFAULT_DASHBOARD_WIDGETS[activeRole],
        }))
      } catch (error) {
        console.error('Failed to load app settings:', error)
      }
    }

    void fetchSettings()
  }, [activeRole])

  const handleSaveEvent = useCallback(
    async (ev: Event) => {
      try {
        const existingIndex = events.findIndex((e) => e.id === ev.id)

        if (existingIndex >= 0) {
          const updated = await eventsApi.update(ev.id, ev)
          setEvents((prev) => prev.map((e) => (e.id === ev.id ? (updated as Event) : e)))
          toast.success('Event updated')
        } else {
          const created = await eventsApi.create(ev)
          setEvents((prev) => [...prev, created as Event])
          toast.success('Event created')
        }
      } catch (error) {
        console.error('Failed to save event:', error)
        setEvents((prev) => {
          const idx = prev.findIndex((e) => e.id === ev.id)
          if (idx >= 0) {
            const n = [...prev]
            n[idx] = ev
            return n
          }
          return [...prev, ev]
        })
        toast.error('Save failed — offline mode')
      }
    },
    [events, toast]
  )

  const filteredEvents = useMemo(() => {
    if (!searchQuery) return events
    const q = searchQuery.toLowerCase()
    return events.filter(
      (e) =>
        e.participants?.toLowerCase().includes(q) ||
        e.content?.toLowerCase().includes(q) ||
        SPORTS.find((s) => s.id === e.sportId)?.name.toLowerCase().includes(q) ||
        COMPETITIONS.find((c) => c.id === e.competitionId)?.name.toLowerCase().includes(q)
    )
  }, [events, searchQuery])

  const currentWidgets = dashWidgets[activeRole] || []
  const persistEventFields = useCallback(
    (nextFields: FieldConfig[] | ((prev: FieldConfig[]) => FieldConfig[])) => {
      setEventFields(prev => {
        const next = typeof nextFields === 'function' ? nextFields(prev) : nextFields
        if (user?.role === 'admin') {
          void settingsApi.updateEventFields(next).catch(error => {
            console.error('Failed to persist event fields:', error)
            toast.error('Failed to save event field settings')
          })
        }
        return next
      })
    },
    [toast, user?.role]
  )

  const persistCrewFields = useCallback(
    (nextFields: FieldConfig[] | ((prev: FieldConfig[]) => FieldConfig[])) => {
      setCrewFields(prev => {
        const next = typeof nextFields === 'function' ? nextFields(prev) : nextFields
        if (user?.role === 'admin') {
          void settingsApi.updateCrewFields(next).catch(error => {
            console.error('Failed to persist crew fields:', error)
            toast.error('Failed to save crew field settings')
          })
        }
        return next
      })
    },
    [toast, user?.role]
  )

  const setCurrentWidgets = useCallback(
    (w: DashboardWidget[] | ((prev: DashboardWidget[]) => DashboardWidget[])) => {
      setDashWidgets((prev) => ({
        ...prev,
        [activeRole]: (() => {
          const next = typeof w === 'function' ? w(prev[activeRole]) : w
          void settingsApi.updateDashboard(activeRole, next).catch(error => {
            console.error('Failed to persist dashboard widgets:', error)
            toast.error('Failed to save dashboard layout')
          })
          return next
        })(),
      }))
    },
    [activeRole, toast]
  )

  const roleConfig = ROLE_CONFIG as Record<Role, RoleConfig>

  return (
    <AppContext.Provider
      value={{
        activeRole,
        setActiveRole,
        events,
        setEvents,
        techPlans,
        setTechPlans,
        loading,
        searchQuery,
        setSearchQuery,
        eventFields,
        setEventFields: persistEventFields,
        crewFields,
        setCrewFields: persistCrewFields,
        dashWidgets,
        setDashWidgets,
        currentWidgets,
        setCurrentWidgets,
        roleConfig,
        handleSaveEvent,
        filteredEvents,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}
