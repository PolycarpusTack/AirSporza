import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  DEFAULT_EVENT_FIELDS,
  DEFAULT_CREW_FIELDS,
  DEFAULT_DASHBOARD_WIDGETS,
  DEFAULT_ORG_CONFIG,
  ROLE_CONFIG,
  SPORTS,
  COMPETITIONS,
  INITIAL_EVENTS,
  INITIAL_TECH_PLANS,
} from '../data'
import { eventsApi, settingsApi, techPlansApi, sportsApi, competitionsApi } from '../services'
import { useToast } from '../components/Toast'
import { useAuth, useSocket } from '../hooks'
import type { Event, TechPlan, FieldConfig, DashboardWidget, OrgConfig, Role, RoleConfig, Sport, Competition } from '../data/types'

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
  handleSaveEvent: (ev: Event) => Promise<Event | null>
  applyOptimisticEvent: (patch: Partial<Event> & { id: number }) => void
  revertOptimisticEvent: (id: number) => void
  filteredEvents: Event[]
  sports: Sport[]
  competitions: Competition[]
  orgConfig: OrgConfig
  setOrgConfig: (c: OrgConfig) => void
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
  const location = useLocation()
  const navigate = useNavigate()

  const activeRole = useMemo<Role>(() => {
    if (location.pathname.startsWith('/sports')) return 'sports'
    if (location.pathname.startsWith('/contracts')) return 'contracts'
    if (location.pathname.startsWith('/admin')) return 'admin'
    if (location.pathname.startsWith('/settings')) return 'admin'
    if (location.pathname.startsWith('/import')) return 'planner'
    return 'planner'
  }, [location.pathname])

  const setActiveRole = useCallback(
    (r: Role) => navigate(`/${r}`),
    [navigate]
  )
  const [events, setEvents] = useState<Event[]>([])
  const [techPlans, setTechPlans] = useState<TechPlan[]>([])
  const [sports, setSports] = useState<Sport[]>(SPORTS)
  const [competitions, setCompetitions] = useState<Competition[]>(COMPETITIONS)
  const [orgConfig, setOrgConfig] = useState<OrgConfig>(DEFAULT_ORG_CONFIG)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [eventFields, setEventFields] = useState<FieldConfig[]>(DEFAULT_EVENT_FIELDS)
  const [crewFields, setCrewFields] = useState<FieldConfig[]>(DEFAULT_CREW_FIELDS)
  const [dashWidgets, setDashWidgets] = useState<Record<string, DashboardWidget[]>>(
    DEFAULT_DASHBOARD_WIDGETS
  )

  const toast = useToast()

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    const fetchData = async () => {
      try {
        setLoading(true)
        const [eventsData, plansData, sportsData, competitionsData] = await Promise.all([
          eventsApi.list().catch(() => null),
          techPlansApi.list().catch(() => null),
          sportsApi.list().catch(() => null),
          competitionsApi.list().catch(() => null),
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

        if (sportsData) {
          setSports(sportsData)
        }

        if (competitionsData) {
          setCompetitions(competitionsData)
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
  }, [user])

  const prevRoleRef = useRef<Role | null>(null)
  const prevUserIdRef = useRef<string | null>(null)
  const optimisticPatchesRef = useRef<Map<number, Partial<Event>>>(new Map())
  const [optimisticVersion, setOptimisticVersion] = useState(0)

  const applyOptimisticEvent = useCallback((patch: Partial<Event> & { id: number }) => {
    optimisticPatchesRef.current.set(patch.id, { ...optimisticPatchesRef.current.get(patch.id), ...patch })
    setOptimisticVersion(v => v + 1)
  }, [])

  const revertOptimisticEvent = useCallback((id: number) => {
    optimisticPatchesRef.current.delete(id)
    setOptimisticVersion(v => v + 1)
  }, [])

  useEffect(() => {
    if (!user) return
    // Skip only when BOTH role AND user are unchanged (e.g. same-role navigation after initial load)
    if (prevRoleRef.current === activeRole && prevUserIdRef.current === user.id) return
    prevRoleRef.current = activeRole
    prevUserIdRef.current = user.id
    const fetchSettings = async () => {
      try {
        const settingsData = await settingsApi.getApp(activeRole)
        if (settingsData.eventFields) {
          setEventFields(settingsData.eventFields)
        }
        if (settingsData.crewFields) {
          setCrewFields(settingsData.crewFields)
        }
        if (settingsData.orgConfig) {
          // NOTE: orgConfig.channels is deprecated — ChannelSelect fetches directly from the Channel API.
          // Other consumers (AutoFillRulesPanel, etc.) should use channelsApi instead.
          setOrgConfig(settingsData.orgConfig)
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
  }, [activeRole, user])

  const { on } = useSocket()

  useEffect(() => {
    if (!user) return
    const unsubCreated = on('event:created', (event: Event) => {
      setEvents(prev => prev.some(e => e.id === (event as Event).id) ? prev : [...prev, event as Event])
    })
    const unsubUpdated = on('event:updated', (event: Event) => {
      setEvents(prev => prev.map(e => e.id === (event as Event).id ? event as Event : e))
    })
    const unsubDeleted = on('event:deleted', ({ id }: { id: number }) => {
      setEvents(prev => prev.filter(e => e.id !== id))
    })
    // Tech plan socket events — keep app-level state in sync
    const unsubPlanCreated = on('techPlan:created', (plan: TechPlan) => {
      setTechPlans(prev => prev.some(p => p.id === (plan as TechPlan).id) ? prev : [...prev, plan as TechPlan])
    })
    const unsubPlanUpdated = on('techPlan:updated', (plan: TechPlan) => {
      setTechPlans(prev => prev.map(p => p.id === (plan as TechPlan).id ? plan as TechPlan : p))
    })
    const unsubPlanDeleted = on('techPlan:deleted', ({ id }: { id: number }) => {
      setTechPlans(prev => prev.filter(p => p.id !== id))
    })
    const unsubEncoderSwapped = on('encoder:swapped', ({ planId, plan }: { planId: number; plan: TechPlan }) => {
      setTechPlans(prev => prev.map(p => p.id === planId ? plan as TechPlan : p))
    })
    return () => {
      unsubCreated()
      unsubUpdated()
      unsubDeleted()
      unsubPlanCreated()
      unsubPlanUpdated()
      unsubPlanDeleted()
      unsubEncoderSwapped()
    }
  }, [user, on])

  const handleSaveEvent = useCallback(
    async (ev: Event): Promise<Event | null> => {
      const existingIndex = events.findIndex((e) => e.id === ev.id)
      const isUpdate = existingIndex >= 0
      const snapshot = isUpdate ? events[existingIndex] : null

      try {
        if (isUpdate) {
          const updated = await eventsApi.update(ev.id, ev)
          setEvents((prev) => prev.map((e) => (e.id === ev.id ? (updated as Event) : e)))
          toast.success('Event updated')
          return updated as Event
        } else {
          const created = await eventsApi.create(ev)
          // Socket 'event:created' handles adding to state — only append if no socket
          // Use a dedup check in case socket already delivered it
          setEvents((prev) => {
            if (prev.some(e => e.id === (created as Event).id)) return prev
            return [...prev, created as Event]
          })
          toast.success('Event created')
          return created as Event
        }
      } catch (error) {
        console.error('Failed to save event:', error)
        if (isUpdate && snapshot) {
          setEvents((prev) => prev.map((e) => (e.id === ev.id ? snapshot : e)))
        }
        toast.error('Save failed — could not reach server')
        return null
      }
    },
    [events, toast]
  )

  const eventsWithPatches = useMemo(
    () =>
      events.map(e => {
        const patch = optimisticPatchesRef.current.get(e.id)
        return patch ? { ...e, ...patch } : e
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, optimisticVersion]
  )

  const filteredEvents = useMemo(() => {
    if (!searchQuery) return eventsWithPatches
    const q = searchQuery.toLowerCase()
    return eventsWithPatches.filter(
      (e) =>
        e.participants?.toLowerCase().includes(q) ||
        e.content?.toLowerCase().includes(q) ||
        sports.find((s) => s.id === e.sportId)?.name.toLowerCase().includes(q) ||
        competitions.find((c) => c.id === e.competitionId)?.name.toLowerCase().includes(q)
    )
  }, [eventsWithPatches, searchQuery, sports, competitions])

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
        events: eventsWithPatches,
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
        applyOptimisticEvent,
        revertOptimisticEvent,
        filteredEvents,
        sports,
        competitions,
        orgConfig,
        setOrgConfig,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}
