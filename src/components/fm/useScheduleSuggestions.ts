/**
 * useScheduleSuggestions — FM Schedule board's suggestions fetch (FM2-1-T2).
 * Consumes FM2-1-T1's `GET /api/schedule/suggestions?week=<ISO-week-start>`
 * (Contract Snapshot `scheduleSuggestions v1` — see backend/src/routes/
 * scheduleSuggestions.ts / backend/src/services/scheduleSuggestions.ts for
 * the exact response shape this module mirrors as TypeScript types).
 *
 * Idiom: `src/components/ops/useContracts.ts`'s shared quiet-fetch pattern,
 * copied STRUCTURALLY, not shared (Rule of Three not met — FM already
 * established this "sibling hook, not an import" posture for
 * fmUrlState.ts/fmScheduleUrlState.ts). Same contract:
 *  - QUIET failure: a rejected fetch leaves `unplaced` at its prior value
 *    (or [] if none yet) — no toast, no error state. A fetch failure and
 *    "genuinely zero unplaced events" are visually identical here by design;
 *    the AC's "no safe slot" chip is a DIFFERENT, orthogonal state (a
 *    successfully-fetched event with an empty `candidates` array), not this
 *    hook's concern.
 *  - `isActive`-guarded writes so a fetch settling after unmount (or after a
 *    newer `week`'s fetch already started) never writes stale state.
 *  - `isSettled` flips true after the FIRST resolution for the CURRENT
 *    `week` — success or failure.
 *  - `refresh()` re-fetches the current `week` on demand — this is what
 *    FmScheduleBoard's PLACE and AUTO-SUGGEST wiring call after mutating, to
 *    pull the tray back to the server's fresh unplaced set (no separate
 *    "commit suggestion" code path — ADR-023).
 *
 * Refetches automatically whenever `week` changes (a dependency useContracts
 * itself doesn't have — contracts aren't week-scoped, suggestions are).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../utils/api'

export interface ScheduleSuggestionCandidate {
  channelId: number
  channelName: string
  channelLoad: number
}

export interface ScheduleSuggestionUnplacedEvent {
  eventId: number
  candidates: ScheduleSuggestionCandidate[]
}

export interface ScheduleSuggestionsResponse {
  week: string
  unplaced: ScheduleSuggestionUnplacedEvent[]
}

export interface UseScheduleSuggestionsReturn {
  /** [] until the first resolution for the current `week` (or on quiet failure); then the API's `unplaced` array. */
  unplaced: ScheduleSuggestionUnplacedEvent[]
  /** true after the FIRST resolution for the current `week` — success OR failure. */
  isSettled: boolean
  /** Re-fetches suggestions for the current `week`. */
  refresh: () => Promise<void>
}

export function useScheduleSuggestions(week: string): UseScheduleSuggestionsReturn {
  const [unplaced, setUnplaced] = useState<ScheduleSuggestionUnplacedEvent[]>([])
  const [isSettled, setIsSettled] = useState(false)

  // Guards against a stale in-flight fetch (unmount, OR a newer `week`
  // already superseding this one) writing state after the fact.
  const isActiveRef = useRef(true)

  const load = useCallback(async () => {
    try {
      const result = await api.get<ScheduleSuggestionsResponse>(
        `/schedule/suggestions?week=${encodeURIComponent(week)}`,
      )
      if (isActiveRef.current) setUnplaced(result.unplaced)
    } catch {
      /* quiet — see module header */
    } finally {
      if (isActiveRef.current) setIsSettled(true)
    }
  }, [week])

  useEffect(() => {
    isActiveRef.current = true
    setIsSettled(false)
    void load()
    return () => {
      isActiveRef.current = false
    }
  }, [load])

  return { unplaced, isSettled, refresh: load }
}
