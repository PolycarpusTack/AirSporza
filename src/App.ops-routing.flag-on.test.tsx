/**
 * Ops shell routing — opsRedesign flag ON (A-2-T1, ADR-012).
 * Contract: docs/governance/contracts/OpsShell.md (OpsShell v1).
 *
 * Lives in its OWN file, split from the flag-off tests (A-2-T1 test audit): these
 * tests resolve the lazy ops chunk, which would latch the flag-off file's
 * "module never evaluated" spy if they shared a module registry.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  opsShellEvaluated: vi.fn(),
  user: null as null | { id: number; name: string; role: string },
}))

// Positive-case spy: with the flag ON and a user, the ops chunk MUST load.
vi.mock('./components/ops/OpsShell', async (importOriginal) => {
  hoisted.opsShellEvaluated()
  return await importOriginal<typeof import('./components/ops/OpsShell')>()
})

vi.mock('./flags', () => ({
  isOpsRedesignEnabled: vi.fn(() => true),
}))

// Auth under per-test control (matches PlannerView.undoRedo precedent).
vi.mock('./hooks', () => ({
  useAuth: () => ({ user: hoisted.user, loading: false, logout: vi.fn() }),
}))

// Legacy chrome + heavy legacy modules stubbed — not under test here.
vi.mock('./components/layout/Header', () => ({ Header: () => <div data-testid="legacy-header" /> }))
vi.mock('./components/layout/Sidebar', () => ({ Sidebar: () => <div data-testid="legacy-sidebar" /> }))
vi.mock('./components/Login', () => ({
  DevLogin: () => <div data-testid="login" />,
  OAuthLogin: () => <div data-testid="login" />,
}))
vi.mock('./components/Toast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }))
vi.mock('./components/forms', () => ({
  FieldConfigModal: () => null,
  DashboardCustomizer: () => null,
  DynamicEventForm: () => null,
}))
vi.mock('./components/settings/SettingsModal', () => ({ SettingsModal: () => null }))
vi.mock('./pages/DashboardView', () => ({
  DashboardView: () => <div data-testid="legacy-dashboard" />,
}))
vi.mock('./context/AppProvider', () => ({
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
  useApp: () => ({
    activeRole: 'planner',
    filteredEvents: [],
    techPlans: [],
    setTechPlans: vi.fn(),
    crewFields: [],
    loading: false,
    searchQuery: '',
    setSearchQuery: vi.fn(),
    eventFields: [],
    setEventFields: vi.fn(),
    setCrewFields: vi.fn(),
    currentWidgets: [],
    setCurrentWidgets: vi.fn(),
    roleConfig: { planner: { label: 'Planner' } },
    handleSaveEvent: vi.fn(),
    events: [], // consumed by the real ScheduleScreen (A-3-T2)
    sports: [],
    competitions: [],
    setEvents: vi.fn(),
    orgConfig: {},
  }),
}))

// The real ScheduleScreen fetches contracts on mount — stub the services barrel.
vi.mock('./services', () => ({
  contractsApi: { list: vi.fn(async () => []) },
  eventsApi: {}, // App.tsx imports it (used only inside closed modal callbacks)
}))

import { AppRoutes } from './App'

// Lazy chunks resolve slowly on loaded CI/dev machines — default 1s findBy flakes.
const LAZY_RESOLVE_TIMEOUT = { timeout: 10_000 }

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  )

beforeEach(() => {
  hoisted.user = null
})

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
  document.documentElement.removeAttribute('data-theme')
  localStorage.clear()
})

describe('opsRedesign flag ON', () => {
  it('unauthenticated /ops → login (auth guard before shell)', () => {
    renderAt('/ops')

    expect(screen.getByTestId('login')).toBeTruthy()
  })

  it('authenticated /ops → lands on /ops/schedule with the ops chrome', async () => {
    hoisted.user = { id: 1, name: 'Pat', role: 'planner' }

    renderAt('/ops')

    expect(await screen.findByTestId('ops-screen-schedule', {}, LAZY_RESOLVE_TIMEOUT)).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/ops/schedule')
    expect(screen.getByText('PLANZA')).toBeTruthy() // chrome brand
    expect(hoisted.opsShellEvaluated).toHaveBeenCalled()
  })

  it('authenticated deep link /ops/rights renders the rights placeholder', async () => {
    hoisted.user = { id: 1, name: 'Pat', role: 'planner' }

    renderAt('/ops/rights')

    expect(await screen.findByTestId('ops-screen-rights', {}, LAZY_RESOLVE_TIMEOUT)).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/ops/rights')
  })
})
