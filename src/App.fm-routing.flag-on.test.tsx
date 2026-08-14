/**
 * Fm shell routing — fmShell flag ON (FM1-2-T1, ADR-020).
 * Structural copy of App.ops-routing.flag-on.test.tsx (A-2-T1 precedent) —
 * sibling file, not shared — Rule of Three.
 *
 * Lives in its OWN file, split from the flag-off tests: these tests resolve
 * the lazy fm chunk, which would latch the flag-off file's "module never
 * evaluated" spy if they shared a module registry.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  fmShellEvaluated: vi.fn(),
  user: null as null | { id: number; name: string; role: string },
}))

// Positive-case spy: with the flag ON and a user, the fm chunk MUST load.
vi.mock('./components/fm/FmShell', async (importOriginal) => {
  hoisted.fmShellEvaluated()
  return await importOriginal<typeof import('./components/fm/FmShell')>()
})

vi.mock('./flags', () => ({
  isOpsRedesignEnabled: vi.fn(() => false),
  isFmShellEnabled: vi.fn(() => true),
}))

// Auth under per-test control (matches PlannerView.undoRedo / A-2-T1 precedent).
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
    events: [],
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

describe('fmShell flag ON', () => {
  it('unauthenticated /fm → login (auth guard before shell)', () => {
    renderAt('/fm')

    expect(screen.getByTestId('login')).toBeTruthy()
  })

  it('authenticated /fm → lands on /fm/home with the fm chrome', async () => {
    hoisted.user = { id: 1, name: 'Pat', role: 'planner' }

    renderAt('/fm')

    expect(await screen.findByTestId('fm-screen-home', {}, LAZY_RESOLVE_TIMEOUT)).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/fm/home')
    expect(screen.getByText('PLANZA/FM')).toBeTruthy() // chrome brand
    expect(hoisted.fmShellEvaluated).toHaveBeenCalled()
  })

  it('authenticated deep link /fm/crew renders the crew placeholder, never a 404', async () => {
    hoisted.user = { id: 1, name: 'Pat', role: 'planner' }

    renderAt('/fm/crew')

    expect(await screen.findByTestId('fm-screen-crew', {}, LAZY_RESOLVE_TIMEOUT)).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/fm/crew')
  })

  it('authenticated unknown fm path falls back to /fm/home, never a crash', async () => {
    hoisted.user = { id: 1, name: 'Pat', role: 'planner' }

    renderAt('/fm/does-not-exist')

    expect(await screen.findByTestId('fm-screen-home', {}, LAZY_RESOLVE_TIMEOUT)).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/fm/home')
  })
})
