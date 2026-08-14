/**
 * useContinue — the CONTINUE loop hook (Story FM1-5, FM1-5-T1). Contract:
 * `useContinue v1` (this task's hand-off). Built on `fmActionItems v1`
 * output (ActionItem/FmActionItem, FM1-3-T1/FM1-4-T1) — composes
 * `useFmActionItems()` + `useFmToast()` (./FmToast) + `useNavigate()`
 * (react-router-dom), it does no derivation of its own.
 *
 * PULL GATE — judgment call, flagged for architect review (orchestrator
 * note, 2026-08-14): the literal `useContinue(): {advance(), unresolvedCount}`
 * signature takes no arguments, so it cannot receive an already-fetched
 * `items` list from a caller — it must call `useFmActionItems()` itself.
 * FmShell mounts ABOVE FmHomeScreen (which also calls `useFmActionItems()`
 * for Home's own render), and this hook is consumed from FmShell's
 * persistent top bar, so on the `home` route there ARE two independent
 * `useFmActionItems()` subscriptions firing their own network fetches in
 * parallel — no request de-duplication layer (React Query or similar)
 * exists in this codebase to collapse them.
 * A "lift to FmShell + thread down as props" alternative was considered and
 * rejected for THIS task: it would require changing FmHomeScreen's own
 * hook call to accept props instead, which is out of this task's touch-set
 * (FmHomeScreen.tsx is explicitly read-only reference per the task brief)
 * and would also fetch on every /fm/* route, not just when Home is mounted
 * — arguably worse, not better, since CONTINUE and the count chip live in
 * the shell's ALWAYS-mounted top bar regardless of which screen is active.
 * Accepted as a documented, scoped trade-off for FM-1 tracer-bullet scope:
 * both hooks are QUIET-failure, additive-only fetches (useFmActionItems's
 * own header) — the duplication costs extra requests, not correctness.
 * True de-duplication (a shared fetch cache/context) is deferred to a later
 * EPIC once a second real consumer of the shell-level count exists beyond
 * this one.
 *
 * PRIORITY ORDER (Story FM1-5 AC): CONFLICT > RIGHTS > UNPLACED > CREW >
 * FEED, BETWEEN kinds. Within a kind, the first unresolved item in
 * `items`' own derivation order is used — same "first open item of that
 * kind" convention FmHomeScreen.tsx already applies for its KPI tile CTAs
 * (its own header comment), just additionally filtered to `!resolved`
 * (CONTINUE must skip what's already been acknowledged; a KPI tile CTA
 * deliberately does not, per FmHomeScreen's own judgment-call note).
 *
 * unresolvedCount COUNTS ALL 5 KINDS, including FEED — this deliberately
 * does NOT match the nav badge's count (FmHomeScreen.tsx's `BADGE_KINDS`,
 * CONFLICT+RIGHTS+UNPLACED+CREW only). Story FM1-5's own AC just says
 * "the current unresolved count", with no kind exclusion carved out (unlike
 * FM1-2's badge AC, which explicitly scopes to those four) — read literally,
 * not assumed to silently mirror the badge.
 *
 * URL composition: `buildHref` below is a direct structural copy of
 * FmHomeScreen.tsx's own private helper of the same name (3 lines: `route`
 * + `URLSearchParams(params)`) — duplicated, not imported, per this
 * codebase's own Rule-of-Three convention (this is only the 2nd occurrence;
 * FmHomeScreen.tsx is out of this task's touch-set to extract a shared
 * module from).
 */
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFmActionItems } from './useFmActionItems'
import { useFmToast } from './FmToast'
import type { ActionItemKind } from './fmActionItems'

/** Story FM1-5 AC: CONTINUE's between-kind priority order. */
const PRIORITY_ORDER: ActionItemKind[] = ['CONFLICT', 'RIGHTS', 'UNPLACED', 'CREW', 'FEED']

/** Structural copy of FmHomeScreen.tsx's private `buildHref` — see module header. */
function buildHref(route: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString()
  return qs ? `${route}?${qs}` : route
}

export interface UseContinueReturn {
  /** Navigates to the first unresolved item in priority order, toasts
   * "`KIND`: `title`". Empty queue → "ALL CLEAR" toast, no navigation. */
  advance: () => void
  /** Live unresolved-item count across all 5 kinds (see module header). */
  unresolvedCount: number
}

export function useContinue(): UseContinueReturn {
  const { items } = useFmActionItems()
  const navigate = useNavigate()
  const { show } = useFmToast()

  const unresolvedItems = useMemo(() => items.filter((item) => !item.resolved), [items])

  const advance = useCallback(() => {
    for (const kind of PRIORITY_ORDER) {
      const next = unresolvedItems.find((item) => item.kind === kind)
      if (next) {
        navigate(buildHref(next.targetRoute, next.targetParams))
        show(`${next.kind}: ${next.title}`)
        return
      }
    }
    show('ALL CLEAR')
  }, [unresolvedItems, navigate, show])

  return { advance, unresolvedCount: unresolvedItems.length }
}
