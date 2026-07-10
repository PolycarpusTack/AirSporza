/**
 * Unit tests for useLinkedRecords (C-3-T1) — the LAZY per-selection linked-record
 * fetch hook. Mirrors the useRegistryData/useContracts idiom: quiet failure,
 * per-run active guard (stale fetch from a previous selection never wins).
 * Contracts: registry-selectors v1.1 (linkedRecordsOf), the typed link services.
 *
 * @vitest-environment jsdom
 */
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerTeamLink, TeamCompetitionLink } from '../../services'
import {
  FIXTURE_COMPETITIONS,
  FIXTURE_PLAYERS,
  FIXTURE_SPORTS,
  FIXTURE_TEAMS,
  makePlayer,
  makeTeam,
} from './__fixtures__/opsFixtureWeek'
import { buildRegistryIndex } from './registrySelectors'

const teamsList = vi.fn()
const teamsListCompetitions = vi.fn()
const playersList = vi.fn()
const playersListTeams = vi.fn()

vi.mock('../../services', () => ({
  teamsApi: {
    list: (...args: unknown[]) => teamsList(...args),
    listCompetitions: (...args: unknown[]) => teamsListCompetitions(...args),
  },
  playersApi: {
    list: (...args: unknown[]) => playersList(...args),
    listTeams: (...args: unknown[]) => playersListTeams(...args),
  },
}))

import { useLinkedRecords } from './useLinkedRecords'

const index = buildRegistryIndex(FIXTURE_SPORTS, FIXTURE_COMPETITIONS, FIXTURE_TEAMS, FIXTURE_PLAYERS)
const rec = (id: string) => index.byId.get(id)!

const tcLink = (competition: { id: number; name: string }): TeamCompetitionLink => ({
  id: competition.id,
  teamId: 1,
  competitionId: competition.id,
  seasonId: null,
  source: 'manual',
  competition: { id: competition.id, name: competition.name, season: '2026' },
})
const ptLink = (team: { id: number; name: string } | null, id = team?.id ?? 0): PlayerTeamLink => ({
  id,
  playerId: 1,
  teamId: team?.id ?? null,
  competitionId: null,
  seasonId: null,
  isCurrent: true,
  source: 'manual',
  team: team ? { id: team.id, name: team.name } : null,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => (resolve = res))
  return { promise, resolve }
}

beforeEach(() => {
  teamsList.mockReset().mockResolvedValue([])
  teamsListCompetitions.mockReset().mockResolvedValue([])
  playersList.mockReset().mockResolvedValue([])
  playersListTeams.mockReset().mockResolvedValue([])
})
afterEach(() => cleanup())

describe('useLinkedRecords — per-kind fetch + mapping', () => {
  it('null record → no fetch, empty sections', () => {
    const { result } = renderHook(() => useLinkedRecords(null, index))
    expect(result.current.sections).toEqual([])
    expect(teamsList).not.toHaveBeenCalled()
    expect(playersListTeams).not.toHaveBeenCalled()
  })

  it('sport → NO fetch; sections derived synchronously from the index adjacency', () => {
    const { result } = renderHook(() => useLinkedRecords(rec('sport:1'), index))

    // ALL four service fns pinned absent — the sport arm must not route to any fetch.
    expect(teamsList).not.toHaveBeenCalled()
    expect(teamsListCompetitions).not.toHaveBeenCalled()
    expect(playersList).not.toHaveBeenCalled()
    expect(playersListTeams).not.toHaveBeenCalled()
    expect(result.current.sections).toEqual([
      {
        relation: 'competitions',
        records: [
          { recordId: 'competition:101', name: 'League A', kind: 'competition' },
          { recordId: 'competition:103', name: 'Cup C', kind: 'competition' },
          { recordId: 'competition:108', name: 'Series H', kind: 'competition' },
        ],
      },
    ])
  })

  it('competition → teamsApi.list({ competitionId }) → teams section', async () => {
    teamsList.mockResolvedValue([makeTeam({ id: 1, name: 'Riverside United' }), makeTeam({ id: 2, name: 'Coastal Rovers' })])
    const { result } = renderHook(() => useLinkedRecords(rec('competition:101'), index))

    expect(teamsList).toHaveBeenCalledWith({ competitionId: 101 })
    await waitFor(() =>
      expect(result.current.sections).toEqual([
        {
          relation: 'teams',
          records: [
            { recordId: 'team:1', name: 'Riverside United', kind: 'team' },
            { recordId: 'team:2', name: 'Coastal Rovers', kind: 'team' },
          ],
        },
      ]),
    )
  })

  it('team → listCompetitions + list({ teamId }) in parallel → competitions + players sections', async () => {
    teamsListCompetitions.mockResolvedValue([tcLink({ id: 101, name: 'League A' })])
    playersList.mockResolvedValue([makePlayer({ id: 1, fullName: 'Jonas Vale' })])
    const { result } = renderHook(() => useLinkedRecords(rec('team:1'), index))

    expect(teamsListCompetitions).toHaveBeenCalledWith(1)
    expect(playersList).toHaveBeenCalledWith({ teamId: 1 })
    await waitFor(() =>
      expect(result.current.sections).toEqual([
        { relation: 'competitions', records: [{ recordId: 'competition:101', name: 'League A', kind: 'competition' }] },
        { relation: 'players', records: [{ recordId: 'player:1', name: 'Jonas Vale', kind: 'player' }] },
      ]),
    )
  })

  it('player → playersApi.listTeams → teams section (null-team link skipped)', async () => {
    playersListTeams.mockResolvedValue([ptLink({ id: 1, name: 'Riverside United' }), ptLink(null, 9)])
    const { result } = renderHook(() => useLinkedRecords(rec('player:1'), index))

    expect(playersListTeams).toHaveBeenCalledWith(1)
    await waitFor(() =>
      expect(result.current.sections).toEqual([
        { relation: 'teams', records: [{ recordId: 'team:1', name: 'Riverside United', kind: 'team' }] },
      ]),
    )
  })
})

describe('useLinkedRecords — quiet failure + re-selection + stale guard', () => {
  it('rejected fetch → empty sections (quiet, no throw)', async () => {
    teamsList.mockRejectedValue(new Error('api down'))
    const { result } = renderHook(() => useLinkedRecords(rec('competition:101'), index))

    // stays empty; give the rejection a tick to settle
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.sections).toEqual([])
  })

  it('re-selection re-fetches for the new record', async () => {
    teamsList.mockResolvedValue([makeTeam({ id: 1, name: 'Riverside United' })])
    const { rerender } = renderHook(({ record }) => useLinkedRecords(record, index), {
      initialProps: { record: rec('competition:101') },
    })
    await waitFor(() => expect(teamsList).toHaveBeenCalledWith({ competitionId: 101 }))

    rerender({ record: rec('competition:102') })
    await waitFor(() => expect(teamsList).toHaveBeenCalledWith({ competitionId: 102 }))
    expect(teamsList).toHaveBeenCalledTimes(2)
  })

  it('id-key anti-flash: during a new selection\'s fetch window, the PRIOR selection\'s (already-resolved) rows are NOT shown', async () => {
    // A (101) resolves; then switch to B (102) whose fetch is DEFERRED (still open).
    // The id-key gate (fetched.recordId === record.id) must yield [] for B — never
    // flash A's teams — until B's own fetch resolves.
    teamsList.mockResolvedValueOnce([makeTeam({ id: 1, name: 'Riverside United' })]) // for 101
    const slow = deferred<ReturnType<typeof makeTeam>[]>()
    teamsList.mockReturnValueOnce(slow.promise) // for 102 — deferred

    const { result, rerender } = renderHook(({ record }) => useLinkedRecords(record, index), {
      initialProps: { record: rec('competition:101') },
    })
    await waitFor(() =>
      expect(result.current.sections).toEqual([
        { relation: 'teams', records: [{ recordId: 'team:1', name: 'Riverside United', kind: 'team' }] },
      ]),
    )

    // switch to 102 — its fetch is still pending → fetch window
    rerender({ record: rec('competition:102') })
    await act(async () => {
      await Promise.resolve()
    })
    // MUST NOT flash 101's teams — no payload for 102 yet → empty (section omitted)
    expect(result.current.sections).toEqual([])

    // now 102 resolves → its own teams appear
    await act(async () => {
      slow.resolve([makeTeam({ id: 2, name: 'Coastal Rovers' })])
      await Promise.resolve()
    })
    expect(result.current.sections).toEqual([
      { relation: 'teams', records: [{ recordId: 'team:2', name: 'Coastal Rovers', kind: 'team' }] },
    ])
  })

  it('stale-fetch guard: a prior selection resolving LATE never overwrites the current selection', async () => {
    // competition:101 fetch is deferred (slow); competition:102 resolves fast.
    const slow = deferred<ReturnType<typeof makeTeam>[]>()
    teamsList.mockReturnValueOnce(slow.promise) // for 101
    teamsList.mockResolvedValue([makeTeam({ id: 2, name: 'Coastal Rovers' })]) // for 102

    const { result, rerender } = renderHook(({ record }) => useLinkedRecords(record, index), {
      initialProps: { record: rec('competition:101') },
    })

    rerender({ record: rec('competition:102') })
    await waitFor(() =>
      expect(result.current.sections).toEqual([
        { relation: 'teams', records: [{ recordId: 'team:2', name: 'Coastal Rovers', kind: 'team' }] },
      ]),
    )

    // NOW the stale 101 fetch resolves — it must be ignored (active guard).
    await act(async () => {
      slow.resolve([makeTeam({ id: 1, name: 'Riverside United' })])
      await Promise.resolve()
    })
    expect(result.current.sections).toEqual([
      { relation: 'teams', records: [{ recordId: 'team:2', name: 'Coastal Rovers', kind: 'team' }] },
    ])
  })
})
