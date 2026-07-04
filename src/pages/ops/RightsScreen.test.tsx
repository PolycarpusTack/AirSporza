/**
 * Interaction tests for the ops RIGHTS screen (B-3-T2).
 * Design: docs/design_handoff_planza_ops/README.md §3 RIGHTS.
 * Wired contracts: ops-selectors v3 (deriveRightsMatrix/Tiles,
 * deriveValidityProgress/Band — post-review surface: validityProgress fraction,
 * platformColumns), useContracts v1 (isSettled, pin 7), ops-tokens v3.
 *
 * Pins exercised (Story B-3 re-gate 2026-07-04):
 *   pin 7 — skeleton until the FIRST contracts resolution (inverse settle-gate:
 *           assert skeleton THEN resolve THEN content).
 *   pin 9 — root testid ops-screen-rights.
 *   Bar rule (recorded, from the design HTML `showBar: pct > 0`): bar renders
 *   iff validityProgress !== null && > 0 — so lapsed (0) and no-date rows hide
 *   it, while a DATED draft shows its term bar under 'In negotiation'.
 *   NO CONTRACT display variant: word = 'NO CONTRACT' iff validityLabel is
 *   'No agreement in place' (the selector's pinned no-agreement discriminant).
 */
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contract, Event, Sport } from '../../data/types'
import {
  deepFreeze,
  FIXTURE_COMPETITIONS,
  FIXTURE_CONTRACTS,
  FIXTURE_EVENTS,
  FIXTURE_NOW,
} from '../../components/ops/__fixtures__/opsFixtureWeek'
import { deriveRightsStatus } from '../../components/ops/selectors'

// deep-frozen: shared module-level test objects are pins (house convention)
const FIXTURE_SPORTS: Sport[] = deepFreeze([
  { id: 1, name: 'Football', icon: '⚽', federation: 'FIFA' },
  { id: 2, name: 'Tennis', icon: '🎾', federation: 'ITF' },
  { id: 3, name: 'Cycling', icon: '🚴', federation: 'UCI' },
  { id: 4, name: 'Formula 1', icon: '🏎️', federation: 'FIA' },
  { id: 5, name: 'Athletics', icon: '🏃', federation: 'WA' },
])

const appState = vi.hoisted(() => ({
  events: [] as Event[],
}))

vi.mock('../../context/AppProvider', () => ({
  useApp: () => ({
    events: appState.events,
    competitions: FIXTURE_COMPETITIONS,
    sports: FIXTURE_SPORTS,
  }),
}))

vi.mock('../../services', () => ({
  contractsApi: { list: vi.fn(async () => FIXTURE_CONTRACTS) },
}))

import { contractsApi } from '../../services'
import { RightsScreen } from './RightsScreen'

const listMock = contractsApi.list as unknown as ReturnType<typeof vi.fn>

const renderScreen = (now: Date = FIXTURE_NOW) => render(<RightsScreen now={now} />)

const tile = (status: string) => screen.getByTestId(`ops-rights-tile-${status}`)
const row = (competitionId: number) => screen.getByTestId(`ops-rights-row-${competitionId}`)
const waitForRow = (competitionId: number) => screen.findByTestId(`ops-rights-row-${competitionId}`)
const cell = (competitionId: number, column: string) =>
  within(row(competitionId)).getByTestId(`ops-rights-cell-${column}`)
const queryBar = (competitionId: number) =>
  within(row(competitionId)).queryByTestId('ops-rights-bar')

beforeEach(() => {
  appState.events = [...FIXTURE_EVENTS]
  listMock.mockImplementation(async () => FIXTURE_CONTRACTS)
})

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
  vi.clearAllMocks()
})

describe('loading (pin 7 — skeleton until the first contracts resolution)', () => {
  it('shows the loading panel BEFORE resolution, then swaps to tiles + matrix (inverse settle-gate)', async () => {
    let resolveList!: (contracts: Contract[]) => void
    listMock.mockImplementationOnce(() => new Promise<Contract[]>((resolve) => (resolveList = resolve)))
    renderScreen()

    // pre-resolution: skeleton, NO content, root testid intact (pin 9)
    expect(screen.getByTestId('ops-screen-rights')).toBeTruthy()
    expect(screen.getByTestId('ops-rights-loading')).toBeTruthy()
    expect(screen.queryByTestId('ops-rights-tile-VALID')).toBeNull()

    await act(async () => resolveList(FIXTURE_CONTRACTS))

    expect(screen.queryByTestId('ops-rights-loading')).toBeNull()
    expect(tile('VALID')).toBeTruthy()
    expect(row(101)).toBeTruthy()
  })

  it('a FAILED fetch also SETTLES the skeleton away (isSettled on rejection — everything derives MISSING)', async () => {
    let rejectList!: (reason: Error) => void
    listMock.mockImplementationOnce(() => new Promise<Contract[]>((_, reject) => (rejectList = reject)))
    renderScreen()

    expect(screen.getByTestId('ops-rights-loading')).toBeTruthy()
    await act(async () => rejectList(new Error('api down')))

    expect(screen.queryByTestId('ops-rights-loading')).toBeNull()
    // event-bearing competitions still row up, all MISSING (no contracts)
    expect(within(tile('MISSING')).getByTestId('ops-rights-tile-count').textContent).toBe('9')
  })
})

describe('tiles (AC — fold over the matrix, literal fixture counts)', () => {
  it('renders the 4 tiles with fixture counts and alias colors: 3 VALID · 2 EXPIRING · 1 NEGOTIATION · 3 MISSING', async () => {
    renderScreen()
    await waitForRow(101)

    const expected: [string, string, string, string][] = [
      ['VALID', '3', 'VALID CONTRACTS', 'var(--rights-valid)'],
      ['EXPIRING', '2', 'EXPIRING SOON', 'var(--rights-expiring)'],
      ['NEGOTIATION', '1', 'IN NEGOTIATION', 'var(--rights-negotiation)'],
      ['MISSING', '3', 'MISSING RIGHTS', 'var(--rights-missing)'],
    ]
    for (const [status, count, label, color] of expected) {
      const tileEl = tile(status)
      const tileCountEl = within(tileEl).getByTestId('ops-rights-tile-count')
      expect(tileCountEl.textContent).toBe(count)
      expect(tileCountEl.style.color).toBe(color)
      expect(within(tileEl).getByText(label)).toBeTruthy()
    }
  })

  it('RECONCILIATION (AC): each tile count equals the number of matrix rows with that derived status', async () => {
    renderScreen()
    await waitForRow(101)

    const rows = screen.getAllByTestId(/^ops-rights-row-/)
    for (const status of ['VALID', 'EXPIRING', 'NEGOTIATION', 'MISSING']) {
      const rowCount = rows.filter((r) => r.getAttribute('data-status') === status).length
      expect(within(tile(status)).getByTestId('ops-rights-tile-count').textContent).toBe(String(rowCount))
    }
    expect(rows).toHaveLength(9)
  })

  it('PROPERTY (AC): ∀ fixture events, deriveRightsStatus === the event\'s competition-row data-status', async () => {
    renderScreen()
    await waitForRow(101)

    const mismatches = FIXTURE_EVENTS.map((event) => ({
      eventId: event.id,
      viaSelector: deriveRightsStatus(event, FIXTURE_CONTRACTS, FIXTURE_NOW),
      viaRow: row(event.competitionId).getAttribute('data-status'),
    })).filter((entry) => entry.viaSelector !== entry.viaRow)

    expect(mismatches).toEqual([])
  })
})

describe('matrix rows (pins 1/2/5 — order, platform cells, content)', () => {
  it('rows render severity-first then name asc (fixture order pinned at T1)', async () => {
    renderScreen()
    await waitForRow(101)

    expect(screen.getAllByTestId(/^ops-rights-row-/).map((r) => r.getAttribute('data-competition-id'))).toEqual([
      '105', '108', '104', '110', '102', '103', '109', '101', '106',
    ])
  })

  it('renders the matrix header COMPETITION|LINEAR|MAX|RADIO|ON-DEM|STATUS|VALIDITY', async () => {
    renderScreen()
    await waitForRow(101)

    for (const label of ['COMPETITION', 'LINEAR', 'MAX', 'RADIO', 'ON-DEM', 'STATUS', 'VALIDITY']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('platform cells: ● accent for held rights, · neutral otherwise; ON-DEM ALWAYS · (AS-8)', async () => {
    renderScreen()
    await waitForRow(101)

    // fixture contracts carry ['linear','on-demand'] → LINEAR + MAX light up
    expect(cell(101, 'LINEAR').textContent).toBe('●')
    expect(cell(101, 'LINEAR').style.color).toBe('var(--accent-shell)')
    expect(cell(101, 'MAX').textContent).toBe('●')
    expect(cell(101, 'RADIO').textContent).toBe('·')
    expect(cell(101, 'RADIO').style.color).toBe('var(--text-shell-3)')
    // ON-DEM is RESERVED (AS-8): EVERY row's cell must be · — 'on-demand' maps to MAX
    const ondemCells = screen.getAllByTestId('ops-rights-cell-ONDEM')
    expect(ondemCells).toHaveLength(9)
    expect(ondemCells.every((ondemCell) => ondemCell.textContent === '·')).toBe(true)
    // no-contract row: everything dark
    expect(cell(105, 'LINEAR').textContent).toBe('·')
  })

  it('row content: sport emoji (via competition.sportId) + name', async () => {
    renderScreen()
    await waitForRow(101)

    expect(within(row(101)).getByText('League A')).toBeTruthy()
    expect(within(row(101)).getByText('⚽')).toBeTruthy()
    expect(within(row(105)).getByText('🏎️')).toBeTruthy() // GP E → sport 4
  })
})

describe('status words + validity (pin 4 variants, bar rule)', () => {
  it("NO CONTRACT display variant: no-agreement rows show the red word 'NO CONTRACT' and no bar", async () => {
    renderScreen()
    await waitForRow(105)

    for (const competitionId of [105, 104]) {
      const word = within(row(competitionId)).getByTestId('ops-rights-status')
      expect(word.textContent).toBe('NO CONTRACT')
      expect(word.style.color).toBe('var(--rights-missing)')
      expect(within(row(competitionId)).getByText('No agreement in place')).toBeTruthy()
      expect(queryBar(competitionId)).toBeNull()
    }
  })

  it("lapsed row (108): word MISSING (not NO CONTRACT), 'Until 1 Feb 2026', bar suppressed (progress 0)", async () => {
    renderScreen()
    await waitForRow(108)

    expect(within(row(108)).getByTestId('ops-rights-status').textContent).toBe('MISSING')
    expect(within(row(108)).getByText('Until 1 Feb 2026')).toBeTruthy()
    expect(queryBar(108)).toBeNull()
  })

  it("NEGOTIATION row (103): word + 'In negotiation'; its DATED draft shows the term bar (rule: progress > 0)", async () => {
    renderScreen()
    await waitForRow(103)

    const word = within(row(103)).getByTestId('ops-rights-status')
    expect(word.textContent).toBe('NEGOTIATION')
    expect(word.style.color).toBe('var(--rights-negotiation)')
    expect(within(row(103)).getByText('In negotiation')).toBeTruthy()
    expect(queryBar(103)).not.toBeNull() // dated draft → term bar renders (recorded rule)
  })

  it('validity bar: literal width % and band colors (101 amber ≈44.2%, 109 green ≈70.6%, 102 red)', async () => {
    renderScreen()
    await waitForRow(101)

    const bar101 = queryBar(101)!
    expect(parseFloat(bar101.style.width)).toBeCloseTo(44.20091324, 4)
    expect(bar101.style.backgroundColor).toBe('var(--rights-expiring)') // amber band (0.15 ≤ p < 0.5)

    const bar109 = queryBar(109)!
    expect(parseFloat(bar109.style.width)).toBeCloseTo(70.58823529, 4)
    expect(bar109.style.backgroundColor).toBe('var(--rights-valid)') // green band (p ≥ 0.5)

    expect(queryBar(102)!.style.backgroundColor).toBe('var(--rights-missing)') // red band (p < 0.15)
  })

  it('VALID row (101) shows Until 30 Jun 2027 (selector-precomposed label)', async () => {
    renderScreen()
    await waitForRow(101)

    expect(within(row(101)).getByText('Until 30 Jun 2027')).toBeTruthy()
  })
})

describe('empty universe + now seam', () => {
  it('no contracts AND no events → tiles all 0 + quiet empty panel instead of rows', async () => {
    appState.events = []
    listMock.mockImplementation(async () => [])
    renderScreen()

    expect(await screen.findByTestId('ops-rights-empty')).toBeTruthy()
    expect(screen.queryAllByTestId(/^ops-rights-row-/)).toEqual([])
    expect(within(tile('MISSING')).getByTestId('ops-rights-tile-count').textContent).toBe('0')
  })

  it('the now seam threads into derivation: at a 2030 clock everything lapses except the draft', async () => {
    renderScreen(new Date('2030-01-01T00:00:00Z'))
    await waitForRow(101)

    expect(within(tile('MISSING')).getByTestId('ops-rights-tile-count').textContent).toBe('8')
    expect(within(tile('NEGOTIATION')).getByTestId('ops-rights-tile-count').textContent).toBe('1') // draft outranks lapse
    expect(within(tile('VALID')).getByTestId('ops-rights-tile-count').textContent).toBe('0')
  })
})
