/**
 * Interaction tests for the ops SCHEDULE screen (A-3-T2).
 * Design: docs/design_handoff_planza_ops/README.md §1 SCHEDULE.
 * Wired contracts: ops-selectors v1 (derivations), ops-selection v1 (?event=),
 * ops-tokens v3 (rights/crew word aliases). Data via the shared fixture week.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event, Sport, Competition } from '../../data/types'
import { DEFAULT_CREW_FIELDS } from '../../data'
import {
  FIXTURE_CONTRACTS,
  FIXTURE_EVENTS,
  FIXTURE_NOW,
  FIXTURE_PLANS,
} from '../../components/ops/__fixtures__/opsFixtureWeek'

const FIXTURE_SPORTS: Sport[] = [
  { id: 1, name: 'Football', icon: '⚽', federation: 'FIFA' },
  { id: 2, name: 'Tennis', icon: '🎾', federation: 'ITF' },
  { id: 3, name: 'Cycling', icon: '🚴', federation: 'UCI' },
  { id: 4, name: 'Formula 1', icon: '🏎️', federation: 'FIA' },
  { id: 5, name: 'Athletics', icon: '🏃', federation: 'WA' },
]

const FIXTURE_COMPETITIONS: Competition[] = [
  { id: 101, sportId: 1, name: 'League A', matches: 10, season: '2026' },
  { id: 102, sportId: 2, name: 'Open B', matches: 10, season: '2026' },
  { id: 103, sportId: 1, name: 'Cup C', matches: 10, season: '2026' },
  { id: 104, sportId: 3, name: 'Tour D', matches: 10, season: '2026' },
  { id: 105, sportId: 4, name: 'GP E', matches: 10, season: '2026' },
  { id: 106, sportId: 2, name: 'Masters F', matches: 10, season: '2026' },
  { id: 108, sportId: 1, name: 'Series H', matches: 10, season: '2026' },
  { id: 109, sportId: 3, name: 'Classic I', matches: 10, season: '2026' },
  { id: 110, sportId: 5, name: 'Champs J', matches: 10, season: '2026' },
]

// Fixture events patched with editorial statuses (STATUS column) + one channel relation.
const eventsWithStatuses = (): Event[] =>
  FIXTURE_EVENTS.map((e) => {
    if (e.id === 1) return { ...e, status: 'approved' as const }
    if (e.id === 2) return { ...e, status: 'ready' as const }
    if (e.id === 3) return { ...e, status: 'draft' as const }
    if (e.id === 5) return { ...e, channel: { id: 7, name: 'VRT 1', color: '#F59E0B', types: [] } }
    return e
  })

const hoisted = vi.hoisted(() => ({
  events: [] as Event[],
  sports: [] as Sport[],
  competitions: [] as Competition[],
}))

vi.mock('../../context/AppProvider', () => ({
  useApp: () => ({
    events: hoisted.events,
    sports: hoisted.sports,
    competitions: hoisted.competitions,
    techPlans: FIXTURE_PLANS,
    crewFields: DEFAULT_CREW_FIELDS,
  }),
}))

vi.mock('../../services', () => ({
  contractsApi: { list: vi.fn(async () => FIXTURE_CONTRACTS) },
}))

import { ScheduleScreen } from './ScheduleScreen'

function LocationProbe() {
  return <span data-testid="location">{`${useLocation().pathname}${useLocation().search}`}</span>
}

const renderScreen = (initialEntry = '/ops/schedule') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ScheduleScreen now={FIXTURE_NOW} />
      <LocationProbe />
    </MemoryRouter>,
  )

const row = (eventId: number) => screen.getByTestId(`ops-schedule-row-${eventId}`)

beforeEach(() => {
  hoisted.events = eventsWithStatuses()
  hoisted.sports = FIXTURE_SPORTS
  hoisted.competitions = FIXTURE_COMPETITIONS
})

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
})

describe('day grouping and table chrome', () => {
  it('renders day headers for non-empty days only, in MON 2 MARCH style', async () => {
    renderScreen()

    expect(await screen.findByText('MON 2 MARCH')).toBeTruthy()
    expect(screen.getByText('TUE 3 MARCH')).toBeTruthy()
    expect(screen.getByText('FRI 6 MARCH')).toBeTruthy()
    expect(screen.queryByText('SAT 7 MARCH')).toBeNull() // empty day → no header
    expect(screen.queryByText('SUN 8 MARCH')).toBeNull()
  })

  it('renders the sticky column header row TIME|EVENT|CHANNEL|STATUS|RIGHTS|CREW', () => {
    renderScreen()

    for (const label of ['TIME', 'EVENT', 'CHANNEL', 'STATUS', 'RIGHTS', 'CREW']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('orders rows by time within a day (Monday: e2 14:00 before e1 20:00)', () => {
    renderScreen()

    const ids = screen.getAllByTestId(/^ops-schedule-row-/).map((el) => el.getAttribute('data-event-id'))
    expect(ids.indexOf('2')).toBeLessThan(ids.indexOf('1'))
  })

  it('events outside the week (e10) are not rendered', () => {
    renderScreen()

    expect(screen.queryByTestId('ops-schedule-row-10')).toBeNull()
  })
})

describe('derived words (ops-selectors v1 + ops-tokens v3 aliases)', () => {
  it('RIGHTS words render the fixture permutations with their alias colors', async () => {
    renderScreen()

    const valid = await within(row(1)).findByText('VALID')
    expect(valid.style.color).toBe('var(--rights-valid)')
    expect(within(row(2)).getByText('EXPIRING').style.color).toBe('var(--rights-expiring)')
    expect(within(row(3)).getByText('NEGOTIATION').style.color).toBe('var(--rights-negotiation)')
    expect(within(row(4)).getByText('MISSING').style.color).toBe('var(--rights-missing)')
    expect(within(row(7)).getByText('MISSING')).toBeTruthy() // no contract row at all
  })

  it('CREW words render the fixture permutations with their alias colors', () => {
    renderScreen()

    expect(within(row(3)).getByText('CONFLICT').style.color).toBe('var(--crew-conflict)')
    expect(within(row(7)).getByText('OPEN').style.color).toBe('var(--crew-open)')
    expect(within(row(1)).getByText('OK').style.color).toBe('var(--crew-ok)')
  })

  it('STATUS words use the Editorial --status-* family; absent status renders a dash', () => {
    renderScreen()

    expect(within(row(1)).getByText('APPROVED').style.color).toBe('var(--status-approved)')
    expect(within(row(2)).getByText('READY').style.color).toBe('var(--status-ready)')
    expect(within(row(3)).getByText('DRAFT').style.color).toBe('var(--status-draft)')
    expect(within(row(4)).getByTestId('ops-cell-status').textContent).toBe('—') // no editorial status
  })

  it('CHANNEL cell renders the enriched event.channel name, dash when absent', () => {
    renderScreen()

    expect(within(row(5)).getByText('VRT 1')).toBeTruthy()
    expect(within(row(1)).getByTestId('ops-cell-channel').textContent).toBe('—') // no channel relation
  })
})

describe('sport facets', () => {
  it('renders each sport with its unfiltered week count', () => {
    renderScreen()

    expect(screen.getByRole('button', { name: /Football.*3/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tennis.*2/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Athletics.*1/ })).toBeTruthy()
  })

  it('facet click filters rows to that sport; counts stay unfiltered; active facet is marked', async () => {
    const user = userEvent.setup()
    renderScreen()

    const football = screen.getByRole('button', { name: /Football/ })
    await user.click(football)

    // only Football events remain (e1, e3, e9)
    expect(screen.getAllByTestId(/^ops-schedule-row-/).map((el) => el.getAttribute('data-event-id'))).toEqual(['1', '3', '9'])
    expect(football.getAttribute('aria-pressed')).toBe('true')
    // counts still reflect the UNFILTERED week
    expect(screen.getByRole('button', { name: /Tennis.*2/ })).toBeTruthy()
    // empty day headers for days without Football events disappear, Monday stays
    expect(screen.getByText('MON 2 MARCH')).toBeTruthy()
    expect(screen.queryByText('THU 5 MARCH')).toBeNull()
  })

  it('clicking the active facet again clears the filter (toggle)', async () => {
    const user = userEvent.setup()
    renderScreen()

    const football = screen.getByRole('button', { name: /Football/ })
    await user.click(football)
    await user.click(football)

    expect(screen.getAllByTestId(/^ops-schedule-row-/)).toHaveLength(9)
    expect(football.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('selection (ops-selection v1)', () => {
  it('row click sets ?event= and marks the row selected', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(row(3))

    expect(screen.getByTestId('location').textContent).toBe('/ops/schedule?event=3')
    expect(row(3).getAttribute('data-selected')).toBe('true')
    expect(row(3).style.boxShadow).toContain('var(--accent-shell)')
    expect(row(1).getAttribute('data-selected')).toBe('false')
  })

  it('deep link ?event= hydrates the selected row on mount', () => {
    renderScreen('/ops/schedule?event=5')

    expect(row(5).getAttribute('data-selected')).toBe('true')
  })
})

describe('empty state', () => {
  it('a week with zero events renders the empty-state panel instead of the table', () => {
    hoisted.events = []
    renderScreen()

    expect(screen.getByTestId('ops-schedule-empty')).toBeTruthy()
    expect(screen.queryByTestId(/^ops-schedule-row-/)).toBeNull()
  })

})

describe('OpsShell contract', () => {
  it('the screen root keeps the ops-screen-schedule testid', () => {
    renderScreen()

    expect(screen.getByTestId('ops-screen-schedule')).toBeTruthy()
  })
})
