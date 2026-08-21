/**
 * URL-backed FM Schedule board week context (FM2-1-T2, Story FM2-1 point 7
 * of the task brief).
 *
 * `?day=<ISO date>` on /fm/schedule — an arbitrary date INSIDE the visible
 * week; the screen derives `weekMonday(day)` from it (same semantic as
 * `src/components/ops/opsUrlState.ts`'s `useOpsDay()`, which this module
 * mirrors in name and shape).
 *
 * DECISION (documented per the task brief's point 7): this is a STRUCTURAL
 * COPY of `useOpsDay`, NOT a direct import of it. Reasons:
 *  - `fmUrlState.ts` (FM1-2-T2) already set the FM-side precedent of
 *    "sibling pattern, not shared import" for exactly this kind of
 *    shared-param-plumbing hook, citing Rule of Three (only the 2nd
 *    occurrence at the time). This is the 3rd occurrence of the PATTERN
 *    (read/write a validated URL param with silent-fallback + replace-not-
 *    push semantics) but ops and fm are independent screens with
 *    independent URL-contract lifecycles — ADR-014 (`?event=`/`?day=` on
 *    `/ops/*`) is an ops-owned contract; the Schedule board needs its own,
 *    even though the PARAM NAME happens to match for future-Rundown-parity
 *    reasons. Importing `useOpsDay` directly would silently couple `/fm/*`
 *    to an ops-owned contract that Story FM2-1 never asked for.
 *  - `fmUrlState.ts`'s `useFmSelection` (`?inbox=`) is Home-specific and its
 *    own header explicitly defers building any other FM param until "the
 *    screens that actually consume them" — this is that screen, for `week`.
 *
 * Deliberately NOT built here: `?event=` selection for the Schedule board's
 * row/inspector selection. FM2-1-T2 uses local component state for that
 * instead (see FmScheduleBoard.tsx's own header) — a bounded scope call,
 * not an oversight; URL-persisted event selection on this screen is deferred
 * to whichever task actually needs deep-linking into a specific event here.
 *
 * Same "{ replace: true }, other params preserved, silent fallback to null
 * on absent/invalid value" semantics as opsUrlState.ts/fmUrlState.ts.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

const DAY_PARAM = 'day'

/** Format (shape) only — accepts impossible dates like 2026-02-31; `isIsoDate` is the real check. */
const ISO_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/

/**
 * ISO calendar date, format- AND calendar-valid. Round-trips through Date.UTC
 * because engines roll impossible dates over (2026-02-31 → Mar 3) instead of
 * rejecting them.
 */
function isIsoDate(value: string): boolean {
  if (!ISO_DATE_FORMAT.test(value)) return false
  const [year, month, dayOfMonth] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === dayOfMonth
  )
}

/**
 * Schedule board week context (`?day=<ISO date>`). Absent/invalid → null —
 * deliberately no "today" defaulting here (mirrors opsUrlState.ts's own
 * `useOpsDay` rule): the consuming screen decides what a null day means
 * (FmScheduleBoard.tsx falls back to the week containing its `now` prop).
 */
export function useFmScheduleDay(): {
  day: string | null
  setDay: (day: string | null) => void
} {
  const [searchParams, setSearchParams] = useSearchParams()

  const raw = searchParams.get(DAY_PARAM)
  const day = raw && isIsoDate(raw) ? raw : null

  const setDay = useCallback(
    (next: string | null) => {
      setSearchParams(
        (prev) => {
          const nextParams = new URLSearchParams(prev)
          if (next) {
            nextParams.set(DAY_PARAM, next)
          } else {
            nextParams.delete(DAY_PARAM)
          }
          return nextParams
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return { day, setDay }
}
