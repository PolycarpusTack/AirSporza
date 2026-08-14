/**
 * FmHomeScreen — FM Home render-state tests (FM1-4-T1, README §1 · Story
 * FM1-4 AC). `useFmActionItems()` is MOCKED here (its own wiring/fetch
 * orchestration is useFmActionItems.test.ts's job) — this suite proves
 * render states: KPI tile permutations, inbox row states, detail-pane
 * states, and the resolve interaction as reflected from the hook's contract.
 *
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event } from '../../data/types'
import type { FmActionItem, UseFmActionItemsReturn } from './useFmActionItems'
import { FmNavBadgeContext, type SetNavBadge } from './fmNavBadges'

let hookReturn: UseFmActionItemsReturn
const resolveMock = vi.fn()

vi.mock('./useFmActionItems', () => ({
  useFmActionItems: () => hookReturn,
}))

import { FmHomeScreen } from './FmHomeScreen'

function makeItem(overrides: Partial<FmActionItem> & Pick<FmActionItem, 'kind' | 'key'>): FmActionItem {
  return {
    title: `Title for ${overrides.key}`,
    sub: `Sub for ${overrides.key}`,
    targetRoute: '/ops/schedule',
    targetParams: { event: '1' },
    resolved: false,
    ...overrides,
  }
}

const WEEK_EVENT = { id: 1, isLive: false } as unknown as Event
const LIVE_WEEK_EVENT = { id: 2, isLive: true } as unknown as Event

function setHook(items: FmActionItem[], overrides?: Partial<UseFmActionItemsReturn>) {
  hookReturn = {
    items,
    weekEvents: [WEEK_EVENT],
    isSettled: true,
    resolve: resolveMock,
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location-search">{location.search}</span>
}

/** Also renders a `/ops/schedule` catch-all so CTA navigation is observable. */
function OpsProbe() {
  const location = useLocation()
  return <span data-testid="ops-location">{location.pathname + location.search}</span>
}

function renderScreen(initialPath = '/fm/home', navBadgeSpy?: SetNavBadge) {
  const tree = (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/fm/home" element={<FmHomeScreen />} />
        <Route path="/ops/*" element={<OpsProbe />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  )
  return render(navBadgeSpy ? <FmNavBadgeContext.Provider value={navBadgeSpy}>{tree}</FmNavBadgeContext.Provider> : tree)
}

beforeEach(() => {
  resolveMock.mockReset().mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('KPI tiles', () => {
  it('EVENTS THIS WEEK shows the total weekEvents count and live-productions sub', () => {
    setHook([], {
      weekEvents: [WEEK_EVENT, LIVE_WEEK_EVENT, { ...LIVE_WEEK_EVENT, id: 3 } as Event],
    })
    renderScreen()

    const tile = screen.getByTestId('fm-home-kpi-events')
    expect(within(tile).getByText('3')).toBeTruthy()
    expect(within(tile).getByText(/2 live productions/i)).toBeTruthy()
  })

  it('CREW CONFLICTS is 0/quiet/disabled when there are no CONFLICT items', () => {
    setHook([makeItem({ kind: 'RIGHTS', key: 'RIGHTS:competition:1' })])
    renderScreen()

    const tile = screen.getByTestId('fm-home-kpi-conflicts')
    expect(within(tile).getByText('0')).toBeTruthy()
    expect(tile.hasAttribute('disabled')).toBe(true)
  })

  it('CREW CONFLICTS shows the CONFLICT count in the danger color when > 0', () => {
    setHook([
      makeItem({ kind: 'CONFLICT', key: 'CONFLICT:event:1' }),
      makeItem({ kind: 'CONFLICT', key: 'CONFLICT:event:2' }),
    ])
    renderScreen()

    const tile = screen.getByTestId('fm-home-kpi-conflicts')
    const value = within(tile).getByText('2')
    expect(value.style.color).toBe('var(--alert-danger)')
    expect(tile.hasAttribute('disabled')).toBe(false)
  })

  it('RIGHTS EXPIRING shows the RIGHTS count in the warning color when > 0, green when 0', () => {
    setHook([makeItem({ kind: 'RIGHTS', key: 'RIGHTS:competition:1' })])
    renderScreen()
    const tile = screen.getByTestId('fm-home-kpi-rights')
    expect(within(tile).getByText('1').style.color).toBe('var(--alert-warning)')

    cleanup()
    setHook([])
    renderScreen()
    const tileEmpty = screen.getByTestId('fm-home-kpi-rights')
    expect(within(tileEmpty).getByText('0').style.color).toBe('var(--status-approved)')
  })

  it('UNPLACED EVENTS shows the UNPLACED count in the warning color when > 0, green when 0', () => {
    setHook([makeItem({ kind: 'UNPLACED', key: 'UNPLACED:event:1' })])
    renderScreen()
    const tile = screen.getByTestId('fm-home-kpi-unplaced')
    expect(within(tile).getByText('1').style.color).toBe('var(--alert-warning)')

    cleanup()
    setHook([])
    renderScreen()
    const tileEmpty = screen.getByTestId('fm-home-kpi-unplaced')
    expect(within(tileEmpty).getByText('0').style.color).toBe('var(--status-approved)')
  })

  it('clicking a non-empty KPI tile navigates to the first item of that kind', async () => {
    const user = userEvent.setup()
    setHook([
      makeItem({ kind: 'UNPLACED', key: 'UNPLACED:event:5', targetRoute: '/ops/planner', targetParams: { event: '5' } }),
    ])
    renderScreen()

    await user.click(screen.getByTestId('fm-home-kpi-unplaced'))

    expect(screen.getByTestId('ops-location').textContent).toBe('/ops/planner?event=5')
  })
})

describe('inbox rows', () => {
  it('renders ALL CLEAR when there are zero derived items', () => {
    setHook([])
    renderScreen()

    expect(screen.getByTestId('fm-home-empty')).toBeTruthy()
    expect(screen.getByText(/ALL CLEAR/i)).toBeTruthy()
  })

  it('renders one row per item with kind word, title, sub', () => {
    setHook([
      makeItem({ kind: 'CONFLICT', key: 'CONFLICT:event:1', title: 'Crew conflict — A', sub: 'Casey double-booked' }),
    ])
    renderScreen()

    const row = screen.getByTestId('fm-home-inbox-row-CONFLICT:event:1')
    expect(within(row).getByText('CONFLICT')).toBeTruthy()
    expect(within(row).getByText('Crew conflict — A')).toBeTruthy()
    expect(within(row).getByText('Casey double-booked')).toBeTruthy()
  })

  it('an unresolved row is full opacity with no ✓ prefix', () => {
    setHook([makeItem({ kind: 'CREW', key: 'CREW:event:1:role:director', resolved: false, title: 'Open role: Director' })])
    renderScreen()

    const row = screen.getByTestId('fm-home-inbox-row-CREW:event:1:role:director')
    expect(row.style.opacity).toBe('1')
    expect(within(row).queryByText(/^✓/)).toBeNull()
  })

  it('a resolved row renders at 45% opacity with a ✓ prefix, sorted after unresolved rows', () => {
    setHook([
      makeItem({ kind: 'CREW', key: 'CREW:event:1:role:director', resolved: true, title: 'Resolved role' }),
      makeItem({ kind: 'CONFLICT', key: 'CONFLICT:event:2', resolved: false, title: 'Still open' }),
    ])
    renderScreen()

    const resolvedRow = screen.getByTestId('fm-home-inbox-row-CREW:event:1:role:director')
    expect(resolvedRow.style.opacity).toBe('0.45')
    expect(within(resolvedRow).getByText(/^✓/)).toBeTruthy()

    const rows = screen.getAllByTestId(/^fm-home-inbox-row-/)
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      'fm-home-inbox-row-CONFLICT:event:2',
      'fm-home-inbox-row-CREW:event:1:role:director',
    ])
  })

  it('clicking a row selects it (updates ?inbox=<key>) and highlights it', async () => {
    const user = userEvent.setup()
    setHook([makeItem({ kind: 'CONFLICT', key: 'CONFLICT:event:1' })])
    renderScreen()

    await user.click(screen.getByTestId('fm-home-inbox-row-CONFLICT:event:1'))

    expect(screen.getByTestId('location-search').textContent).toBe('?inbox=CONFLICT%3Aevent%3A1')
    expect(screen.getByTestId('fm-home-inbox-row-CONFLICT:event:1').getAttribute('aria-selected')).toBe('true')
  })
})

describe('detail pane', () => {
  it('shows a quiet empty state when nothing is selected', () => {
    setHook([makeItem({ kind: 'CONFLICT', key: 'CONFLICT:event:1' })])
    renderScreen('/fm/home')

    expect(screen.getByTestId('fm-home-detail-empty')).toBeTruthy()
  })

  it('shows kind badge, title, body, primary CTA, and MARK RESOLVED for the selected item', () => {
    setHook([
      makeItem({
        kind: 'UNPLACED',
        key: 'UNPLACED:event:1',
        title: 'Unplaced: Team A vs Team B',
        sub: 'No channel or broadcast slot assigned',
        targetRoute: '/ops/planner',
        targetParams: { event: '1' },
      }),
    ])
    renderScreen('/fm/home?inbox=UNPLACED%3Aevent%3A1')

    const detail = screen.getByTestId('fm-home-detail')
    expect(within(detail).getByText('UNPLACED')).toBeTruthy()
    expect(within(detail).getByText('Unplaced: Team A vs Team B')).toBeTruthy()
    expect(within(detail).getByText('No channel or broadcast slot assigned')).toBeTruthy()
    expect(within(detail).getByTestId('fm-home-detail-cta')).toBeTruthy()
    expect(within(detail).getByTestId('fm-home-detail-resolve')).toBeTruthy()
  })

  it('an unknown ?inbox key silently shows no selection (empty state)', () => {
    setHook([makeItem({ kind: 'CONFLICT', key: 'CONFLICT:event:1' })])
    renderScreen('/fm/home?inbox=NOT-A-REAL-KEY')

    expect(screen.getByTestId('fm-home-detail-empty')).toBeTruthy()
  })

  it('clicking the primary CTA navigates to the item targetRoute with targetParams', async () => {
    const user = userEvent.setup()
    setHook([
      makeItem({
        kind: 'RIGHTS',
        key: 'RIGHTS:competition:7',
        targetRoute: '/ops/rights',
        targetParams: { record: 'competition:7' },
      }),
    ])
    renderScreen('/fm/home?inbox=RIGHTS%3Acompetition%3A7')

    await user.click(screen.getByTestId('fm-home-detail-cta'))

    expect(screen.getByTestId('ops-location').textContent).toBe('/ops/rights?record=competition%3A7')
  })
})

describe('MARK RESOLVED — optimistic update + revert (story error-flow AC)', () => {
  it('clicking MARK RESOLVED calls resolve() with the item key', async () => {
    const user = userEvent.setup()
    setHook([makeItem({ kind: 'UNPLACED', key: 'UNPLACED:event:1' })])
    renderScreen('/fm/home?inbox=UNPLACED%3Aevent%3A1')

    await user.click(screen.getByTestId('fm-home-detail-resolve'))

    expect(resolveMock).toHaveBeenCalledWith('UNPLACED:event:1')
  })

  it('a resolved item (per the hook state) renders dimmed even while still selected', () => {
    setHook([makeItem({ kind: 'UNPLACED', key: 'UNPLACED:event:1', resolved: true })])
    renderScreen('/fm/home?inbox=UNPLACED%3Aevent%3A1')

    const row = screen.getByTestId('fm-home-inbox-row-UNPLACED:event:1')
    expect(row.style.opacity).toBe('0.45')
  })
})

describe('nav badge publish (Story FM1-2 AC: red count = CONFLICT+RIGHTS+UNPLACED+CREW, NOT FEED)', () => {
  it('publishes the sum of CONFLICT+RIGHTS+UNPLACED+CREW counts onto the home nav badge', () => {
    const setNavBadge = vi.fn()
    setHook([
      makeItem({ kind: 'CONFLICT', key: 'CONFLICT:event:1' }),
      makeItem({ kind: 'RIGHTS', key: 'RIGHTS:competition:1' }),
      makeItem({ kind: 'UNPLACED', key: 'UNPLACED:event:2' }),
      makeItem({ kind: 'CREW', key: 'CREW:event:1:role:d' }),
      makeItem({ kind: 'FEED', key: 'FEED:proposal:x' }),
    ])
    renderScreen('/fm/home', setNavBadge)

    expect(setNavBadge).toHaveBeenCalledWith('home', 4)
  })

  it('resolved items still count toward the badge (resolution is an acknowledgment overlay, not a filter)', () => {
    const setNavBadge = vi.fn()
    setHook([makeItem({ kind: 'CONFLICT', key: 'CONFLICT:event:1', resolved: true })])
    renderScreen('/fm/home', setNavBadge)

    expect(setNavBadge).toHaveBeenCalledWith('home', 1)
  })

  it('publishes undefined (no badge) when the count is 0', () => {
    const setNavBadge = vi.fn()
    setHook([])
    renderScreen('/fm/home', setNavBadge)

    expect(setNavBadge).toHaveBeenCalledWith('home', undefined)
  })
})
