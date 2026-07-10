/**
 * useRegistryData — quiet parallel fetch for the Registry screen (C-1-T2).
 * Contract: docs/governance/contracts/useRegistryData.md (useRegistryData v1).
 * Idiom mirrors useContracts v1 (quiet failure, isActive cleanup, isSettled
 * settle-vocabulary) extended to FOUR parallel collections + a refresh().
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import type { Competition, Player, Sport, Team } from '../../data/types'

const sportsList = vi.fn()
const competitionsList = vi.fn()
const teamsList = vi.fn()
const playersList = vi.fn()

vi.mock('../../services', () => ({
  sportsApi: { list: (...args: unknown[]) => sportsList(...args) },
  competitionsApi: { list: (...args: unknown[]) => competitionsList(...args) },
  teamsApi: { list: (...args: unknown[]) => teamsList(...args) },
  playersApi: { list: (...args: unknown[]) => playersList(...args) },
}))

import { useRegistryData } from './useRegistryData'

const SPORTS: Sport[] = [{ id: 1, name: 'Football', icon: '⚽', federation: 'FIFA' }]
const COMPETITIONS: Competition[] = [{ id: 101, sportId: 1, name: 'League A', matches: 10, season: '2026' }]
const TEAMS: Team[] = [{ id: 1, tenantId: 't', name: 'Riverside United' }]
const PLAYERS: Player[] = [{ id: 1, tenantId: 't', sportId: 1, fullName: 'Jonas Vale' }]

/** Manually-settleable promise for parallel / mid-flight / post-unmount pins. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  sportsList.mockReset().mockResolvedValue(SPORTS)
  competitionsList.mockReset().mockResolvedValue(COMPETITIONS)
  teamsList.mockReset().mockResolvedValue(TEAMS)
  playersList.mockReset().mockResolvedValue(PLAYERS)
})

afterEach(() => cleanup())

describe('useRegistryData — mount fetch', () => {
  it('fires all four list calls in parallel on mount; before resolution isSettled is false and every collection is []', () => {
    const s = deferred<Sport[]>()
    const c = deferred<Competition[]>()
    const t = deferred<Team[]>()
    const p = deferred<Player[]>()
    sportsList.mockReturnValue(s.promise)
    competitionsList.mockReturnValue(c.promise)
    teamsList.mockReturnValue(t.promise)
    playersList.mockReturnValue(p.promise)

    const { result } = renderHook(() => useRegistryData())

    // all four dispatched synchronously (parallel), none awaited before the next
    expect(sportsList).toHaveBeenCalledTimes(1)
    expect(competitionsList).toHaveBeenCalledTimes(1)
    expect(teamsList).toHaveBeenCalledTimes(1)
    expect(playersList).toHaveBeenCalledTimes(1)

    expect(result.current.isSettled).toBe(false)
    expect(result.current.sports).toEqual([])
    expect(result.current.competitions).toEqual([])
    expect(result.current.teams).toEqual([])
    expect(result.current.players).toEqual([])
  })

  it('populates all four collections and settles once all resolve', async () => {
    const { result } = renderHook(() => useRegistryData())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.sports).toEqual(SPORTS)
    expect(result.current.competitions).toEqual(COMPETITIONS)
    expect(result.current.teams).toEqual(TEAMS)
    expect(result.current.players).toEqual(PLAYERS)
  })
})

describe('useRegistryData — quiet failure (mirrors useContracts pin 2)', () => {
  it('a single rejected fetch leaves ITS collection [] but still settles (others populated)', async () => {
    teamsList.mockReset().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useRegistryData())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.teams).toEqual([])
    expect(result.current.sports).toEqual(SPORTS)
    expect(result.current.competitions).toEqual(COMPETITIONS)
    expect(result.current.players).toEqual(PLAYERS)
  })

  it('all four rejecting still settles with empty collections (no hanging C-2 skeleton)', async () => {
    sportsList.mockReset().mockRejectedValue(new Error('x'))
    competitionsList.mockReset().mockRejectedValue(new Error('x'))
    teamsList.mockReset().mockRejectedValue(new Error('x'))
    playersList.mockReset().mockRejectedValue(new Error('x'))
    const { result } = renderHook(() => useRegistryData())

    await waitFor(() => expect(result.current.isSettled).toBe(true))

    expect(result.current.sports).toEqual([])
    expect(result.current.competitions).toEqual([])
    expect(result.current.teams).toEqual([])
    expect(result.current.players).toEqual([])
  })
})

describe('useRegistryData — refresh()', () => {
  it('refetches all four, updates state, and its promise resolves once all settle', async () => {
    const { result } = renderHook(() => useRegistryData())
    await waitFor(() => expect(result.current.isSettled).toBe(true))
    expect(sportsList).toHaveBeenCalledTimes(1)

    const SPORTS2: Sport[] = [...SPORTS, { id: 2, name: 'Tennis', icon: '🎾', federation: 'ITF' }]
    sportsList.mockResolvedValue(SPORTS2)

    await act(async () => {
      await result.current.refresh()
    })

    expect(sportsList).toHaveBeenCalledTimes(2)
    expect(competitionsList).toHaveBeenCalledTimes(2)
    expect(teamsList).toHaveBeenCalledTimes(2)
    expect(playersList).toHaveBeenCalledTimes(2)
    expect(result.current.sports).toEqual(SPORTS2)
    expect(result.current.isSettled).toBe(true)
  })

  it('does NOT reset isSettled to false while refetching (screen keeps showing data)', async () => {
    const { result } = renderHook(() => useRegistryData())
    await waitFor(() => expect(result.current.isSettled).toBe(true))

    const s = deferred<Sport[]>()
    sportsList.mockReturnValue(s.promise) // sports stays pending; other three resolve

    let refreshPromise!: Promise<void>
    await act(async () => {
      refreshPromise = result.current.refresh()
      // flush the three immediate fetches + any setState while sports is still pending
      await Promise.resolve()
      await Promise.resolve()
    })

    // refetch is in flight (sports pending) → isSettled must remain true
    expect(result.current.isSettled).toBe(true)

    await act(async () => {
      s.resolve(SPORTS)
      await refreshPromise
    })
    expect(result.current.isSettled).toBe(true)
  })
})

describe('useRegistryData — unmount before resolution', () => {
  it('unmounting before the fetches resolve settles cleanly — no throw / no unhandled rejection', async () => {
    // HONEST oracle: under React 18.3.1 post-unmount setState is a SILENT no-op
    // (the old "setState on an unmounted component" warning was removed), so the
    // isActiveRef guard has NO observable R18 signal — removing it would not fail
    // any assertion. It is a forward-compat + refresh-vs-unmount-race guard
    // mirroring useContracts pin 3, not something we can assert "was hit". So this
    // test asserts the ACHIEVABLE guarantee instead: resolving the four fetches
    // after unmount settles cleanly (no throw, no unhandled rejection). The
    // console.error spy is a SECONDARY guard (catches a future React reinstating
    // the warning, or a real throw) — no longer the primary oracle.
    const s = deferred<Sport[]>()
    const c = deferred<Competition[]>()
    const t = deferred<Team[]>()
    const p = deferred<Player[]>()
    sportsList.mockReturnValue(s.promise)
    competitionsList.mockReturnValue(c.promise)
    teamsList.mockReturnValue(t.promise)
    playersList.mockReturnValue(p.promise)

    const rejections: unknown[] = []
    const onRejection = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', onRejection)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = renderHook(() => useRegistryData())
    unmount()

    // resolve AFTER unmount — the awaited resolutions must settle without throwing
    await act(async () => {
      s.resolve(SPORTS)
      c.resolve(COMPETITIONS)
      t.resolve(TEAMS)
      p.resolve(PLAYERS)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(rejections).toEqual([]) // primary oracle: post-unmount resolutions settle cleanly
    expect(errorSpy).not.toHaveBeenCalled() // secondary guard: future React warning / real throw

    process.off('unhandledRejection', onRejection)
    errorSpy.mockRestore()
  })
})
