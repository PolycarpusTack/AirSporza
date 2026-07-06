/**
 * Interaction tests for the ops REGISTRY screen (C-2-T2).
 * Design: docs/design_handoff_planza_ops/README.md §4 REGISTRY + AC / pins 1-4.
 * Wired contracts: registry-selectors v1 (buildRegistryIndex, projectRegistryRows,
 * registryFacetCounts, registryToolbarCounts — ALL derivation lives there),
 * useRegistryData v1 (isSettled — this screen's PRIMARY data, incl. the failure
 * path), ops-selection v2 (useOpsRecord → ?record), ops-tokens v3 (--kind-*).
 *
 * useRegistryData is mocked (vi.hoisted state); render is wrapped in MemoryRouter
 * so useOpsRecord reads/writes ?record (opsUrlState/RightsScreen test precedent).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_COMPETITIONS,
  FIXTURE_PLAYERS,
  FIXTURE_SPORTS,
  FIXTURE_TEAMS,
} from '../../components/ops/__fixtures__/opsFixtureWeek'

const hookState = vi.hoisted(() => ({
  sports: [] as unknown[],
  competitions: [] as unknown[],
  teams: [] as unknown[],
  players: [] as unknown[],
  isSettled: true,
}))

vi.mock('../../components/ops/useRegistryData', () => ({
  useRegistryData: () => ({
    sports: hookState.sports,
    competitions: hookState.competitions,
    teams: hookState.teams,
    players: hookState.players,
    isSettled: hookState.isSettled,
    refresh: vi.fn(async () => {}),
  }),
}))

import { RegistryScreen } from './RegistryScreen'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-search">{location.search}</div>
}

const wrapperAt = (entry: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
  }

const renderScreen = (entry = '/ops/registry') =>
  render(
    <>
      <RegistryScreen />
      <LocationProbe />
    </>,
    { wrapper: wrapperAt(entry) },
  )

const rowIds = () =>
  screen.queryAllByTestId(/^ops-registry-row-/).map((el) => el.getAttribute('data-testid'))
const row = (id: string) => screen.getByTestId(`ops-registry-row-${id}`)
const queryRow = (id: string) => screen.queryByTestId(`ops-registry-row-${id}`)
const facet = (name: string) => screen.getByTestId(`ops-registry-facet-${name}`)
const search = () => screen.getByTestId('ops-registry-search') as HTMLInputElement
const locationSearch = () => screen.getByTestId('location-search').textContent ?? ''
/** Read a param through the parser — the raw `search` URL-encodes `:` to %3A. */
const recordParam = () => new URLSearchParams(locationSearch()).get('record')

beforeEach(() => {
  hookState.sports = [...FIXTURE_SPORTS]
  hookState.competitions = [...FIXTURE_COMPETITIONS]
  hookState.teams = [...FIXTURE_TEAMS]
  hookState.players = [...FIXTURE_PLAYERS]
  hookState.isSettled = true
})

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
  vi.clearAllMocks()
})

describe('loading + failure settle (primary data — pin 7 mirror)', () => {
  it('renders the quiet skeleton while NOT settled (root testid intact, no rows)', () => {
    hookState.isSettled = false
    renderScreen()

    expect(screen.getByTestId('ops-screen-registry')).toBeTruthy()
    expect(screen.getByTestId('ops-registry-loading')).toBeTruthy()
    expect(rowIds()).toEqual([])
  })

  it('a settled-but-EMPTY universe (failure path) renders the empty state, not a hang', () => {
    hookState.sports = []
    hookState.competitions = []
    hookState.teams = []
    hookState.players = []
    hookState.isSettled = true
    renderScreen()

    expect(screen.queryByTestId('ops-registry-loading')).toBeNull()
    expect(screen.getByTestId('ops-registry-empty')).toBeTruthy()
    expect(rowIds()).toEqual([])
  })
})

describe('toolbar', () => {
  it('shows live counters N SPORTS · N COMPETITIONS · N TEAMS · N PLAYERS (pin 5, not PEOPLE)', () => {
    renderScreen()
    expect(screen.getByTestId('ops-registry-counters').textContent).toBe(
      '5 SPORTS · 10 COMPETITIONS · 3 TEAMS · 6 PLAYERS',
    )
  })

  it('+ NEW is rendered but INERT/disabled (pin 2)', () => {
    renderScreen()
    const newButton = screen.getByTestId('ops-registry-new') as HTMLButtonElement
    expect(newButton.disabled).toBe(true)
    expect(newButton.title.length).toBeGreaterThan(0)
  })
})

describe('facet rail (counts ALWAYS unfiltered — A-3 precedent)', () => {
  it('shows the five AS-5 facets with unfiltered counts (no Performers/Staff)', () => {
    renderScreen()
    expect(within(facet('all')).getByText('24')).toBeTruthy()
    expect(within(facet('sport')).getByText('5')).toBeTruthy()
    expect(within(facet('competition')).getByText('10')).toBeTruthy()
    expect(within(facet('team')).getByText('3')).toBeTruthy()
    expect(within(facet('player')).getByText('6')).toBeTruthy()
    expect(screen.queryByTestId('ops-registry-facet-performer')).toBeNull()
    expect(screen.queryByTestId('ops-registry-facet-staff')).toBeNull()
  })

  it('clicking Teams filters rows to the 3 teams and styles the active facet; counts stay unfiltered', () => {
    renderScreen()
    expect(rowIds()).toHaveLength(24)

    fireEvent.click(facet('team'))

    expect(rowIds().sort()).toEqual(
      ['ops-registry-row-team:1', 'ops-registry-row-team:2', 'ops-registry-row-team:3'].sort(),
    )
    expect(queryRow('player:1')).toBeNull()
    // active facet styling
    expect(facet('team').style.background).toBe('var(--surface-shell-2)')
    // counts stay unfiltered even with the facet active
    expect(within(facet('player')).getByText('6')).toBeTruthy()
    expect(within(facet('all')).getByText('24')).toBeTruthy()
  })
})

describe('search (as-you-type, composes AND with the facet)', () => {
  it('typing filters rows live; facet counts stay unfiltered', () => {
    renderScreen()
    fireEvent.change(search(), { target: { value: 'ferran' } })

    expect(rowIds()).toEqual(['ops-registry-row-player:2']) // Milo Ferran
    // facet counts unchanged while rows shrink
    expect(within(facet('player')).getByText('6')).toBeTruthy()
    expect(within(facet('all')).getByText('24')).toBeTruthy()
  })

  it('query AND facet compose: "football" under the Players facet keeps only football PLAYERS (teams/sports excluded)', () => {
    renderScreen()
    fireEvent.click(facet('player'))
    fireEvent.change(search(), { target: { value: 'football' } })

    // players with sportLabel Football = player:1,2,3,4 (sportId 1)
    expect(rowIds().sort()).toEqual(
      [
        'ops-registry-row-player:1',
        'ops-registry-row-player:2',
        'ops-registry-row-player:3',
        'ops-registry-row-player:4',
      ].sort(),
    )
    // football also matches team:1/2 + sport:1 + comps — but the facet excludes them
    expect(queryRow('team:1')).toBeNull()
    expect(queryRow('sport:1')).toBeNull()
  })

  it('zero-match query → empty-state row; search + facet are KEPT (never auto-cleared)', () => {
    renderScreen()
    fireEvent.click(facet('team'))
    fireEvent.change(search(), { target: { value: 'zzzznope' } })

    expect(screen.getByTestId('ops-registry-empty')).toBeTruthy()
    expect(rowIds()).toEqual([])
    expect(search().value).toBe('zzzznope') // search retained
    expect(facet('team').style.background).toBe('var(--surface-shell-2)') // facet retained
  })
})

describe('row selection (?record — ops-selection v2)', () => {
  it('clicking a row sets ?record=<kind>:<id> and styles the selected row', () => {
    renderScreen()
    expect(recordParam()).toBeNull()

    fireEvent.click(row('team:1'))

    expect(recordParam()).toBe('team:1')
    expect(row('team:1').style.background).toBe('var(--surface-shell-2)')
    expect(row('team:1').style.boxShadow).toContain('var(--accent-shell)')
    // a non-selected row carries neither
    expect(row('team:2').style.background).not.toBe('var(--surface-shell-2)')
  })

  it('hydrates the selected row from an incoming ?record deep link', () => {
    renderScreen('/ops/registry?record=player:3')
    expect(row('player:3').style.background).toBe('var(--surface-shell-2)')
  })
})

describe('cells (SOURCE / STATUS / TYPE chip)', () => {
  it('SOURCE shows the mapped code per fixture provenance', () => {
    renderScreen()
    expect(within(row('team:1')).getByTestId('ops-registry-source').textContent).toBe('MANUAL')
    expect(within(row('team:2')).getByTestId('ops-registry-source').textContent).toBe('TSDB')
    expect(within(row('team:3')).getByTestId('ops-registry-source').textContent).toBe('API-FB')
    expect(within(row('player:4')).getByTestId('ops-registry-source').textContent).toBe('FB-DATA')
  })

  it('STATUS shows the word + the mapped semantic color token (non-hex)', () => {
    renderScreen()
    const cases: [string, string, string][] = [
      ['player:1', 'ACTIVE', 'var(--status-approved)'],
      ['player:2', 'INJURED', 'var(--alert-warning)'],
      ['player:3', 'LOANED', 'var(--text-shell-3)'],
      ['player:6', 'RETIRED', 'var(--text-shell-3)'],
    ]
    for (const [id, word, color] of cases) {
      const statusEl = within(row(id)).getByTestId('ops-registry-status')
      expect(statusEl.textContent).toBe(word)
      expect(statusEl.style.color).toBe(color)
      expect(statusEl.style.color).not.toMatch(/#/)
    }
  })

  it('TYPE chip renders the uppercase kind with the --kind-* color + bg', () => {
    renderScreen()
    const chip = within(row('player:1')).getByTestId('ops-registry-chip')
    expect(chip.textContent).toBe('PLAYER')
    expect(chip.style.color).toBe('var(--kind-player)')
    expect(chip.style.background).toBe('var(--kind-player-bg)')

    const teamChip = within(row('team:1')).getByTestId('ops-registry-chip')
    expect(teamChip.textContent).toBe('TEAM')
    expect(teamChip.style.color).toBe('var(--kind-team)')
  })

  it('NAME / SPORT / LINKED cells show the projected values', () => {
    renderScreen()
    expect(within(row('team:1')).getByText('Riverside United')).toBeTruthy()
    expect(within(row('team:1')).getByText('5 linked records')).toBeTruthy()
    expect(within(row('sport:1')).getByText('3 competitions')).toBeTruthy()
    expect(within(row('player:4')).getByText('—')).toBeTruthy() // unattached
  })
})
