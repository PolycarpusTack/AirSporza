/**
 * OpsShell chrome/tab tests (A-2-T1, ADR-012 · README §Layout constants).
 * Contract: docs/governance/contracts/OpsShell.md (OpsShell v1).
 * Token names per ops-tokens v2 — assertions check var() references, never hex.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The real ScheduleScreen (A-3-T2) and RundownScreen (B-1-T2) need AppProvider
// data + quiet fetches — stubbed empty here (screen behavior is covered by
// their own test files; this file tests the shell chrome/routing only).
vi.mock('../../context/AppProvider', () => ({
  useApp: () => ({ events: [], sports: [], competitions: [], techPlans: [], crewFields: [] }),
}))
vi.mock('../../services', () => ({
  contractsApi: { list: vi.fn(async () => []) },
  channelsApi: { list: vi.fn(async () => []) },
  schedulesApi: { listSlots: vi.fn(async () => []) },
  // C-2-T2: the registry tab now renders the real RegistryScreen → useRegistryData
  // fetches these four (quiet — stubbed empty; RegistryScreen behavior has its own suite).
  sportsApi: { list: vi.fn(async () => []) },
  competitionsApi: { list: vi.fn(async () => []) },
  teamsApi: { list: vi.fn(async () => []) },
  playersApi: { list: vi.fn(async () => []) },
  // D-1-T2: the sync tab now renders the real SyncScreen → useSyncData fetches
  // these two (quiet — stubbed empty; per-test overrides via vi.mocked for the
  // pin-5 badge integration test below).
  importsApi: { listJobs: vi.fn(async () => []), listMergeCandidates: vi.fn(async () => []) },
}))

import { OpsShell, OPS_TABS, type OpsTabId } from './OpsShell'
import { importsApi, type ImportJob, type ImportMergeCandidate } from '../../services'

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
]
const pendingCandidate = (id: string): ImportMergeCandidate => ({
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
const FIXTURE_MERGE_CANDIDATES: ImportMergeCandidate[] = [pendingCandidate('c1'), pendingCandidate('c2')]

function LocationProbe() {
  const location = useLocation()
  return (
    <>
      <span data-testid="location">{location.pathname}</span>
      <span data-testid="location-search">{location.search}</span>
    </>
  )
}

const renderShell = (initialPath = '/ops', tabBadges?: Partial<Record<OpsTabId, number>>) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/ops/*" element={<OpsShell tabBadges={tabBadges} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )

const currentPath = () => screen.getByTestId('location').textContent
const currentSearch = () => screen.getByTestId('location-search').textContent

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
  document.documentElement.removeAttribute('data-theme')
  localStorage.clear()
})

describe('tab registry (ADR-014 public URL contract)', () => {
  it('exposes exactly the five contracted tab ids, in order', () => {
    expect(OPS_TABS.map((t) => t.id)).toEqual(['schedule', 'planner', 'rights', 'registry', 'sync'])
  })
})

describe('routing inside the shell', () => {
  it('redirects the /ops index to /ops/schedule', () => {
    renderShell('/ops')

    expect(currentPath()).toBe('/ops/schedule')
    expect(screen.getByTestId('ops-screen-schedule')).toBeTruthy()
  })

  it('falls back to schedule for unknown tab segments', () => {
    renderShell('/ops/bogus')

    expect(currentPath()).toBe('/ops/schedule')
  })

  it('clicking the PLANNER tab navigates to /ops/planner and shows the Rundown screen', async () => {
    const user = userEvent.setup()
    renderShell('/ops')

    await user.click(screen.getByRole('link', { name: 'PLANNER' }))

    expect(currentPath()).toBe('/ops/planner')
    expect(screen.getByTestId('ops-screen-planner')).toBeTruthy() // renders RundownScreen (glossary)
  })

  it.each(OPS_TABS)('tab $id reaches its screen', async (tab) => {
    const user = userEvent.setup()
    renderShell('/ops')

    await user.click(screen.getByRole('link', { name: new RegExp(`^${tab.label}`) }))

    expect(currentPath()).toBe(`/ops/${tab.id}`)
    expect(screen.getByTestId(`ops-screen-${tab.id}`)).toBeTruthy()
  })
})

describe('tab navigation carries ops query params (ADR-014 amendment)', () => {
  it('preserves ?day when switching tabs', async () => {
    const user = userEvent.setup()
    renderShell('/ops/planner?day=2026-03-02')

    await user.click(screen.getByRole('link', { name: 'SCHEDULE' }))

    expect(currentPath()).toBe('/ops/schedule')
    expect(currentSearch()).toBe('?day=2026-03-02')
  })

  it('preserves ?record when switching tabs', async () => {
    const user = userEvent.setup()
    renderShell('/ops/registry?record=team-7')

    await user.click(screen.getByRole('link', { name: 'RIGHTS' }))

    expect(currentPath()).toBe('/ops/rights')
    expect(currentSearch()).toBe('?record=team-7')
  })
})

describe('chrome (README §Layout constants, ops-tokens v2)', () => {
  it('renders brand PLANZA with /OPS in the shell accent token', () => {
    renderShell()

    const brand = screen.getByText('PLANZA')
    const ops = screen.getByText('/OPS')
    expect(brand).toBeTruthy()
    expect(ops.style.color).toBe('var(--accent-shell)')
  })

  it('renders the full chrome inventory: 5 tabs, LIVE badge, theme toggle', () => {
    renderShell()

    for (const tab of OPS_TABS) {
      expect(screen.getByRole('link', { name: new RegExp(`^${tab.label}`) })).toBeTruthy()
    }
    expect(screen.getByTestId('ops-live-badge')).toBeTruthy()
    expect(screen.getByRole('button', { name: '☀ LIGHT' })).toBeTruthy()
  })

  it('active tab uses accent bg + accent-fg text; inactive tabs use text-shell-2', () => {
    renderShell('/ops/rights')

    const active = screen.getByRole('link', { name: 'RIGHTS' })
    expect(active.getAttribute('aria-current')).toBe('page')
    expect(active.style.background).toBe('var(--accent-shell)')
    expect(active.style.color).toBe('var(--accent-shell-fg)')

    const inactive = screen.getByRole('link', { name: 'SCHEDULE' })
    expect(inactive.getAttribute('aria-current')).toBeNull()
    expect(inactive.style.color).toBe('var(--text-shell-2)')
  })

  it('LIVE dot pulses: class wired to the ops.css keyframes (1.4s ease infinite, opacity to 0.3)', () => {
    renderShell()

    const dot = screen.getByTestId('ops-live-badge').querySelector('.ops-live-dot')
    expect(dot).not.toBeNull()

    // jsdom does not compute animations — pin the stylesheet contract instead;
    // the visual pulse itself is A-5 E2E scope.
    const css = readFileSync(resolve(__dirname, 'ops.css'), 'utf8')

    // the fading opacity must live INSIDE the ops-live-pulse keyframes block
    const keyframesBlock = css.match(/@keyframes\s+ops-live-pulse\s*\{[\s\S]*?^\}/m)?.[0]
    expect(keyframesBlock).toBeDefined()
    expect(keyframesBlock).toMatch(/opacity:\s*0?\.3/)

    // the dot rule must reference each animation shorthand token (order-agnostic)
    const dotRule = css.match(/\.ops-live-dot\s*\{[\s\S]*?\}/)?.[0]
    expect(dotRule).toBeDefined()
    for (const token of ['ops-live-pulse', '1.4s', 'ease', 'infinite', 'var(--alert-danger)']) {
      expect(dotRule).toContain(token)
    }
  })
})

describe('theme toggle integration (provider behavior unit-tested in OpsThemeProvider.test.tsx)', () => {
  it('click → light theme on <html> and relabel to ☾ DARK; click again → back to dark', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(screen.getByRole('button', { name: '☀ LIGHT' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    await user.click(screen.getByRole('button', { name: '☾ DARK' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('SYNC badge slot (wired for real in EPIC D)', () => {
  it('renders SYNC [n] when a badge count is provided', () => {
    renderShell('/ops', { sync: 3 })

    expect(screen.getByRole('link', { name: 'SYNC [3]' })).toBeTruthy()
  })

  it('renders a plain SYNC tab when no badge is provided', () => {
    renderShell()

    const sync = screen.getByRole('link', { name: 'SYNC' })
    expect(sync.textContent).toBe('SYNC')
  })

  // pin-5 end-to-end: the real SyncScreen (mounted at /ops/sync) publishes its
  // pending-merge count UP through OpsTabBadgeContext to the shell tab bar. No
  // tabBadges prop — the live count is the sole source.
  it('SYNC tab reflects the live pending-merge count from the mounted SyncScreen', async () => {
    vi.mocked(importsApi.listJobs).mockResolvedValue(FIXTURE_JOBS)
    vi.mocked(importsApi.listMergeCandidates).mockResolvedValue(FIXTURE_MERGE_CANDIDATES)

    renderShell('/ops/sync')

    expect(await screen.findByRole('link', { name: 'SYNC [2]' })).toBeTruthy()

    vi.mocked(importsApi.listJobs).mockResolvedValue([])
    vi.mocked(importsApi.listMergeCandidates).mockResolvedValue([])
  })

  // pin-5 clear path (the D-3 decrement seam): once a later sync load has no
  // pending candidates, SyncScreen publishes `undefined` and the shell must
  // DELETE the badge — the tab returns to a plain SYNC. Driven here by a
  // navigate-away-and-back remount (a proxy for D-3's post-decision refresh()).
  it('clears the SYNC badge when a later sync load returns zero pending candidates', async () => {
    const user = userEvent.setup()
    vi.mocked(importsApi.listJobs).mockResolvedValue(FIXTURE_JOBS)
    vi.mocked(importsApi.listMergeCandidates).mockResolvedValue(FIXTURE_MERGE_CANDIDATES)

    renderShell('/ops/sync')
    expect(await screen.findByRole('link', { name: 'SYNC [2]' })).toBeTruthy()

    // the next load clears out — the candidate was decided elsewhere
    vi.mocked(importsApi.listMergeCandidates).mockResolvedValue([])

    await user.click(screen.getByRole('link', { name: 'SCHEDULE' }))
    await user.click(screen.getByRole('link', { name: /^SYNC/ })) // remount → refetch → publish undefined

    expect(await screen.findByRole('link', { name: 'SYNC' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'SYNC [2]' })).toBeNull()

    vi.mocked(importsApi.listJobs).mockResolvedValue([])
  })
})
