/**
 * Interaction tests for the ops RUNDOWN screen (B-1-T2).
 * Design: docs/design_handoff_planza_ops/README.md §2 PLANNER (screen named
 * Rundown per glossary; URL id stays /ops/planner per ADR-014).
 * Wired contracts: rundown-layout v1 (lanes/blocks incl. post-rename flags),
 * EventInspector v1 (screen-side obligations), ops-selection v1 (?day/?event),
 * ops-tokens v3. Data via the deep-frozen fixture week + its B-1 extension.
 *
 * Pinned decisions exercised here (Story B-1 re-gate 2026-07-04):
 *   pin 3 — ?day absent/invalid → today via the now prop seam.
 *   pin 4 — slots refetch per day; selection changes never refetch.
 *   pin 5 — every block carries a title tooltip; clamped/off-axis flagged there.
 *   pin 7 — unmapped/UNASSIGNED color fallback = --text-shell-3 family;
 *           Channel.color stays DATA when present.
 *   Outline precedence: SELECTED wins over conflicted (design HTML:
 *   `blockOl: isSel ? accent : conflict ? danger : none`).
 */
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Competition, Event } from '../../data/types'
import { DEFAULT_CREW_FIELDS } from '../../data'
import {
  FIXTURE_CHANNELS,
  FIXTURE_CONTRACTS,
  FIXTURE_EVENTS,
  FIXTURE_NOW,
  FIXTURE_PLANS,
  FIXTURE_SLOTS,
} from '../../components/ops/__fixtures__/opsFixtureWeek'

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

const appState = vi.hoisted(() => ({
  events: [] as Event[],
}))

vi.mock('../../context/AppProvider', () => ({
  useApp: () => ({
    events: appState.events,
    competitions: FIXTURE_COMPETITIONS,
    techPlans: FIXTURE_PLANS,
    crewFields: DEFAULT_CREW_FIELDS,
  }),
}))

vi.mock('../../services', () => ({
  contractsApi: { list: vi.fn(async () => FIXTURE_CONTRACTS) },
  channelsApi: { list: vi.fn(async () => FIXTURE_CHANNELS) },
  schedulesApi: { listSlots: vi.fn(async () => FIXTURE_SLOTS) },
}))

import { channelsApi, contractsApi, schedulesApi } from '../../services'
import { RundownScreen } from './RundownScreen'

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
}

/** Day-switch probe (pin-4 refetch test) — sets ?day= like B-2's pills will. */
function DaySwitcher({ day }: { day: string }) {
  const [, setSearchParams] = useSearchParams()
  return (
    <button type="button" onClick={() => setSearchParams({ day })}>
      SWITCH DAY
    </button>
  )
}

const renderScreen = (initialEntry = '/ops/planner?day=2026-03-02', now: Date = FIXTURE_NOW) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RundownScreen now={now} />
      <DaySwitcher day="2026-03-03" />
      <LocationProbe />
    </MemoryRouter>,
  )

const getBlock = (eventId: number) => screen.getByTestId(`ops-rundown-block-${eventId}`)
const findBlock = (eventId: number) => screen.findByTestId(`ops-rundown-block-${eventId}`)
const getLaneLabels = () =>
  screen.getAllByTestId(/^ops-rundown-lane-label-/).map((el) => el.textContent)

/**
 * The quiet slots/channels fetches settle AFTER first paint (event-window /
 * UNASSIGNED intermediate render is the designed fallback). Settle gates:
 *  - channel days: a channel lane label only appears once BOTH fetches landed;
 *  - Thursday (all-UNASSIGNED): e7's DANGLING slot window '16:00 · 90 min'
 *    diverges from its 15:00 event window, so its text proves the slots landed
 *    (waitForThursdaySettle below).
 * Gating makes every slot-dependent assertion deterministic and avoids
 * clicking a node the settle re-render replaced.
 */
const waitForLane = (channelId: number) => screen.findByTestId(`ops-rundown-lane-label-${channelId}`)
const waitForThursdaySettle = () => screen.findByText('16:00 · 90 min')
const EEN_CHANNEL_ID = 2 // fixture channel ids are deliberately ≠ service order

beforeEach(() => {
  appState.events = [...FIXTURE_EVENTS]
})

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
  vi.clearAllMocks()
})

describe('lanes (rundown-layout v1 wiring)', () => {
  it('Monday renders lanes in SERVICE order [Eén, Canvas]; zero-event VRT MAX has no lane', async () => {
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    expect(getLaneLabels()).toEqual(['Eén', 'Canvas'])
  })

  it('Thursday (settled): only the UNASSIGNED lane — e7 via DANGLING slot channelId, e8 by omission', async () => {
    renderScreen('/ops/planner?day=2026-03-05')

    await waitForThursdaySettle()
    expect(getLaneLabels()).toEqual(['UNASSIGNED'])
    expect(getBlock(7)).toBeTruthy()
    expect(getBlock(8)).toBeTruthy()
  })

  it('keeps the OpsShell contract testid ops-screen-planner (URL id per ADR-014; component named Rundown)', () => {
    renderScreen()

    expect(screen.getByTestId('ops-screen-planner')).toBeTruthy()
  })
})

describe('block geometry (README §2 formula — leftPct/widthPct as CSS %)', () => {
  it('e2 (divergent slot, Mon/Canvas) positions at 15:00: left ≈52.6316%, width ≈10.5263%', async () => {
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    const e2 = getBlock(2)
    expect(parseFloat(e2.style.left)).toBeCloseTo(52.631578947368425, 6)
    expect(parseFloat(e2.style.width)).toBeCloseTo(10.526315789473685, 6)
    // line 1 shows the SLOT window (raw), never the event's 14:00 (pin 2)
    expect(within(e2).getByText('15:00 · 120 min')).toBeTruthy()
  })

  it('e1 (clamped cross-24:00) renders [1380,1440]: left ≈94.7368%, width ≈5.2632% — floor yields at the boundary', async () => {
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    const e1 = getBlock(1)
    expect(parseFloat(e1.style.left)).toBeCloseTo(94.73684210526315, 6)
    expect(parseFloat(e1.style.width)).toBeCloseTo(5.263157894736842, 6)
    // line 1 keeps the RAW slot window for the operator (23:00, 150 min)
    expect(within(e1).getByText('23:00 · 150 min')).toBeTruthy()
    expect(e1.title).toContain('CLAMPED TO THE 05:00–24:00 AXIS')
  })

  it('e9 (fully off-axis Fri) renders the floored sliver at the left edge, tooltip-flagged', async () => {
    renderScreen('/ops/planner?day=2026-03-06')

    await waitForLane(EEN_CHANNEL_ID)
    const e9 = getBlock(9)
    expect(parseFloat(e9.style.left)).toBe(0)
    expect(parseFloat(e9.style.width)).toBeCloseTo(7.017543859649122, 6)
    expect(e9.title).toContain('OUTSIDE THE 05:00–24:00 AXIS')
    expect(within(e9).getByText('02:00 · 120 min')).toBeTruthy() // raw window, not the sliver
  })

  it('settled EVENT-window block (e8, Thu): line 1 + geometry from the sanctioned event accessors', async () => {
    renderScreen('/ops/planner?day=2026-03-05')

    await waitForThursdaySettle()
    const e8 = getBlock(8)
    expect(within(e8).getByText('19:30 · 90 min')).toBeTruthy()
    expect(parseFloat(e8.style.left)).toBeCloseTo(76.31578947368422, 6) // (1170−300)/1140
    expect(parseFloat(e8.style.width)).toBeCloseTo(7.894736842105263, 6) // 90/1140
  })

  it('every block carries a title tooltip (pin 5 — occluded blocks stay discoverable)', async () => {
    renderScreen('/ops/planner?day=2026-03-03')

    await waitForLane(EEN_CHANNEL_ID)
    const e3 = getBlock(3)
    const e4 = getBlock(4)
    expect(e3.title).toContain('Tue full-conflict A')
    expect(e4.title).toContain('Tue full-conflict B')
    // unclamped blocks are not flagged
    expect(e3.title).not.toContain('AXIS')
  })
})

describe('colors (pin 7 — Channel.color is DATA; fallback is the --text-shell-3 family)', () => {
  it('DANGLING-channelId block (e7, settled) falls back to the neutral border — screen-level UNASSIGNED coverage', async () => {
    renderScreen('/ops/planner?day=2026-03-05')

    await waitForThursdaySettle()
    expect(getBlock(7).style.borderLeftColor).toBe('var(--text-shell-3)')
  })

  it('channel-resolved blocks use the Channel.color DATA value (not the fallback)', async () => {
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    const e2 = getBlock(2)
    expect(e2.style.borderLeftColor).not.toBe('var(--text-shell-3)')
    expect(e2.style.borderLeftColor).not.toBe('')
  })

  it('the UNASSIGNED lane swatch uses the fallback too (settled)', async () => {
    renderScreen('/ops/planner?day=2026-03-05')

    await waitForThursdaySettle()
    const swatch = screen.getByTestId('ops-rundown-lane-swatch-unassigned')
    expect(swatch.style.backgroundColor).toBe('var(--text-shell-3)')
  })
})

describe('selection + inspector (ADR-014 shared selection; EventInspector v1 embed)', () => {
  it('block click sets ?event= (preserving ?day=), marks the block selected, inspector updates', async () => {
    const user = userEvent.setup()
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID) // click AFTER settle — the re-render replaces early block nodes
    await user.click(getBlock(2))

    expect(screen.getByTestId('location').textContent).toBe('/ops/planner?day=2026-03-02&event=2')
    expect(getBlock(2).getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('ops-inspector-title').textContent).toContain('Mon early')
  })

  it('keyboard: Enter on a focused block selects it (?event=)', async () => {
    const user = userEvent.setup()
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    getBlock(2).focus()
    await user.keyboard('{Enter}')

    expect(screen.getByTestId('location').textContent).toBe('/ops/planner?day=2026-03-02&event=2')
  })

  it('selection changes never refetch (contracts, channels AND slots fetched once) — AC: no full-screen re-render', async () => {
    const user = userEvent.setup()
    const contractsListMock = contractsApi.list as unknown as ReturnType<typeof vi.fn>
    const channelsListMock = channelsApi.list as unknown as ReturnType<typeof vi.fn>
    const slotsMock = schedulesApi.listSlots as unknown as ReturnType<typeof vi.fn>
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    await user.click(getBlock(2))
    await user.click(getBlock(1))
    expect(screen.getByTestId('ops-inspector-title').textContent).toContain('Mon late')

    expect(contractsListMock).toHaveBeenCalledTimes(1)
    expect(channelsListMock).toHaveBeenCalledTimes(1)
    expect(slotsMock).toHaveBeenCalledTimes(1)
  })

  it('no selection → the embedded inspector shows its quiet empty state', async () => {
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    expect(screen.getByTestId('ops-inspector-empty')).toBeTruthy()
  })

  it('deep link ?event=3 (Tue) hydrates selection + the inspector conflict callout', async () => {
    renderScreen('/ops/planner?day=2026-03-03&event=3')

    await waitForLane(EEN_CHANNEL_ID)
    const e3 = getBlock(3)
    expect(e3.getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('ops-inspector-title').textContent).toContain('Tue full-conflict A')
    expect(screen.getByTestId('ops-inspector-conflict')).toBeTruthy()
  })
})

describe('block outlines (crew conflict via the screen\'s single ConflictMap pass)', () => {
  it('crew-conflicted blocks get the danger outline (e3 + e4, Tue)', async () => {
    renderScreen('/ops/planner?day=2026-03-03')

    await waitForLane(EEN_CHANNEL_ID)
    const e3 = getBlock(3)
    expect(e3.style.outlineColor).toBe('var(--alert-danger)')
    expect(getBlock(4).style.outlineColor).toBe('var(--alert-danger)')
  })

  it('non-conflicted, unselected blocks have no outline (e2, Mon)', async () => {
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    const e2 = getBlock(2)
    expect(e2.style.outlineStyle).toBe('none')
  })

  it('SELECTED wins over conflicted (design HTML precedence): selected e3 shows the accent outline', async () => {
    renderScreen('/ops/planner?day=2026-03-03&event=3')

    await waitForLane(EEN_CHANNEL_ID)
    const e3 = getBlock(3)
    expect(e3.style.outlineColor).toBe('var(--accent-shell)')
    // its conflicted partner stays danger-outlined
    expect(getBlock(4).style.outlineColor).toBe('var(--alert-danger)')
  })
})

describe('axis + empty day (AC: axis renders with an empty-state panel, no lanes)', () => {
  it('renders 9 tick labels every 2h from 06:00, positioned on the axis', async () => {
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    for (const label of ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    const firstTick = screen.getByText('06:00')
    expect(parseFloat(firstTick.style.left)).toBeCloseTo(5.263157894736842, 6)
  })

  it('zero-event day (Sat): axis + quiet empty panel, no lanes, no legend', async () => {
    renderScreen('/ops/planner?day=2026-03-07')

    expect(await screen.findByTestId('ops-rundown-empty')).toBeTruthy()
    expect(screen.getByText('06:00')).toBeTruthy() // axis still renders
    expect(screen.queryAllByTestId(/^ops-rundown-lane-label-/)).toEqual([])
    expect(screen.queryByText(/CLICK A BLOCK/)).toBeNull()
  })

  it('legend row renders when lanes exist (README §2)', async () => {
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    expect(screen.getByText('CREW CONFLICT')).toBeTruthy()
    expect(screen.getByText(/CLICK A BLOCK TO SELECT/)).toBeTruthy()
  })
})

describe('day state (pins 3 + 4 — default + per-day slot refetch)', () => {
  it('without ?day, the screen lays out TODAY (local components of now) and fetches slots for it', async () => {
    // local-noon Date → dateStr() is TZ-robust in any test environment
    renderScreen('/ops/planner', new Date(2026, 2, 4, 12, 0, 0))

    // Wednesday has no slots/channels changes to gate on (e5/e6 stay UNASSIGNED
    // before AND after settle) — flush the quiet fetches deterministically.
    await act(async () => {})
    expect(getBlock(5)).toBeTruthy()
    expect(getLaneLabels()).toEqual(['UNASSIGNED'])
    expect(schedulesApi.listSlots).toHaveBeenCalledWith({ date: '2026-03-04' })
  })

  it('day change refetches slots for the new day and swaps the lanes (pin 4)', async () => {
    const user = userEvent.setup()
    const slotsMock = schedulesApi.listSlots as unknown as ReturnType<typeof vi.fn>
    renderScreen('/ops/planner?day=2026-03-02')

    await waitForLane(EEN_CHANNEL_ID)
    expect(getLaneLabels()).toEqual(['Eén', 'Canvas'])

    await user.click(screen.getByRole('button', { name: 'SWITCH DAY' }))

    await findBlock(3) // Tuesday content
    expect(getLaneLabels()).toEqual(['Eén'])
    expect(slotsMock).toHaveBeenCalledTimes(2) // a [] effect dep would leave this at 1
    expect(slotsMock).toHaveBeenNthCalledWith(1, { date: '2026-03-02' })
    expect(slotsMock).toHaveBeenNthCalledWith(2, { date: '2026-03-03' })
  })
})
