/**
 * SyncScreen — import health + merge-review anchor (D-1-T2; replaces the A-2-T1
 * placeholder). Render + wire only — all derivation is in syncSelectors (D-1-T1),
 * mocked-hook driven here. Tokens: ops shell vars only (never hex, never legacy
 * --t2/--t3/--pn/--ln); assertions check the dot `background` is a `var(--…)`.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ImportJob, ImportMergeCandidate } from '../../services'
import type { Competition, Event, Sport } from '../../data/types'
import { OpsTabBadgeContext, type SetTabBadge } from '../../components/ops/opsTabBadges'
import { ApiError } from '../../utils/api'

const useSyncData = vi.fn()
vi.mock('../../components/ops/useSyncData', () => ({
  useSyncData: () => useSyncData(),
}))

// D-3-T1: the merge-decision write path. The screen calls importsApi directly.
const importsApiMock = vi.hoisted(() => ({
  approveMergeCandidate: vi.fn(),
  createMergeCandidateEntity: vi.fn(),
}))
vi.mock('../../services', () => ({ importsApi: importsApiMock }))

// D-2-T1: the CURRENT side of a merge comes from AppProvider (events/sports/competitions).
const appState = vi.hoisted(() => ({
  events: [] as Event[],
  sports: [] as Sport[],
  competitions: [] as Competition[],
}))
vi.mock('../../context/AppProvider', () => ({
  useApp: () => ({ events: appState.events, sports: appState.sports, competitions: appState.competitions }),
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

const decisionCandidate = (opts: {
  id: string
  suggestedEntityId: string | null
  confidence?: number
}): ImportMergeCandidate => ({
  id: opts.id,
  entityType: 'event',
  suggestedEntityId: opts.suggestedEntityId,
  confidence: opts.confidence ?? 95,
  reasonCodes: ['NAME_MATCH'],
  status: 'pending',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-07-08T00:00:00Z',
  importRecord: {
    id: `rec-${opts.id}`,
    sourceId: 'src-1',
    sourceRecordId: `ext-${opts.id}`,
    entityType: 'event',
    // homeTeam/awayTeam so cand-high resolves against appState.events[0] (participants 'Home — Away').
    normalizedJson: { homeTeam: 'Home', awayTeam: 'Away' },
    sourceUpdatedAt: null,
    source: { id: 'src-1', code: 'the_sports_db', name: 'Sports Feed A' },
  },
})
// cand-high: suggestedEntityId '1' → resolvable + approvable. cand-low: null → create-only.
const CAND_HIGH = decisionCandidate({ id: 'cand-high', suggestedEntityId: '1' })
const CAND_LOW = decisionCandidate({ id: 'cand-low', suggestedEntityId: null, confidence: 70 })
const FIXTURE_MERGE_CANDIDATES: ImportMergeCandidate[] = [CAND_HIGH, CAND_LOW]

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

beforeEach(() => {
  appState.events = [
    {
      id: 1,
      sportId: 1,
      competitionId: 101,
      participants: 'Home — Away',
      startDateBE: '2026-03-02',
      startTimeBE: '20:00',
      isLive: false,
      isDelayedLive: false,
      customFields: {},
    },
  ]
  appState.sports = [
    { id: 1, name: 'Football', icon: '⚽', federation: 'FIFA' },
    { id: 2, name: 'Tennis', icon: '🎾', federation: 'ITF' },
  ]
  appState.competitions = [{ id: 101, sportId: 1, name: 'League A', matches: 10, season: '2026' }]

  importsApiMock.approveMergeCandidate.mockReset().mockResolvedValue({ message: 'ok', candidate: {} })
  importsApiMock.createMergeCandidateEntity.mockReset().mockResolvedValue({ message: 'ok', candidate: {} })
})

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

describe('SyncScreen — merge cards (D-2-T1)', () => {
  const mergeCandidate = (opts: {
    id: string
    confidence?: number
    suggestedEntityId?: string | null
    normalizedJson: Record<string, unknown> | null
    code?: string
  }): ImportMergeCandidate => ({
    id: opts.id,
    entityType: 'event',
    suggestedEntityId: opts.suggestedEntityId ?? null,
    confidence: opts.confidence ?? 95,
    reasonCodes: ['NAME_MATCH'],
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-07-08T00:00:00Z',
    importRecord: {
      id: `rec-${opts.id}`,
      sourceId: 'src-1',
      sourceRecordId: `ext-${opts.id}`,
      entityType: 'event',
      normalizedJson: opts.normalizedJson,
      sourceUpdatedAt: null,
      source: { id: 'src-1', code: opts.code ?? 'the_sports_db', name: 'Sports Feed A' },
    },
  })

  it('renders a resolved card with a flagged diff row and the % MATCH in the green band', () => {
    renderScreen({
      isSettled: true,
      candidates: [
        mergeCandidate({
          id: 'm1',
          confidence: 95,
          suggestedEntityId: '1',
          // SPORT differs (Tennis vs Football); COMPETITION/DATE/PARTICIPANTS match.
          normalizedJson: {
            sportName: 'Tennis',
            competitionName: 'League A',
            startsAtUtc: '2026-03-02T10:00:00.000Z',
            homeTeam: 'Home',
            awayTeam: 'Away',
          },
        }),
      ],
    })

    expect(screen.getByTestId('ops-sync-merge-card')).toBeTruthy()

    const match = screen.getByText('95% MATCH')
    expect(match.style.color).toBe('var(--status-approved)')

    const diffRows = screen.getAllByTestId('ops-sync-diff-row')
    expect(diffRows).toHaveLength(4)

    // SPORT row: incoming 'Tennis' flagged amber (changed); current 'Football' neutral.
    const incoming = screen.getByText('Tennis')
    expect(incoming.style.color).toBe('var(--alert-warning)')
    const current = screen.getByText('Football')
    expect(current.style.color).toBe('var(--text-shell-2)')

    // APPROVE enabled when a suggestedEntityId exists.
    expect((screen.getByTestId('ops-sync-approve') as HTMLButtonElement).disabled).toBe(false)
  })

  it('renders a sub-90 candidate with the % MATCH in the amber band', () => {
    renderScreen({
      isSettled: true,
      candidates: [
        mergeCandidate({
          id: 'm2',
          confidence: 62,
          suggestedEntityId: '1',
          normalizedJson: { sportName: 'Football', homeTeam: 'Home', awayTeam: 'Away' },
        }),
      ],
    })
    const match = screen.getByText('62% MATCH')
    expect(match.style.color).toBe('var(--alert-warning)')
  })

  it('a create-only candidate (null suggestedEntityId) → APPROVE disabled + no CURRENT column', () => {
    renderScreen({
      isSettled: true,
      candidates: [
        mergeCandidate({
          id: 'm3',
          confidence: 70,
          suggestedEntityId: null,
          normalizedJson: { sportName: 'Football', homeTeam: 'Home', awayTeam: 'Away' },
        }),
      ],
    })
    const approve = screen.getByTestId('ops-sync-approve') as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    expect(approve.title.length).toBeGreaterThan(0) // tooltip explains why
    expect(screen.queryAllByTestId('ops-sync-diff-row')).toHaveLength(0)
  })

  it('an unresolvable current (suggestedEntityId not loaded) → incoming-only, quiet note, no crash', () => {
    renderScreen({
      isSettled: true,
      candidates: [
        mergeCandidate({
          id: 'm4',
          confidence: 88,
          suggestedEntityId: '999', // not in appState.events
          normalizedJson: { sportName: 'Football', homeTeam: 'Home', awayTeam: 'Away' },
        }),
      ],
    })
    expect(screen.getByTestId('ops-sync-merge-card')).toBeTruthy()
    expect(screen.getByText('CURRENT NOT LOADED')).toBeTruthy()
    expect(screen.queryAllByTestId('ops-sync-diff-row')).toHaveLength(0)
    // the whole diff-table chrome is gone, not just the rows (empty header box must not render)
    expect(screen.queryByText('FIELD')).toBeNull()
    expect(screen.queryByText('CURRENT')).toBeNull()
    // suggestedEntityId is non-null → APPROVE stays enabled even though current isn't loaded.
    expect((screen.getByTestId('ops-sync-approve') as HTMLButtonElement).disabled).toBe(false)
  })

  it('renders one card per candidate', () => {
    renderScreen({
      isSettled: true,
      candidates: [
        mergeCandidate({ id: 'a', suggestedEntityId: '1', normalizedJson: { homeTeam: 'H', awayTeam: 'A' } }),
        mergeCandidate({ id: 'b', suggestedEntityId: null, normalizedJson: { homeTeam: 'H2', awayTeam: 'A2' } }),
      ],
    })
    expect(screen.getAllByTestId('ops-sync-merge-card')).toHaveLength(2)
  })
})

describe('SyncScreen — merge decisions (D-3-T1)', () => {
  const firstCard = () => screen.getAllByTestId('ops-sync-merge-card')[0]

  it('single-flight APPROVE — a rapid double-click fires approveMergeCandidate exactly once', () => {
    // deferred promise: the 2nd click lands while the 1st is still in flight.
    importsApiMock.approveMergeCandidate.mockReturnValue(new Promise(() => {}))
    renderScreen({ candidates: [CAND_HIGH] })

    const approve = within(firstCard()).getByTestId('ops-sync-approve')
    fireEvent.click(approve)
    fireEvent.click(approve)

    expect(importsApiMock.approveMergeCandidate).toHaveBeenCalledTimes(1)
    // targetEntityId is the suggestedEntityId (VERIFIED contract).
    expect(importsApiMock.approveMergeCandidate).toHaveBeenCalledWith('cand-high', '1')
    expect(importsApiMock.createMergeCandidateEntity).not.toHaveBeenCalled()
  })

  it('single-flight KEEP — a rapid double-click fires createMergeCandidateEntity exactly once', () => {
    importsApiMock.createMergeCandidateEntity.mockReturnValue(new Promise(() => {}))
    renderScreen({ candidates: [CAND_HIGH] })

    const keep = within(firstCard()).getByTestId('ops-sync-keep')
    fireEvent.click(keep)
    fireEvent.click(keep)

    expect(importsApiMock.createMergeCandidateEntity).toHaveBeenCalledTimes(1)
    expect(importsApiMock.createMergeCandidateEntity).toHaveBeenCalledWith('cand-high')
    expect(importsApiMock.approveMergeCandidate).not.toHaveBeenCalled()
  })

  // The two tests above pass via React's `disabled` re-render between clicks. These
  // two ISOLATE the synchronous `isSubmittingRef` latch as the SOLE guard: two NATIVE
  // clicks inside ONE `act()` — no re-render lands between them, so only the ref can
  // drop the 2nd. (Verified: both FAIL when `if (isSubmittingRef.current) return` is
  // removed, PASS with it present.) Irreversible 2nd write surface — worth the belt.
  it('single-flight APPROVE — two synchronous native clicks (ref is the sole guard) fire once', () => {
    importsApiMock.approveMergeCandidate.mockReturnValue(new Promise(() => {}))
    renderScreen({ candidates: [CAND_HIGH] })

    const approve = within(firstCard()).getByTestId('ops-sync-approve')
    act(() => {
      approve.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      approve.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(importsApiMock.approveMergeCandidate).toHaveBeenCalledTimes(1)
  })

  it('single-flight KEEP — two synchronous native clicks (ref is the sole guard) fire once', () => {
    importsApiMock.createMergeCandidateEntity.mockReturnValue(new Promise(() => {}))
    renderScreen({ candidates: [CAND_HIGH] })

    const keep = within(firstCard()).getByTestId('ops-sync-keep')
    act(() => {
      keep.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      keep.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(importsApiMock.createMergeCandidateEntity).toHaveBeenCalledTimes(1)
  })

  it('APPROVE success → terminal ✓ MERGED status replaces the footer + badge decrements', async () => {
    const setTabBadge = vi.fn()
    renderScreen({ candidates: [CAND_HIGH, CAND_LOW] }, setTabBadge)
    // 2 pending on mount.
    expect(setTabBadge).toHaveBeenLastCalledWith('sync', 2)

    fireEvent.click(within(firstCard()).getByTestId('ops-sync-approve'))

    const status = await within(firstCard()).findByTestId('ops-sync-decision-status')
    expect(status.textContent).toBe('✓ MERGED INTO REGISTRY')
    expect(status.style.color).toBe('var(--status-approved)')
    // buttons gone — not re-decidable in-view.
    expect(within(firstCard()).queryByTestId('ops-sync-approve')).toBeNull()
    expect(within(firstCard()).queryByTestId('ops-sync-keep')).toBeNull()
    // badge decremented 2 → 1 via the decided-exclusion.
    await waitFor(() => expect(setTabBadge).toHaveBeenLastCalledWith('sync', 1))
  })

  it('KEEP success → terminal KEPT AS SEPARATE RECORDS status', async () => {
    renderScreen({ candidates: [CAND_HIGH] })
    fireEvent.click(within(firstCard()).getByTestId('ops-sync-keep'))

    const status = await within(firstCard()).findByTestId('ops-sync-decision-status')
    expect(status.textContent).toBe('KEPT AS SEPARATE RECORDS')
    expect(status.style.color).toBe('var(--text-shell-2)')
    expect(within(firstCard()).queryByTestId('ops-sync-keep')).toBeNull()
  })

  // A 409 "already decided" (human-readable) stands in for any decision rejection.
  const rejectKeepWith409 = () =>
    importsApiMock.createMergeCandidateEntity.mockRejectedValueOnce(
      new ApiError(409, 'Merge candidate has already been decided (create_new)'),
    )

  it('decision failure → renders the inline error with the message', async () => {
    rejectKeepWith409()
    renderScreen({ candidates: [CAND_HIGH] })

    fireEvent.click(within(firstCard()).getByTestId('ops-sync-keep'))

    const err = await within(firstCard()).findByTestId('ops-sync-decision-error')
    expect(err.textContent).toContain('already been decided')
  })

  it('decision failure → both APPROVE and KEEP re-enable', async () => {
    rejectKeepWith409()
    renderScreen({ candidates: [CAND_HIGH] })

    fireEvent.click(within(firstCard()).getByTestId('ops-sync-keep'))
    await within(firstCard()).findByTestId('ops-sync-decision-error')

    expect((within(firstCard()).getByTestId('ops-sync-keep') as HTMLButtonElement).disabled).toBe(false)
    expect((within(firstCard()).getByTestId('ops-sync-approve') as HTMLButtonElement).disabled).toBe(false)
  })

  it('decision failure → badge count unchanged (decided map untouched)', async () => {
    const setTabBadge = vi.fn()
    rejectKeepWith409()
    renderScreen({ candidates: [CAND_HIGH] }, setTabBadge)
    expect(setTabBadge).toHaveBeenLastCalledWith('sync', 1)

    fireEvent.click(within(firstCard()).getByTestId('ops-sync-keep'))
    await within(firstCard()).findByTestId('ops-sync-decision-error')

    expect(setTabBadge).toHaveBeenLastCalledWith('sync', 1)
  })

  it('decision failure → a subsequent click retries (latch released → fires again)', async () => {
    rejectKeepWith409() // first attempt rejects; the beforeEach default resolves the retry
    renderScreen({ candidates: [CAND_HIGH] })

    fireEvent.click(within(firstCard()).getByTestId('ops-sync-keep'))
    await within(firstCard()).findByTestId('ops-sync-decision-error')
    expect(importsApiMock.createMergeCandidateEntity).toHaveBeenCalledTimes(1)

    fireEvent.click(within(firstCard()).getByTestId('ops-sync-keep'))
    await within(firstCard()).findByTestId('ops-sync-decision-status')
    expect(importsApiMock.createMergeCandidateEntity).toHaveBeenCalledTimes(2)
  })

  it('null suggestedEntityId → APPROVE disabled, KEEP still enabled', () => {
    renderScreen({ candidates: [CAND_LOW] })
    expect((within(firstCard()).getByTestId('ops-sync-approve') as HTMLButtonElement).disabled).toBe(true)
    expect((within(firstCard()).getByTestId('ops-sync-keep') as HTMLButtonElement).disabled).toBe(false)
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
