import { useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { RefreshCw, LayoutGrid } from 'lucide-react'
import { FieldConfigurator, DashboardCustomizer, DynamicEventForm } from './components/forms'
import { SettingsModal } from './components/settings/SettingsModal'
import { Header } from './components/Header'
import { PlannerView, SportsWorkspace, ContractsView, AdminView } from './views'
import { DevLogin, OAuthLogin } from './components/Login'
import { AuthCallback } from './components/AuthCallback'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { AppProvider, useApp } from './components/AppProvider'
import { useAuth } from './hooks'
import type { Event } from './data/types'

function AppContent() {
  const {
    activeRole,
    setActiveRole,
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
  } = useApp()

  const [showEventForm, setShowEventForm] = useState(false)
  const [editEvent, setEditEvent] = useState<Event | null>(null)
  const [showFieldConfig, setShowFieldConfig] = useState<'event' | 'crew' | null>(null)
  const [showDashConfig, setShowDashConfig] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'event' | 'crew' | 'dashboard' | 'integrations'>('event')
  const [integrationScope, setIntegrationScope] = useState<'sports' | 'competitions' | 'teams' | 'events' | 'fixtures' | 'live'>('events')

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
    <div style={{ fontFamily: 'var(--font-display)', background: 'var(--bg)', minHeight: '100vh' }}>
      <Header
        activeRole={activeRole}
        roleConfig={roleConfig}
        user={user}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRoleChange={setActiveRole}
        onNewEvent={() => {
          setEditEvent(null)
          setShowEventForm(true)
        }}
        onOpenSettings={openSettings}
        onLogout={logout}
      />

      <div className="h-0.5" style={{ background: roleConfig[activeRole].accent }} />

      <div className="container-sport pt-5 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">
              {activeRole === 'planner' && 'Network Planner Dashboard'}
              {activeRole === 'sports' && 'Sports Department Workspace'}
              {activeRole === 'contracts' && 'Contract Status Dashboard'}
              {activeRole === 'admin' && 'Admin Dashboard'}
            </h2>
            <p className="text-sm text-text-2 mt-0.5">
              {activeRole === 'planner' && 'Scheduled sports across linear channels'}
              {activeRole === 'sports' && 'Technical planning & crew management'}
              {activeRole === 'contracts' && 'Rights, contracts & publication conditions'}
              {activeRole === 'admin' && 'System administration & configuration'}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            {(activeRole === 'planner' || activeRole === 'sports') && (
              <button
                onClick={() => openSettings('integrations', activeRole === 'sports' ? 'live' : 'events')}
                className="btn btn-s btn-sm"
              >
                <RefreshCw className="w-4 h-4" /> Sync Data
              </button>
            )}
            <button
              onClick={() => openSettings('dashboard')}
              className="btn btn-g btn-sm text-text-3"
            >
              <LayoutGrid className="w-4 h-4" /> Customize View
            </button>
          </div>
        </div>
      </div>

      <main className="container-sport py-4">
        {activeRole === 'planner' && (
          <PlannerView events={filteredEvents} widgets={currentWidgets} loading={loading} />
        )}
        {activeRole === 'sports' && (
          <SportsWorkspace
            events={filteredEvents}
            techPlans={techPlans}
            setTechPlans={setTechPlans}
            crewFields={crewFields}
            widgets={currentWidgets}
          />
        )}
        {activeRole === 'contracts' && <ContractsView widgets={currentWidgets} />}
        {activeRole === 'admin' && <AdminView widgets={currentWidgets} />}
      </main>

      {showEventForm && (
        <DynamicEventForm
          eventFields={eventFields}
          onClose={() => {
            setShowEventForm(false)
            setEditEvent(null)
          }}
          onSave={handleSaveEvent}
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
            <Navigate to="/" replace />
          ) : (
            import.meta.env.PROD ? <OAuthLogin /> : <DevLogin />
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
      <ToastProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
