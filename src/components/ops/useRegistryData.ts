/**
 * useRegistryData — the Registry screen's quiet parallel fetch (C-1-T2).
 * Contract: docs/governance/contracts/useRegistryData.md (useRegistryData v1).
 * Consumed by RegistryScreen (C-2) and, post-create, by C-4 (`await refresh()`).
 *
 * Idiom: useContracts v1, extended from ONE collection to FOUR fetched IN
 * PARALLEL. Behavior mirrors it exactly:
 *   - QUIET failure: a rejected fetch leaves its collection at its prior value
 *     (`[]` until data first arrives) — no toast, no error state (useContracts
 *     pin 2). Consumers derive empty until data arrives.
 *   - `isActive` cleanup: post-unmount resolutions never write state — and a
 *     refresh() started before unmount respects the same guard (the guard is a
 *     ref, shared by the mount effect and refresh).
 *   - `isSettled`: promise-spec "settled" — flips true once ALL FOUR fetches
 *     have settled (success OR failure), so a failed fetch never leaves the C-2
 *     skeleton hanging. It is only ever set TRUE (never reset to false) — a
 *     refresh keeps the screen showing data while it refreshes (quiet).
 *
 * BARE-ARRAY response pin: the four `.list()` calls take no pagination params and
 * return bare arrays (verified in src/services/*). The unbounded-fetch assumption
 * is recorded in the contract — E-1 revisits the SLO/pagination.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Competition, Player, Sport, Team } from '../../data/types'
import { competitionsApi, playersApi, sportsApi, teamsApi } from '../../services'

export interface UseRegistryDataReturn {
  /** [] until settled; then the API list (quiet failure keeps the prior value) */
  sports: Sport[]
  competitions: Competition[]
  teams: Team[]
  players: Player[]
  /** true after ALL FOUR fetches settle — success OR failure; never reset to false */
  isSettled: boolean
  /** refresh all four; resolves when all four settle (C-4 awaits it post-create) */
  refresh: () => Promise<void>
}

export function useRegistryData(): UseRegistryDataReturn {
  const [sports, setSports] = useState<Sport[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [isSettled, setIsSettled] = useState(false)

  // Shared by the mount effect AND refresh() so a refresh in flight at unmount
  // also stops writing state (useContracts pin 3, widened to the refresh path).
  const isActiveRef = useRef(true)

  const load = useCallback(async () => {
    /** One quiet fetch: store on success; on failure keep the prior value (no reset). */
    const fetchInto = <T>(promise: Promise<T[]>, store: (list: T[]) => void): Promise<void> =>
      promise
        .then((list) => {
          if (isActiveRef.current) store(list)
        })
        .catch(() => {
          /* quiet per ops design — consumers derive empty until data arrives */
        })

    // Belt-and-suspenders (intentional — do NOT simplify): the per-fetch `.catch`
    // AND Promise.allSettled each independently guarantee the aggregate never
    // rejects, so `await load()` (refresh) always resolves even if a list throws.
    await Promise.allSettled([
      fetchInto(sportsApi.list(), setSports),
      fetchInto(competitionsApi.list(), setCompetitions),
      fetchInto(teamsApi.list(), setTeams),
      fetchInto(playersApi.list(), setPlayers),
    ])

    if (isActiveRef.current) setIsSettled(true)
  }, [])

  useEffect(() => {
    isActiveRef.current = true
    void load()
    return () => {
      isActiveRef.current = false
    }
  }, [load])

  return { sports, competitions, teams, players, isSettled, refresh: load }
}
