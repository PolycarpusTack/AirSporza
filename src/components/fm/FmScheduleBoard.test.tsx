/**
 * FmScheduleBoard render/interaction tests (FM2-1-T2, Story FM2-1, README §2
 * Schedule board). `useApp()`, `useContracts()` (ops), `useScheduleSuggestions`
 * and `eventsApi` are all MOCKED — this suite proves the SCREEN's own
 * wiring/render contract (table scaffold, inspector mount, PLACE/AUTO-SUGGEST
 * calling the real slot-mutation path + refetch), not those units' own
 * behavior (covered by their own test files).
 *
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { Event } from '../../data/types'
import type { UseScheduleSuggestionsReturn } from './useScheduleSuggestions'

const NOW = new Date('2026-03-04T10:00:00') // Wed of the week starting Mon 2026-03-02

function makeEvent(overrides: Partial<Event> & Pick<Event, 'id'>): Event {
  return {
    sportId: 1,
    competitionId: 1,
    participants: `Event ${overrides.id}`,
    startDateBE: '2026-03-02',
    startTimeBE: '18:00',
    channelId: null,
    isLive: false,
    isDelayedLive: false,
    customFields: {},
    ...overrides,
  } as Event
}

const PLACED_EVENT = makeEvent({
  id: 1,
  participants: 'Club Brugge vs Anderlecht',
  startDateBE: '2026-03-02',
  startTimeBE: '18:00',
  channelId: 10,
  channel: { id: 10, name: 'Eén', color: '#E4572E', types: ['linear'] },
})

const UNPLACED_WITH_SUGGESTION = makeEvent({
  id: 2,
  participants: 'Gent vs Genk',
  startDateBE: '2026-03-03',
  startTimeBE: '20:00',
  channelId: null,
})

const UNPLACED_NO_SAFE_SLOT = makeEvent({
  id: 3,
  participants: 'Standard vs Charleroi',
  startDateBE: '2026-03-04',
  startTimeBE: '19:00',
  channelId: null,
})

let appState: {
  events: Event[]
  sports: unknown[]
  competitions: unknown[]
  techPlans: unknown[]
  crewFields: unknown[]
}

vi.mock('../../context/AppProvider', () => ({
  useApp: () => appState,
}))

vi.mock('../ops/useContracts', () => ({
  useContracts: () => ({ contracts: [], isSettled: true }),
}))

let suggestionsState: UseScheduleSuggestionsReturn
const refreshMock = vi.fn()
const useScheduleSuggestionsMock = vi.fn()
vi.mock('./useScheduleSuggestions', () => ({
  useScheduleSuggestions: (week: string) => useScheduleSuggestionsMock(week),
}))

const updateMock = vi.fn()
vi.mock('../../services', () => ({
  eventsApi: { update: (...args: unknown[]) => updateMock(...args) },
}))

const toastError = vi.fn()
vi.mock('../Toast', () => ({
  useToast: () => ({ error: toastError, success: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

import { FmScheduleBoard } from './FmScheduleBoard'

function setSuggestions(unplaced: UseScheduleSuggestionsReturn['unplaced']) {
  suggestionsState = { unplaced, isSettled: true, refresh: refreshMock }
  useScheduleSuggestionsMock.mockImplementation(() => suggestionsState)
}

function renderBoard(initialEntry = '/fm/schedule') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FmScheduleBoard now={NOW} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  appState = {
    events: [PLACED_EVENT, UNPLACED_WITH_SUGGESTION, UNPLACED_NO_SAFE_SLOT],
    sports: [],
    competitions: [],
    techPlans: [],
    crewFields: [],
  }
  updateMock.mockReset().mockResolvedValue(undefined)
  refreshMock.mockReset().mockResolvedValue(undefined)
  toastError.mockReset()
  setSuggestions([
    { eventId: 2, candidates: [{ channelId: 20, channelName: 'Canvas', channelLoad: 1 }] },
    { eventId: 3, candidates: [] },
  ])
})

afterEach(() => cleanup())

describe('table scaffold', () => {
  it('renders the sticky header columns and event rows grouped by day', () => {
    renderBoard()

    const header = screen.getByTestId('fm-schedule-header')
    expect(within(header).getByText('TIME')).toBeInTheDocument()
    expect(within(header).getByText('EVENT')).toBeInTheDocument()
    expect(within(header).getByText('CHANNEL')).toBeInTheDocument()
    expect(within(header).getByText('STATUS')).toBeInTheDocument()
    expect(within(header).getByText('RIGHTS')).toBeInTheDocument()
    expect(within(header).getByText('CREW')).toBeInTheDocument()

    expect(screen.getByTestId('fm-schedule-row-1')).toBeInTheDocument()
    expect(screen.getByTestId('fm-schedule-row-2')).toBeInTheDocument()
    expect(screen.getByTestId('fm-schedule-row-3')).toBeInTheDocument()
    expect(within(screen.getByTestId('fm-schedule-row-1')).getByText('Club Brugge vs Anderlecht')).toBeInTheDocument()
  })

  it('shows the empty state when the week has no events', () => {
    appState = { ...appState, events: [] }
    renderBoard()
    expect(screen.getByTestId('fm-schedule-empty')).toBeInTheDocument()
  })
})

describe('inspector', () => {
  it('mounts EventInspector v1 shape with no selection by default', () => {
    renderBoard()
    expect(screen.getByTestId('ops-inspector')).toBeInTheDocument()
    expect(screen.getByTestId('ops-inspector-empty')).toBeInTheDocument()
  })

  it('selecting a row populates the inspector', async () => {
    renderBoard()
    await userEvent.click(screen.getByTestId('fm-schedule-row-1'))
    expect(screen.getByTestId('ops-inspector-title')).toHaveTextContent('Club Brugge vs Anderlecht')
  })
})

describe('UnplacedTray wiring', () => {
  it('renders tray chips reflecting the suggestions hook', () => {
    renderBoard()
    expect(screen.getByTestId('fm-tray-label')).toHaveTextContent('UNPLACED (2)')
    expect(screen.getByTestId('fm-tray-chip-2')).toHaveAttribute('data-suggestion-state', 'has-suggestion')
    expect(screen.getByTestId('fm-tray-chip-3')).toHaveAttribute('data-suggestion-state', 'no-safe-slot')
  })

  it('PLACE from a chip calls the SAME mutation a manual placement would use, then refreshes', async () => {
    renderBoard()

    await userEvent.click(screen.getByTestId('fm-tray-chip-2'))

    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateMock).toHaveBeenCalledWith(2, { channelId: 20 })
    expect(refreshMock).toHaveBeenCalled()
  })

  it('PLACE failure toasts an error and does not throw', async () => {
    updateMock.mockRejectedValueOnce(new Error('conflict'))
    renderBoard()

    await userEvent.click(screen.getByTestId('fm-tray-chip-2'))

    expect(toastError).toHaveBeenCalled()
  })

  it('AUTO-SUGGEST places every candidate-bearing unplaced event via the SAME mutation, then refreshes once', async () => {
    renderBoard()

    await userEvent.click(screen.getByTestId('fm-tray-auto-suggest'))

    // event 2 has a candidate (top-ranked channelId 20); event 3 has none and must NOT be called.
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateMock).toHaveBeenCalledWith(2, { channelId: 20 })
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
