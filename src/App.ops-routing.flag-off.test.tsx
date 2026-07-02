/**
 * Ops shell routing — opsRedesign flag OFF (A-2-T1, ADR-012).
 * Contract: docs/governance/contracts/OpsShell.md (OpsShell v1).
 *
 * Lives in its OWN file (split from the flag-on tests by the A-2-T1 test audit):
 * vitest gives each file a fresh module registry, so the "ops module never evaluated"
 * spy below can never be latched by a flag-ON test resolving the lazy chunk.
 *
 * The absent-env default-OFF behavior of the REAL flags module is pinned in
 * src/flags.test.ts — here the flag is mocked OFF to drive the routing.
 *
 * jsdom limits: this proves MODULE-level isolation (the lazy import factory never
 * runs). Network-level "no ops chunk fetched" verification is A-5 E2E scope.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  opsShellEvaluated: vi.fn(),
  user: null as null | { id: number; name: string; role: string },
}))

// Spy on ops-chunk module evaluation while keeping the real implementation.
vi.mock('./components/ops/OpsShell', async (importOriginal) => {
  hoisted.opsShellEvaluated()
  return await importOriginal<typeof import('./components/ops/OpsShell')>()
})

vi.mock('./flags', () => ({
  isOpsRedesignEnabled: vi.fn(() => false),
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
    sports: [],
    competitions: [],
    setEvents: vi.fn(),
    orgConfig: {},
  }),
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

describe('opsRedesign flag OFF', () => {
  it('unauthenticated /ops → login, ops module never evaluated', async () => {
    renderAt('/ops')

    // settle the render fully before the negative assert, so a wrongly-initiated
    // mid-render dynamic import cannot escape the check
    await screen.findByTestId('login')
    expect(hoisted.opsShellEvaluated).not.toHaveBeenCalled()
  })

  it('authenticated /ops → redirected to /dashboard via the legacy catch-all', async () => {
    hoisted.user = { id: 1, name: 'Pat', role: 'planner' }

    renderAt('/ops')

    expect(await screen.findByTestId('legacy-dashboard', {}, LAZY_RESOLVE_TIMEOUT)).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/dashboard')
    expect(hoisted.opsShellEvaluated).not.toHaveBeenCalled()
  })
})
