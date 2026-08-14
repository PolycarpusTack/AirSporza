/**
 * Fm shell routing — fmShell flag OFF (FM1-2-T1, ADR-020).
 * Structural copy of App.ops-routing.flag-off.test.tsx (A-2-T1 precedent) —
 * sibling file, not shared — Rule of Three.
 *
 * Lives in its OWN file, split from the flag-on tests: vitest gives each file
 * a fresh module registry, so the "fm module never evaluated" spy below can
 * never be latched by a flag-ON test resolving the lazy chunk.
 *
 * The absent-env default-OFF behavior of the REAL flags module is pinned in
 * src/flags.test.ts — here the flag is mocked OFF to drive the routing.
 *
 * jsdom limits: this proves MODULE-level isolation (the lazy import factory
 * never runs) — the AC's "no fm chunk loads" network-level assertion, at the
 * same fidelity as the ops A-5 AC-5 precedent (true network-level "chunk
 * never fetched" verification is E2E scope, not yet built for FM — see the
 * env-file judgment call in this task's hand-off).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  fmShellEvaluated: vi.fn(),
  user: null as null | { id: number; name: string; role: string },
}))

// Spy on fm-chunk module evaluation while keeping the real implementation.
vi.mock('./components/fm/FmShell', async (importOriginal) => {
  hoisted.fmShellEvaluated()
  return await importOriginal<typeof import('./components/fm/FmShell')>()
})

vi.mock('./flags', () => ({
  isOpsRedesignEnabled: vi.fn(() => false),
  isFmShellEnabled: vi.fn(() => false),
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

describe('fmShell flag OFF', () => {
  it('unauthenticated /fm → login, fm module never evaluated', async () => {
    renderAt('/fm')

    // settle the render fully before the negative assert, so a wrongly-initiated
    // mid-render dynamic import cannot escape the check
    await screen.findByTestId('login')
    expect(hoisted.fmShellEvaluated).not.toHaveBeenCalled()
  })

  it('authenticated /fm → redirected to /dashboard via the legacy catch-all, fm module never evaluated', async () => {
    hoisted.user = { id: 1, name: 'Pat', role: 'planner' }

    renderAt('/fm')

    expect(await screen.findByTestId('legacy-dashboard', {}, LAZY_RESOLVE_TIMEOUT)).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/dashboard')
    expect(hoisted.fmShellEvaluated).not.toHaveBeenCalled()
  })
})
