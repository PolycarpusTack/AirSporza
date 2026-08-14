/**
 * FmShell chrome/nav/placeholder tests (FM1-2-T1, ADR-020 · README §Shell (all screens)).
 * Structural copy of OpsShell.test.tsx's chrome/routing coverage — sibling
 * file, not shared — Rule of Three. Token names per ops-tokens v3 —
 * assertions check var() references, never hex.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

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
  it('redirects the /fm index to /fm/home', () => {
    renderShell('/fm')

    expect(currentPath()).toBe('/fm/home')
    expect(screen.getByTestId('fm-screen-home')).toBeTruthy()
  })

  it('falls back to /fm/home for unknown segments', () => {
    renderShell('/fm/bogus')

    expect(currentPath()).toBe('/fm/home')
  })

  it.each(FM_NAV_ITEMS)('nav item $id reaches its placeholder panel', async (item) => {
    const user = userEvent.setup()
    renderShell('/fm')

    await user.click(screen.getByTestId(`fm-nav-${item.id}`))

    expect(currentPath()).toBe(`${FM_BASE}/${item.id}`)
    expect(screen.getByTestId(`fm-screen-${item.id}`)).toBeTruthy()
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

  it('+ NEW and CONTINUE are non-functional placeholders (disabled — FM1-6/FM1-5 wire them)', () => {
    renderShell()

    expect(screen.getByTestId('fm-new-button').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('fm-continue-button').hasAttribute('disabled')).toBe(true)
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
