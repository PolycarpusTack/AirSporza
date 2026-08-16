/**
 * FmShell chrome/nav/placeholder tests (FM1-2-T1, ADR-020 · README §Shell (all screens)).
 * Structural copy of OpsShell.test.tsx's chrome/routing coverage — sibling
 * file, not shared — Rule of Three. Token names per ops-tokens v3 —
 * assertions check var() references, never hex.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// FM1-4-T1 wired FmHomeScreen into the `home` override — FmShell's OWN tests
// only care that routing/chrome/badges work, not Home's data layer, so its
// data hook is stubbed here (Home's own render-state coverage lives in
// FmHomeScreen.test.tsx; its fetch/derivation wiring lives in
// useFmActionItems.test.ts).
vi.mock('./useFmActionItems', () => ({
  useFmActionItems: () => ({ items: [], weekEvents: [], isSettled: true, resolve: vi.fn(), refresh: vi.fn() }),
}))

// FM1-6-T1: FmTopBar now calls useApp() to source eventFields/sports/
// handleSaveEvent for FmCreateModal. FmShell's OWN tests only care that the
// wiring reaches FmCreateModal (it mounts, it's the real component) — its
// own composition/interaction contract is FmCreateModal.test.tsx's job, so
// DynamicEventForm/RegistryCreateModal are left real (unmocked) here; they
// simply won't be exercised by these shell-level assertions.
// DynamicEventForm itself also calls useApp() (for orgConfig/competitions) —
// it's left real/unmocked here (only FmCreateModal is FmCreateModal.test.tsx's
// concern), so this fake must be complete enough for it to render without
// crashing, not just satisfy FmCreateModal's own three props.
const handleSaveEventMock = vi.fn()
vi.mock('../../context/AppProvider', () => ({
  useApp: () => ({
    eventFields: [],
    sports: [],
    competitions: [],
    orgConfig: { phases: [], categories: [], complexes: [] },
    handleSaveEvent: handleSaveEventMock,
  }),
}))

import { FmShell, FM_BASE, FM_NAV, type FmNavId } from './FmShell'

function LocationProbe() {
  const location = useLocation()
  return (
    <>
      <span data-testid="location">{location.pathname}</span>
      <span data-testid="location-search">{location.search}</span>
    </>
  )
}

const renderShell = (initialPath = '/fm', navBadges?: Partial<Record<FmNavId, number>>) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/fm/*" element={<FmShell navBadges={navBadges} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )

const currentPath = () => screen.getByTestId('location').textContent

const FM_NAV_ITEMS = FM_NAV.flatMap((section) => section.items)

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
})

describe('FM_NAV registry (Story FM1-2 Interfaces contract)', () => {
  it('has the four contracted sections, in order', () => {
    expect(FM_NAV.map((s) => s.section)).toEqual(['OVERVIEW', 'PLANNING', 'SPORT', 'RESOURCES'])
  })

  it('mount point is FM_BASE = /fm (ADR-020 contractual mount point)', () => {
    expect(FM_BASE).toBe('/fm')
  })

  it('every nav item has a non-empty id and label', () => {
    for (const item of FM_NAV_ITEMS) {
      expect(item.id.length).toBeGreaterThan(0)
      expect(item.label.length).toBeGreaterThan(0)
    }
  })
})

describe('routing inside the shell (never a 404, never a crash — Story FM1-2 AC)', () => {
  it('redirects the /fm index to /fm/home (FM1-4: home now renders the real FmHomeScreen, not a placeholder)', () => {
    renderShell('/fm')

    expect(currentPath()).toBe('/fm/home')
    expect(screen.getByTestId('fm-home-screen')).toBeTruthy()
  })

  it('falls back to /fm/home for unknown segments', () => {
    renderShell('/fm/bogus')

    expect(currentPath()).toBe('/fm/home')
  })

  it.each(FM_NAV_ITEMS.filter((item) => item.id !== 'home'))('nav item $id reaches its placeholder panel', async (item) => {
    const user = userEvent.setup()
    renderShell('/fm')

    await user.click(screen.getByTestId(`fm-nav-${item.id}`))

    expect(currentPath()).toBe(`${FM_BASE}/${item.id}`)
    expect(screen.getByTestId(`fm-screen-${item.id}`)).toBeTruthy()
  })

  it('nav item home reaches the real FmHomeScreen (FM1-4 override, not a placeholder)', async () => {
    const user = userEvent.setup()
    renderShell('/fm/crew')

    await user.click(screen.getByTestId('fm-nav-home'))

    expect(currentPath()).toBe(`${FM_BASE}/home`)
    expect(screen.getByTestId('fm-home-screen')).toBeTruthy()
    expect(screen.queryByTestId('fm-screen-home')).toBeNull()
  })

  it('a not-yet-built nav item (e.g. Schedule board) renders a placeholder, not a crash', async () => {
    const user = userEvent.setup()
    renderShell('/fm')

    await user.click(screen.getByTestId('fm-nav-schedule'))

    const panel = screen.getByTestId('fm-screen-schedule')
    expect(panel).toBeTruthy()
    expect(within(panel).getByText(/Schedule board/i)).toBeTruthy()
  })
})

describe('chrome (README §Shell (all screens), ops-tokens v3)', () => {
  it('renders the sidebar brand block "PLANZA/FM"', () => {
    renderShell()

    expect(screen.getByText('PLANZA/FM')).toBeTruthy()
  })

  it('renders all four section labels', () => {
    renderShell()

    for (const section of FM_NAV) {
      expect(screen.getByText(section.section)).toBeTruthy()
    }
  })

  it('renders every nav item label', () => {
    renderShell()

    for (const item of FM_NAV_ITEMS) {
      expect(screen.getByTestId(`fm-nav-${item.id}`).textContent).toContain(item.label)
    }
  })

  it('active nav item is aria-current=page; inactive is not', () => {
    renderShell('/fm/crew')

    expect(screen.getByTestId('fm-nav-crew').getAttribute('aria-current')).toBe('page')
    expect(screen.getByTestId('fm-nav-home').getAttribute('aria-current')).toBeNull()
  })

  it('renders the 52px top bar: date block, LIVE pill, + NEW, CONTINUE with count chip', () => {
    renderShell()

    expect(screen.getByTestId('fm-date-block')).toBeTruthy()
    expect(screen.getByTestId('fm-live-pill')).toBeTruthy()
    expect(screen.getByTestId('fm-new-button')).toBeTruthy()
    expect(screen.getByTestId('fm-continue-button')).toBeTruthy()
    expect(screen.getByTestId('fm-continue-count')).toBeTruthy()
  })

  it('+ NEW is enabled (FM1-6-T1 wires it — no longer the disabled placeholder)', () => {
    renderShell()

    expect(screen.getByTestId('fm-new-button').hasAttribute('disabled')).toBe(false)
  })
})

describe('+ NEW (Story FM1-6 AC — opens FmCreateModal, not a placeholder)', () => {
  it('clicking + NEW mounts the real FmCreateModal with TRANSMISSION active by default', async () => {
    const user = userEvent.setup()
    renderShell()

    expect(screen.queryByTestId('fm-create-modal')).toBeNull()

    await user.click(screen.getByTestId('fm-new-button'))

    expect(screen.getByTestId('fm-create-modal')).toBeTruthy()
    expect(screen.getByTestId('fm-create-tab-transmission').getAttribute('aria-selected')).toBe('true')
  })

  it('closing FmCreateModal (its own ✕) returns to no modal, no navigation side effect', async () => {
    const user = userEvent.setup()
    renderShell('/fm/crew')

    await user.click(screen.getByTestId('fm-new-button'))
    await user.click(screen.getByTestId('fm-create-close'))

    expect(screen.queryByTestId('fm-create-modal')).toBeNull()
    expect(currentPath()).toBe(`${FM_BASE}/crew`)
  })
})

describe('CONTINUE (Story FM1-5 AC — wired via useContinue(), not a placeholder)', () => {
  it('is enabled and shows the live unresolved count from useFmActionItems (mocked: [] → 0)', () => {
    renderShell()

    expect(screen.getByTestId('fm-continue-button').hasAttribute('disabled')).toBe(false)
    expect(screen.getByTestId('fm-continue-count').textContent).toBe('0')
  })

  it('clicking CONTINUE with an empty queue shows an ALL CLEAR toast and does not navigate', async () => {
    const user = userEvent.setup()
    renderShell('/fm/crew')

    await user.click(screen.getByTestId('fm-continue-button'))

    expect(currentPath()).toBe(`${FM_BASE}/crew`)
    expect(screen.getByTestId('fm-toast').textContent).toBe('ALL CLEAR')
  })
})

describe('nav badges (Story FM1-2 AC: red count badge on Home; sibling FmNavBadgeContext)', () => {
  it('renders a badge from the navBadges seed prop', () => {
    renderShell('/fm', { home: 4 })

    expect(screen.getByTestId('fm-nav-badge-home').textContent).toBe('4')
  })

  it('renders no badge element when no count is set', () => {
    renderShell()

    expect(screen.queryByTestId('fm-nav-badge-home')).toBeNull()
  })

  // Live context-publish integration (a real screen calling useSetNavBadge()
  // to override the seed) is deferred: FM1-2 ships no real screens yet (every
  // route is PlaceholderPanel) — mirrors OpsShell's own precedent, where the
  // equivalent SYNC-badge integration test only landed at D-1-T2 alongside
  // the real SyncScreen, not at the A-2-T1 shell task. The context plumbing
  // itself (default no-op, Provider fan-in) is unit-tested in isolation in
  // fmNavBadges.test.tsx.
})
