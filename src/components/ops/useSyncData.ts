/**
 * useSyncData — the Sync screen's quiet parallel fetch (D-1-T2).
 * Consumed by SyncScreen (D-1) and, post-decision, by D-3 (`await refresh()`
 * after an approve/ignore so the merge queue + tab badge re-derive).
 *
 * Idiom: useRegistryData v1, narrowed from FOUR collections to TWO fetched IN
 * PARALLEL (import jobs + pending merge candidates). Behavior mirrors it exactly:
 *   - QUIET failure: a rejected fetch leaves its collection at its prior value
 *     (`[]` until data first arrives) — no toast, no error state. Consumers derive
 *     empty until data arrives.
 *   - `isActive` cleanup: post-unmount resolutions never write state — and a
 *     refresh() started before unmount respects the same guard (the guard is a
 *     ref, shared by the mount effect and refresh).
 *   - `isSettled`: promise-spec "settled" — flips true once BOTH fetches have
 *     settled (success OR failure), so a failed fetch never leaves the Sync
 *     skeleton hanging. It is only ever set TRUE (never reset to false) — a
 *     refresh keeps the screen showing data while it refreshes (quiet).
 *
 * BARE-ARRAY response pin: `listJobs()` is called bare (no params → the backend
 * default limit) and `listMergeCandidates({ status: 'pending' })` returns a bare
 * array. The unbounded-fetch assumption is recorded for E-1 (SLO/pagination
 * revisit) — same as useRegistryData.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { importsApi, type ImportJob, type ImportMergeCandidate } from '../../services'

export interface UseSyncDataReturn {
  /** [] until settled; then the API list (quiet failure keeps the prior value) */
  jobs: ImportJob[]
  candidates: ImportMergeCandidate[]
  /** true after BOTH fetches settle — success OR failure; never reset to false */
  isSettled: boolean
  /** refresh both; resolves when both settle (D-3 awaits it post-decision) */
  refresh: () => Promise<void>
}

export function useSyncData(): UseSyncDataReturn {
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [candidates, setCandidates] = useState<ImportMergeCandidate[]>([])
  const [isSettled, setIsSettled] = useState(false)

  // Shared by the mount effect AND refresh() so a refresh in flight at unmount
  // also stops writing state (useRegistryData pin, widened to the refresh path).
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
      fetchInto(importsApi.listJobs(), setJobs),
      fetchInto(importsApi.listMergeCandidates({ status: 'pending' }), setCandidates),
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

  return { jobs, candidates, isSettled, refresh: load }
}
