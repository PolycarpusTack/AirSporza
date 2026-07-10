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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_COMPETITIONS,
  FIXTURE_PLAYERS,
  FIXTURE_SPORTS,
  FIXTURE_TEAMS,
  makeTeam,
} from '../../components/ops/__fixtures__/opsFixtureWeek'
import type { LinkedRecordSection } from '../../components/ops/registrySelectors'

const hookState = vi.hoisted(() => ({
  sports: [] as unknown[],
  competitions: [] as unknown[],
  teams: [] as unknown[],
  players: [] as unknown[],
  isSettled: true,
  // refresh() mutates the collections to what the server would return next (C-4).
  onRefresh: null as null | (() => void),
}))

vi.mock('../../components/ops/useRegistryData', () => ({
  useRegistryData: () => ({
    sports: hookState.sports,
    competitions: hookState.competitions,
    teams: hookState.teams,
    players: hookState.players,
    isSettled: hookState.isSettled,
    refresh: async () => {
      hookState.onRefresh?.()
    },
  }),
}))

// The lazy linked-record fetch is unit-tested in useLinkedRecords.test.ts — here
// it is mocked so the screen tests stay focused on hydration + hop wiring.
const linkedState = vi.hoisted(() => ({ sections: [] as LinkedRecordSection[] }))
vi.mock('../../components/ops/useLinkedRecords', () => ({
  useLinkedRecords: () => ({ sections: linkedState.sections }),
}))

// The create modal's write path is unit-tested in RegistryCreateModal.test.tsx —
// here the services are mocked so the screen test exercises the create → refresh →
// select → close wiring end-to-end.
const teamsCreate = vi.fn()
const teamsSaveNotes = vi.fn()
const playersSaveNotes = vi.fn()
vi.mock('../../services', () => ({
  sportsApi: { create: vi.fn() },
  competitionsApi: { create: vi.fn() },
  teamsApi: { create: (...a: unknown[]) => teamsCreate(...a), saveNotes: (...a: unknown[]) => teamsSaveNotes(...a) },
  playersApi: { create: vi.fn(), saveNotes: (...a: unknown[]) => playersSaveNotes(...a) },
}))

// E-1 #7 guard seam: RegistryTableRow calls getRowActivationProps EXACTLY once per
// render, so wrapping the REAL impl with a counter gives a per-row-render tally. The
// real return value is preserved → row behavior (role/tabIndex/Enter/Space) unchanged.
const rowActivationCalls = vi.hoisted(() => ({ count: 0 }))
vi.mock('../../components/ops/rowActivation', async (importActual) => {
  const actual = await importActual<typeof import('../../components/ops/rowActivation')>()
  return {
    ...actual,
    getRowActivationProps: (onActivate: () => void) => {
      rowActivationCalls.count++
      return actual.getRowActivationProps(onActivate)
    },
  }
})

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
  hookState.onRefresh = null
  linkedState.sections = []
  teamsCreate.mockReset()
  teamsSaveNotes.mockReset()
  playersSaveNotes.mockReset()
  rowActivationCalls.count = 0
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

  it('+ NEW opens the create modal (C-4-T1 — supersedes the C-2 pin-2 inert state)', () => {
    renderScreen()
    const newButton = screen.getByTestId('ops-registry-new') as HTMLButtonElement
    expect(newButton.disabled).toBe(false)
    expect(screen.queryByTestId('ops-create-modal')).toBeNull()

    fireEvent.click(newButton)
    expect(screen.getByTestId('ops-create-modal')).toBeTruthy()
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

  // E-2-T2 FEATURE (WCAG 2.1.1): the row was a mouse-only clickable <div>. It is
  // now keyboard-operable (role/tabIndex + Enter/Space), matching ScheduleRow /
  // the Rundown block via the shared getRowActivationProps primitive.
  it('the row is keyboard-operable (role=button, tabIndex 0) and Enter/Space selects it', () => {
    renderScreen()
    const r = row('team:1')
    expect(r.getAttribute('role')).toBe('button')
    expect(r.tabIndex).toBe(0)

    fireEvent.keyDown(r, { key: 'Enter' })
    expect(recordParam()).toBe('team:1')

    // Space selects a different row too (and, in a real browser, suppresses scroll)
    fireEvent.keyDown(row('player:3'), { key: ' ' })
    expect(recordParam()).toBe('player:3')
  })
})

// E-1 remediation (EPIC E · HARDENING · FEATURE): the registry table now windows
// the row list so the mounted node count is bounded by the viewport (closes SLO #5)
// and each row is React.memo'd behind a STABLE onSelect (closes SLO #7). jsdom
// reports clientHeight 0 → the "render all" fallback keeps every 24-record test
// above fully green; here we stub a positive viewport height to exercise windowing.
describe('E-1 windowing (jsdom fallback renders all; positive height windows)', () => {
  it('renders ALL rows when no positive viewport height is measured (jsdom fallback)', () => {
    hookState.teams = [...FIXTURE_TEAMS, ...Array.from({ length: 200 }, (_, i) => makeTeam({ id: 500 + i }))]
    renderScreen()
    // 24 base fixture records + 200 extra teams = 224, all mounted (clientHeight 0)
    expect(rowIds().length).toBe(224)
  })

  it('windows to a bounded subset once a positive viewport height is measured', () => {
    // jsdom reports 0 for layout; a real browser measures a positive height. Stub it.
    const heightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(440)
    try {
      hookState.teams = [...FIXTURE_TEAMS, ...Array.from({ length: 200 }, (_, i) => makeTeam({ id: 500 + i }))]
      renderScreen()
      const rendered = rowIds()
      // 440px / 44px ≈ 10 visible + overscan → far fewer than the 224 total
      expect(rendered.length).toBeGreaterThan(0)
      expect(rendered.length).toBeLessThan(40)
      // the scroll container + its spacers exist so scroll offset is preserved
      expect(screen.getByTestId('ops-registry-scroll')).toBeTruthy()
    } finally {
      heightSpy.mockRestore()
    }
  })
})

// E-1 #7 REGRESSION GUARD: selecting a row must re-render ONLY the rows whose
// `selected` boolean flips — not the whole table. This is the entire point of the
// React.memo(RegistryTableRow) + STABLE handleSelectRow fix. Both defeating mutations
// blow this up to the full row count:
//   (a) drop the `useCallback([])` on handleSelectRow → a fresh fn each render → the
//       onSelect prop changes for EVERY row → memo re-renders all → delta = 24.
//   (b) remove React.memo from RegistryTableRow → every row re-renders on any state
//       change → delta = 24.
// getRowActivationProps fires once per row render (mocked counter above), so the
// post-click delta is the count of rows that actually re-rendered.
describe('E-1 #7 selection re-render is bounded (memo + stable callback guard)', () => {
  it('selecting a row re-renders only the changed rows, not all 24', () => {
    renderScreen()
    // first paint: one getRowActivationProps call per mounted row (jsdom fallback = all 24)
    expect(rowActivationCalls.count).toBe(24)
    rowActivationCalls.count = 0

    // first selection: only team:1 flips false→true → exactly 1 row re-renders
    fireEvent.click(row('team:1'))
    expect(recordParam()).toBe('team:1') // behavior intact (mock preserved real props)
    expect(rowActivationCalls.count).toBeGreaterThan(0)
    expect(rowActivationCalls.count).toBeLessThanOrEqual(2) // « 24 — both mutations would give 24
    rowActivationCalls.count = 0

    // hop: team:1 flips true→false AND team:2 flips false→true → exactly 2 rows re-render
    fireEvent.click(row('team:2'))
    expect(recordParam()).toBe('team:2')
    expect(rowActivationCalls.count).toBeGreaterThan(0)
    expect(rowActivationCalls.count).toBeLessThanOrEqual(3) // still « 24 (2 + tiny margin)
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

describe('RecordInspector embed (C-3-T1 — hydration + hops)', () => {
  it('no selection → inspector renders its empty state', () => {
    renderScreen()
    expect(screen.getByTestId('ops-record-inspector-empty')).toBeTruthy()
  })

  it('direct load ?record=team:1 → inspector hydrates the team', () => {
    renderScreen('/ops/registry?record=team:1')
    const inspector = screen.getByTestId('ops-record-inspector')
    expect(within(inspector).getByTestId('ops-record-name').textContent).toBe('Riverside United')
    expect(screen.queryByTestId('ops-record-inspector-empty')).toBeNull()
  })

  it('unknown ?record=team:999 → inspector empty state, no crash', () => {
    renderScreen('/ops/registry?record=team:999')
    expect(screen.getByTestId('ops-record-inspector-empty')).toBeTruthy()
    // the table still rendered (no crash)
    expect(rowIds().length).toBeGreaterThan(0)
  })

  it('clicking a LINKED hop row updates ?record (REPLACE — ops-selection rule 7)', () => {
    linkedState.sections = [
      { relation: 'competitions', records: [{ recordId: 'competition:103', name: 'Cup C', kind: 'competition' }] },
    ]
    renderScreen('/ops/registry?record=team:1')

    fireEvent.click(screen.getByTestId('ops-record-linked-competition:103'))
    expect(recordParam()).toBe('competition:103')
  })
})

describe('create flow (C-4-T1 — refresh → clear filters → select → close)', () => {
  it('a successful team create refreshes, resets filters, selects ?record, closes, and shows MANUAL provenance', async () => {
    // the server row the refresh returns — externalRefs {} → SOURCE MANUAL
    const createdTeam = makeTeam({ id: 42, name: 'Newport County', externalRefs: {} })
    teamsCreate.mockResolvedValue({ id: 42 })
    hookState.onRefresh = () => {
      hookState.teams = [...FIXTURE_TEAMS, createdTeam]
    }

    renderScreen()
    // narrow the view first, so we can prove filters are cleared post-create
    fireEvent.change(search(), { target: { value: 'zzz-no-match' } })
    fireEvent.click(screen.getByTestId('ops-registry-new'))

    fireEvent.change(screen.getByTestId('ops-create-name'), { target: { value: 'Newport County' } })
    fireEvent.click(screen.getByTestId('ops-create-submit'))

    // ?record points at the new team (the router navigation lands after refresh)
    await waitFor(() => expect(recordParam()).toBe('team:42'))
    expect(teamsCreate).toHaveBeenCalledWith({ name: 'Newport County' })
    expect(screen.queryByTestId('ops-create-modal')).toBeNull() // modal closed
    expect(search().value).toBe('') // filters cleared

    // the inspector shows the fresh server row with MANUAL provenance (no optimistic append)
    const inspector = screen.getByTestId('ops-record-inspector')
    expect(within(inspector).getByTestId('ops-record-name').textContent).toBe('Newport County')
    expect(within(inspector).getByTestId('ops-record-provenance').textContent).toBe(
      'MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE',
    )
  })
})

describe('remark save (C-5-T1 — team/player notes via saveNotes + refresh)', () => {
  it('saving a remark on a team calls teamsApi.saveNotes(dbId, text) then refresh', async () => {
    teamsSaveNotes.mockResolvedValue({})
    let refreshed = false
    hookState.onRefresh = () => {
      refreshed = true
    }
    renderScreen('/ops/registry?record=team:1')

    fireEvent.click(screen.getByTestId('ops-record-add-remark')) // EDIT REMARK (team:1 has notes)
    fireEvent.change(screen.getByTestId('ops-record-remark-input'), { target: { value: 'Updated remark' } })
    fireEvent.click(screen.getByTestId('ops-record-remark-save'))

    // dbId 1 (numeric), NOT the composite 'team:1'
    await waitFor(() => expect(teamsSaveNotes).toHaveBeenCalledWith(1, 'Updated remark'))
    await waitFor(() => expect(refreshed).toBe(true))
    expect(playersSaveNotes).not.toHaveBeenCalled()
  })
})
