/**
 * useFmActionItems — FM Home's data hook (Story FM1-4, FM1-4-T1). Fetches the
 * three collections `deriveActionItems` (fmActionItems v1, FM1-3-T1) doesn't
 * already get from AppProvider (weekly broadcast slots, PENDING ripple
 * proposals, the current user's resolutions), derives the item list, merges
 * resolution state, and exposes an optimistic `resolve()`.
 *
 * Idiom: useSyncData v1 (src/components/ops/useSyncData.ts), copied
 * structurally — NOT shared (same Rule-of-Three posture FmShell/fmUrlState
 * already established for FM: this is only the 2nd "quiet parallel fetch +
 * isSettled" hook FM owns). Same contract:
 *   - QUIET failure per collection: a rejected fetch leaves that collection at
 *     its prior value — no toast, no error state (FM1-3's own AC: "partial
 *     data beats no data" — a failed ripple-proposals fetch must not block
 *     CONFLICT/RIGHTS/UNPLACED/CREW derivation, it just omits FEED for that
 *     render).
 *   - `isActive` cleanup: post-unmount resolutions never write state; a
 *     refresh() in flight at unmount respects the same guard (shared ref).
 *   - `isSettled`: flips true once ALL THREE fetches have settled (success OR
 *     failure) — never reset to false by a refresh.
 *
 * PULL GATE — Contract Snapshot drift found and resolved (flag for review):
 * `useApp()` (AppProvider.tsx) provides `events`/`techPlans`/`crewFields` but
 * NOT `contracts` — contracts live outside AppProvider behind the shared
 * `useContracts()` hook (src/components/ops/useContracts.ts, the SAME one
 * ScheduleScreen/RundownScreen/RightsScreen already consume). Resolved by
 * calling `useContracts()` here rather than inventing a 2nd contracts fetch.
 *
 * WEEK SCOPING: fmActionItems.ts's own header says it "does no fetching and
 * no week-filtering of its own... assumed already scoped to the visible week
 * by the caller" — this hook is that caller. `events` is filtered to the
 * Mon..Sun week containing "now" before being passed to `deriveActionItems`
 * (and to `detectCrewConflicts`, so CONFLICT detection is also week-scoped —
 * matches Home's own "triage this week" purpose, README §1).
 *
 * BROADCAST-SLOTS WEEKLY FETCH — documented judgment call (orchestrator note,
 * 2026-08-14): `schedulesApi.listSlots({date})` (src/services/schedules.ts) is
 * the ONLY existing broadcast-slot client and it is PER-SINGLE-DAY only.
 * Calling it bare (no date) would hit `GET /broadcast-slots` with no
 * dateStart/dateEnd — backend/src/routes/broadcastSlots.ts applies NO default
 * window in that case (confirmed by reading the route: the date filter is
 * skipped entirely when both params are absent), which is an unbounded query,
 * a real SLO risk at scale. Chose the SAFER option: fan out 7 parallel
 * per-day `listSlots({date})` calls (Mon..Sun) via `Promise.allSettled`, each
 * day independently quiet-failed and merged — a straightforward extension of
 * the existing client, properly week-scoped, and no single bad day blackens
 * the whole week's UNPLACED derivation.
 *
 * GET /api/fm/action-items/resolutions — the story's literal Interfaces list
 * only names the POST /resolve route, but its own AC requires "on reload it
 * is STILL shown, dimmed/✓", which is unsatisfiable without reading back
 * which items the current user already resolved. backend/src/routes/
 * fmActionItems.ts adds this minimal GET (current user + tenant, itemKeys
 * only) — flagged there and here for architect review, not silently assumed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppProvider'
import { useContracts } from '../ops/useContracts'
import { detectCrewConflicts } from '../../utils/crewConflicts'
import { addDays, dateStr, getDateKey, weekMonday } from '../../utils/dateTime'
import { fmActionItemsApi, rippleProposalsApi, schedulesApi } from '../../services'
import { useToast } from '../Toast'
import { deriveActionItems, type ActionItem, type RippleProposal } from './fmActionItems'
import type { BroadcastSlot, Event } from '../../data/types'

export interface FmActionItem extends ActionItem {
  /** Acknowledgment overlay (ActionItemResolution v1) — NOT a filter. An
   * item's presence in `items` is governed entirely by fmActionItems v1's
   * derivation; this flag only says "the current user has clicked MARK
   * RESOLVED on this item's key at least once". */
  resolved: boolean
}

export interface UseFmActionItemsReturn {
  /** [] until settled; then the derived + resolution-merged list. */
  items: FmActionItem[]
  /** `events` (AppProvider) filtered to the Mon..Sun week containing "now" —
   * exposed so FmHomeScreen can render the EVENTS THIS WEEK KPI tile (total +
   * "n live productions") without a 2nd week-filter pass of its own; this is
   * NOT an action-item kind, so it isn't part of `items`. */
  weekEvents: Event[]
  /** true after all three fetches settle — success OR failure; never reset to false. */
  isSettled: boolean
  /** Optimistically marks `itemKey` resolved, POSTs, and reverts + toasts on failure. */
  resolve: (itemKey: string) => Promise<void>
  /** Refetch all three collections; resolves once all three settle. */
  refresh: () => Promise<void>
}

/** The 7 "YYYY-MM-DD" dates (Mon..Sun) of the week containing `d`. */
function weekDateStrings(d: Date): string[] {
  const monday = weekMonday(d)
  return Array.from({ length: 7 }, (_, i) => dateStr(addDays(monday, i)))
}

export function useFmActionItems(): UseFmActionItemsReturn {
  const { events, techPlans, crewFields } = useApp()
  const { contracts } = useContracts()
  const toast = useToast()

  const [broadcastSlots, setBroadcastSlots] = useState<BroadcastSlot[]>([])
  const [rippleProposals, setRippleProposals] = useState<RippleProposal[]>([])
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set())
  const [isSettled, setIsSettled] = useState(false)

  // Shared by the mount effect AND refresh() (useSyncData pin: a refresh in
  // flight at unmount also stops writing state).
  const isActiveRef = useRef(true)

  // Read synchronously inside resolve() so a revert-on-failure never
  // un-resolves an item that was ALREADY confirmed resolved before this call
  // (state itself would be one render behind inside a useCallback closure).
  const resolvedKeysRef = useRef(resolvedKeys)
  useEffect(() => {
    resolvedKeysRef.current = resolvedKeys
  }, [resolvedKeys])

  const load = useCallback(async () => {
    const dates = weekDateStrings(new Date())

    /** One quiet fetch: store on success; on failure keep the prior value (useSyncData idiom). */
    const fetchInto = <T>(promise: Promise<T>, store: (value: T) => void): Promise<void> =>
      promise
        .then((value) => {
          if (isActiveRef.current) store(value)
        })
        .catch(() => {
          /* quiet per FM1-3's own AC — consumers derive partial/empty until data arrives */
        })

    // See module header: 7-day fan-out, each day independently quiet-failed.
    const slotsForWeek = async (): Promise<BroadcastSlot[]> => {
      const settled = await Promise.allSettled(dates.map((date) => schedulesApi.listSlots({ date })))
      return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    }

    await Promise.allSettled([
      fetchInto(slotsForWeek(), setBroadcastSlots),
      fetchInto(rippleProposalsApi.listPending().then((r) => r.proposals), setRippleProposals),
      fetchInto(
        fmActionItemsApi.listResolutions().then((r) => r.itemKeys),
        (keys) => setResolvedKeys((prev) => new Set([...prev, ...keys])),
      ),
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

  const weekEvents = useMemo(() => {
    const dates = new Set(weekDateStrings(new Date()))
    return events.filter((e) => dates.has(getDateKey(e.startDateBE)))
  }, [events])

  const conflicts = useMemo(() => detectCrewConflicts(techPlans, weekEvents), [techPlans, weekEvents])

  const derivedItems = useMemo(
    () =>
      deriveActionItems(
        weekEvents,
        contracts,
        techPlans,
        conflicts,
        rippleProposals,
        new Date(),
        crewFields,
        broadcastSlots,
      ),
    // `now` is deliberately NOT a dep — every other dep already changes on its
    // own fetch/render cadence; re-deriving off a fresh `new Date()` each time
    // one of THOSE changes is the intended behavior, not a missing dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekEvents, contracts, techPlans, conflicts, rippleProposals, crewFields, broadcastSlots],
  )

  const items = useMemo<FmActionItem[]>(
    () => derivedItems.map((item) => ({ ...item, resolved: resolvedKeys.has(item.key) })),
    [derivedItems, resolvedKeys],
  )

  const resolve = useCallback(
    async (itemKey: string) => {
      const alreadyResolved = resolvedKeysRef.current.has(itemKey)
      if (!alreadyResolved) {
        setResolvedKeys((prev) => new Set(prev).add(itemKey))
      }
      try {
        await fmActionItemsApi.resolve(itemKey)
      } catch {
        if (!alreadyResolved) {
          setResolvedKeys((prev) => {
            const next = new Set(prev)
            next.delete(itemKey)
            return next
          })
        }
        toast.error('Could not mark resolved — please try again')
      }
    },
    [toast],
  )

  return { items, weekEvents, isSettled, resolve, refresh: load }
}
