/**
 * SyncScreen — import health + merge-review anchor (D-1-T2; replaces the A-2-T1
 * placeholder). Render + wire only — all derivation is in syncSelectors (D-1-T1),
 * mocked-hook driven here. Tokens: ops shell vars only (never hex, never legacy
 * --t2/--t3/--pn/--ln); assertions check the dot `background` is a `var(--…)`.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ImportJob, ImportMergeCandidate } from '../../services'
import { OpsTabBadgeContext, type SetTabBadge } from '../../components/ops/opsTabBadges'

const useSyncData = vi.fn()
vi.mock('../../components/ops/useSyncData', () => ({
  useSyncData: () => useSyncData(),
}))

import { SyncScreen } from './SyncScreen'

const FIXTURE_JOBS: ImportJob[] = [
  {
    id: 'job-1',
    sourceId: 'src-1',
    entityScope: 'teams',
    mode: 'incremental',
    status: 'completed',
    statsJson: { recordsProcessed: 42 },
    errorLog: null,
    cursor: null,
    startedAt: '2026-07-08T20:00:00Z',
    finishedAt: '2026-07-08T20:05:00Z',
    createdAt: '2026-07-08T20:00:00Z',
    source: { id: 'src-1', code: 'OPTA', name: 'Opta Feed' },
    _count: { records: 42, deadLetters: 0 },
  },
  {
    id: 'job-2',
    sourceId: 'src-2',
    entityScope: 'players',
    mode: 'incremental',
    status: 'failed',
    statsJson: {},
    errorLog: 'boom',
    cursor: null,
    startedAt: '2026-07-08T21:00:00Z',
    finishedAt: null,
    createdAt: '2026-07-08T21:00:00Z',
    source: { id: 'src-2', code: 'SPORTRADAR', name: 'Sportradar' },
    _count: { records: 0, deadLetters: 3 },
  },
]

const candidate = (id: string): ImportMergeCandidate => ({
  id,
  entityType: 'team',
  suggestedEntityId: 'team-9',
  confidence: 0.9,
  reasonCodes: ['NAME_MATCH'],
  status: 'pending',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-07-08T00:00:00Z',
  importRecord: {
    id: `rec-${id}`,
    sourceId: 'src-1',
    sourceRecordId: `ext-${id}`,
    entityType: 'team',
    normalizedJson: null,
    sourceUpdatedAt: null,
    source: { id: 'src-1', code: 'OPTA', name: 'Opta Feed' },
  },
})
const FIXTURE_MERGE_CANDIDATES: ImportMergeCandidate[] = [candidate('c1'), candidate('c2')]

function renderScreen(
  data: {
    jobs?: ImportJob[]
    candidates?: ImportMergeCandidate[]
    isSettled?: boolean
  },
  setTabBadge: SetTabBadge = () => {},
) {
  useSyncData.mockReturnValue({
    jobs: data.jobs ?? [],
    candidates: data.candidates ?? [],
    isSettled: data.isSettled ?? true,
    refresh: vi.fn(async () => {}),
  })
  return render(
    <MemoryRouter>
      <OpsTabBadgeContext.Provider value={setTabBadge}>
        <SyncScreen />
      </OpsTabBadgeContext.Provider>
    </MemoryRouter>,
  )
}

afterEach(() => cleanup())

describe('SyncScreen — structure', () => {
  it('keeps the root testid ops-screen-sync (B-1 precedent)', () => {
    renderScreen({ isSettled: true })
    expect(screen.getByTestId('ops-screen-sync')).toBeTruthy()
  })

  it('renders the NIGHTLY SYNC section label (static copy, pin 2)', () => {
    renderScreen({ isSettled: true })
    expect(screen.getByText('NIGHTLY SYNC · 02:00 CET')).toBeTruthy()
  })

  it('renders the MERGE REVIEW section label', () => {
    renderScreen({ isSettled: true })
    expect(screen.getByText('MERGE REVIEW · DEDUPLICATION CANDIDATES')).toBeTruthy()
  })
})

describe('SyncScreen — quiet skeleton before settle', () => {
  it('shows the quiet loading panel and hides jobs + labels until isSettled', () => {
    renderScreen({ isSettled: false, jobs: FIXTURE_JOBS })
    expect(screen.getByTestId('ops-sync-loading')).toBeTruthy()
    expect(screen.queryByText('NIGHTLY SYNC · 02:00 CET')).toBeNull()
    expect(screen.queryAllByTestId('ops-sync-job')).toHaveLength(0)
  })
})

describe('SyncScreen — job cards', () => {
  it('renders one card per job with source name + status line, dot background a var() not hex', () => {
    renderScreen({ isSettled: true, jobs: FIXTURE_JOBS })

    const cards = screen.getAllByTestId('ops-sync-job')
    expect(cards).toHaveLength(2)

    expect(screen.getByText('Opta Feed')).toBeTruthy()
    expect(screen.getByText('Sportradar')).toBeTruthy()

    // TZ=America/New_York, July = EDT (UTC-4): 20:00Z→16:00, 21:00Z→17:00.
    // completed → OK · 42 RECORDS ; failed w/ 3 dead-letters → 3 DEAD-LETTERS.
    expect(screen.getByText('16:00 · OK · 42 RECORDS')).toBeTruthy()
    expect(screen.getByText('17:00 · 3 DEAD-LETTERS')).toBeTruthy()

    for (const card of cards) {
      const dot = card.querySelector('span[aria-hidden="true"]') as HTMLElement
      expect(dot).not.toBeNull()
      expect(dot.style.background.startsWith('var(--')).toBe(true)
      expect(dot.style.background).not.toContain('#')
    }
  })

  it('renders the empty state when there are zero jobs', () => {
    renderScreen({ isSettled: true, jobs: [] })
    expect(screen.getByTestId('ops-sync-empty')).toBeTruthy()
    expect(screen.queryAllByTestId('ops-sync-job')).toHaveLength(0)
  })
})

describe('SyncScreen — merge-review anchor (D-2 fills it)', () => {
  it('renders the merge-review placeholder region', () => {
    renderScreen({ isSettled: true, candidates: [] })
    expect(screen.getByTestId('ops-sync-merge-review')).toBeTruthy()
  })

  it('shows NO PENDING CANDIDATES inside the anchor when there are none', () => {
    renderScreen({ isSettled: true, candidates: [] })
    expect(screen.getByText('NO PENDING CANDIDATES')).toBeTruthy()
  })

  it('hides the empty note when candidates are pending (D-2 will render cards here)', () => {
    renderScreen({ isSettled: true, candidates: FIXTURE_MERGE_CANDIDATES })
    expect(screen.queryByText('NO PENDING CANDIDATES')).toBeNull()
  })
})

describe('SyncScreen — tab badge (pin 5)', () => {
  it('publishes the pending count to the sync tab when there are candidates', () => {
    const setTabBadge = vi.fn()
    renderScreen({ isSettled: true, candidates: FIXTURE_MERGE_CANDIDATES }, setTabBadge)
    expect(setTabBadge).toHaveBeenCalledWith('sync', 2)
  })

  it('publishes undefined (clears) when there are no pending candidates', () => {
    const setTabBadge = vi.fn()
    renderScreen({ isSettled: true, candidates: [] }, setTabBadge)
    expect(setTabBadge).toHaveBeenCalledWith('sync', undefined)
  })
})
