import { lazy, Suspense, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { FieldConfigurator, DashboardCustomizer, DynamicEventForm } from './components/forms'
import { SettingsModal } from './components/settings/SettingsModal'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { RequireRole } from './components/auth/RequireRole'
import { DevLogin, OAuthLogin } from './components/Login'
import { AuthCallback } from './components/auth/AuthCallback'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppProvider, useApp } from './context/AppProvider'
import { useAuth } from './hooks'
import type { Event } from './data/types'
import { eventsApi } from './services'
import { useToast } from './components/Toast'

const PlannerView = lazy(() =>
  import('./pages/PlannerView').then((m) => ({ default: m.PlannerView }))
)
const SportsWorkspace = lazy(() =>
  import('./pages/SportsWorkspace').then((m) => ({ default: m.SportsWorkspace }))
)
const ContractsView = lazy(() =>
  import('./pages/ContractsView').then((m) => ({ default: m.ContractsView }))
)
const ImportView = lazy(() =>
  import('./pages/ImportView').then((m) => ({ default: m.ImportView }))
)
const SettingsView = lazy(() =>
  import('./pages/SettingsView').then((m) => ({ default: m.SettingsView }))
)

function PageSkeleton() {
  return (
    <div className="p-6 space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 bg-surface-2 rounded-xl animate-pulse" />
      ))}
    </div>
  )
}

function AppContent() {
  const {
    activeRole,
    filteredEvents,
    techPlans,
    setTechPlans,
    crewFields,
    loading,
    searchQuery,
    setSearchQuery,
    eventFields,
    setEventFields,
    setCrewFields,
    currentWidgets,
    setCurrentWidgets,
    roleConfig,
    handleSaveEvent,
    sports,
    competitions,
    setEvents,
  } = useApp()

  const toast = useToast()
  const [showEventForm, setShowEventForm] = useState(false)
  const [editEvent, setEditEvent] = useState<Event | null>(null)
  const [eventPrefill, setEventPrefill] = useState<Partial<Record<string, string>> | null>(null)
  const [multiDayPrefill, setMultiDayPrefill] = useState<{ dates: string[]; startTimeBE: string; duration: string } | null>(null)
  const [scrollToDate, setScrollToDate] = useState<string | null>(null)
  const [showFieldConfig, setShowFieldConfig] = useState<'event' | 'crew' | null>(null)
  const [showDashConfig, setShowDashConfig] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'event' | 'crew' | 'dashboard' | 'integrations'>('event')
  const [integrationScope, setIntegrationScope] = useState<
    'sports' | 'competitions' | 'teams' | 'events' | 'fixtures' | 'live'
  >('events')

  const { user, logout } = useAuth()

  const openSettings = (
    tab: 'event' | 'crew' | 'dashboard' | 'integrations',
    scope: 'sports' | 'competitions' | 'teams' | 'events' | 'fixtures' | 'live' = 'events'
  ) => {
    setSettingsTab(tab)
    setIntegrationScope(scope)
    setShowSettings(true)
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar roleConfig={roleConfig} user={user} onLogout={logout} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          activeRole={activeRole}
          roleConfig={roleConfig}
          user={user}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNewEvent={() => {
            setEditEvent(null)
            setShowEventForm(true)
          }}
          onOpenSettings={openSettings}
          onLogout={logout}
        />

        <main className="flex-1 overflow-auto">
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route
                path="/planner"
                element={
                  <div className="p-4 sm:p-5">
                    <PlannerView
                      widgets={currentWidgets}
                      loading={loading}
                      onEventClick={(ev) => { setEditEvent(ev); setShowEventForm(true) }}
                      scrollToDate={scrollToDate}
                      onDrawCreate={(prefill) => {
                        setEditEvent(null)
                        setEventPrefill(prefill)
                        setShowEventForm(true)
                      }}
                      onMultiDayCreate={(prefill) => {
                        setEditEvent(null)
                        setMultiDayPrefill(prefill)
                        setEventPrefill({ startTimeBE: prefill.startTimeBE, duration: prefill.duration })
                        setShowEventForm(true)
                      }}
                    />
                  </div>
                }
              />
              <Route
                path="/sports"
                element={
                  <RequireRole roles={['admin', 'sports', 'planner']}>
                    <div className="p-4 sm:p-5">
                      <SportsWorkspace
                        events={filteredEvents}
                        techPlans={techPlans}
                        setTechPlans={setTechPlans}
                        crewFields={crewFields}
                        widgets={currentWidgets}
                        sports={sports}
                        competitions={competitions}
                        canEdit={user?.role === 'sports' || user?.role === 'admin'}
                      />
                    </div>
                  </RequireRole>
                }
              />
              <Route
                path="/contracts"
                element={
                  <RequireRole roles={['admin', 'contracts', 'planner']}>
                    <div className="p-4 sm:p-5">
                      <ContractsView widgets={currentWidgets} />
                    </div>
                  </RequireRole>
                }
              />
              <Route
                path="/import"
                element={
                  <RequireRole roles={['admin', 'planner']}>
                    <div className="p-4 sm:p-5">
                      <ImportView />
                    </div>
                  </RequireRole>
                }
              />
              <Route
                path="/settings/*"
                element={
                  <RequireRole roles={['admin']}>
                    <SettingsView widgets={currentWidgets} />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/*"
                element={
                  <RequireRole roles={['admin']}>
                    <SettingsView widgets={currentWidgets} />
                  </RequireRole>
                }
              />
              <Route path="*" element={<Navigate to="/planner" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {showEventForm && (
        <DynamicEventForm
          eventFields={eventFields}
          onClose={() => {
            setShowEventForm(false)
            setEditEvent(null)
            setEventPrefill(null)
            setMultiDayPrefill(null)
          }}
          prefill={eventPrefill}
          multiDayDates={multiDayPrefill?.dates}
          onSave={async (ev) => {
            const isCreate = !editEvent
            const saved = await handleSaveEvent(ev)
            if (isCreate && saved) {
              const rawDate = saved.startDateBE
              const dateStr = typeof rawDate === 'string' ? rawDate.split('T')[0] : (rawDate as Date).toISOString().split('T')[0]
              setScrollToDate(dateStr)
              // Clear after a tick so re-creates still trigger
              setTimeout(() => setScrollToDate(null), 100)
            }
          }}
          onBatchSave={async (events, seriesId) => {
            try {
              const created = await eventsApi.batchCreate(events, seriesId)
              setEvents(prev => {
                const existingIds = new Set(prev.map(e => e.id))
                const newEvents = (created as Event[]).filter(e => !existingIds.has(e.id))
                return newEvents.length > 0 ? [...prev, ...newEvents] : prev
              })
              if (created.length > 0) {
                const firstDate = typeof created[0].startDateBE === 'string'
                  ? created[0].startDateBE.split('T')[0]
                  : (created[0].startDateBE as Date).toISOString().split('T')[0]
                setScrollToDate(firstDate)
                setTimeout(() => setScrollToDate(null), 100)
              }
            } catch {
              toast.error('Failed to create event series')
            }
          }}
          editEvent={editEvent}
        />
      )}

      {showFieldConfig === 'event' && (
        <FieldConfigurator
          fields={eventFields}
          setFields={setEventFields}
          title="Configure Event Metadata Fields"
          onClose={() => setShowFieldConfig(null)}
        />
      )}

      {showFieldConfig === 'crew' && (
        <FieldConfigurator
          fields={crewFields}
          setFields={setCrewFields}
          title="Configure Crew / Technical Plan Fields"
          onClose={() => setShowFieldConfig(null)}
        />
      )}

      {showDashConfig && (
        <DashboardCustomizer
          widgets={currentWidgets}
          setWidgets={setCurrentWidgets}
          viewName={roleConfig[activeRole].label}
          onClose={() => setShowDashConfig(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          defaultTab={settingsTab}
          defaultIntegrationScope={integrationScope}
          userRole={user?.role}
          onOpenEventFields={() => setShowFieldConfig('event')}
          onOpenCrewFields={() => setShowFieldConfig('crew')}
          onOpenDashboard={() => setShowDashConfig(true)}
        />
      )}
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center">
        <div className="text-text-3">Loading...</div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/planner" replace />
          ) : import.meta.env.PROD ? (
            <OAuthLogin />
          ) : (
            <DevLogin />
          )
        }
      />
      <Route
        path="/*"
        element={
          user ? (
            <AppContent />
          ) : (
            <Navigate to="/login" state={{ from: location }} replace />
          )
        }
      />
    </Routes>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </ErrorBoundary>
  )
}

export default App
