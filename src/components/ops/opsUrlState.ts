/**
 * URL-backed ops navigation state (A-2-T2, ADR-014).
 * Contract: docs/governance/contracts/ops-selection.md (ops-selection v1).
 *
 * `?event=`, `?day=` and `?record=` on /ops/:tab are a PUBLIC URL contract
 * (ADR-014): names don't change without a migration shim. Components never touch
 * search params directly — they use these hooks, which validate values and fall
 * back silently. (`?record` arrived with the Registry story as the ADDITIVE
 * ops-selection v2 bump — reserved in v1, same module, same plumbing.)
 *
 * OpsShell v1 normative rule acknowledged: navigation inside /ops/* must use
 * absolute OPS_BASE paths. These hooks never navigate — setters only rewrite the
 * search params on the CURRENT location (path untouched, asserted by tests). If a
 * navigating variant is ever added here, absolute paths only.
 *
 * History semantics (judgment call, ADR-014 is silent): setters use
 * `{ replace: true }` so rapid selection clicks never spam history — one
 * back-press leaves the screen. Back/forward still restores selection across
 * PUSHED navigations (tab clicks, external links) because state is derived from
 * the location on every render.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

const EVENT_PARAM = 'event'
const DAY_PARAM = 'day'
const RECORD_PARAM = 'record'

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
 * Shared param plumbing: read (empty string = absent; failing `validate` = absent,
 * silently) and write (null clears; other params always preserved; replace, not push).
 */
function useOpsSearchParam(
  name: string,
  validate?: (value: string) => boolean,
): readonly [string | null, (next: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams()

  const raw = searchParams.get(name)
  const value = raw && (!validate || validate(raw)) ? raw : null

  const setValue = useCallback(
    (next: string | null) => {
      setSearchParams(
        (prev) => {
          const nextParams = new URLSearchParams(prev)
          if (next) {
            nextParams.set(name, next)
          } else {
            nextParams.delete(name)
          }
          return nextParams
        },
        { replace: true },
      )
    },
    [name, setSearchParams],
  )

  return [value, setValue] as const
}

/**
 * Shared Schedule/Rundown event selection (`?event=<id>`).
 * The id is an OPAQUE string here — resolving it against loaded events (and
 * silently showing no selection for unknown ids) is the consuming screen's job
 * (A-3 selectors); this hook only normalizes absent/empty to null.
 */
export function useOpsSelection(): {
  eventId: string | null
  setEventId: (id: string | null) => void
} {
  const [eventId, setEventId] = useOpsSearchParam(EVENT_PARAM)
  return { eventId, setEventId }
}

/**
 * Rundown day / Schedule week context (`?day=<ISO date>`).
 * Absent/invalid → null — deliberately NO "today" defaulting here (ADR-014 does
 * not specify one); screens decide what a null day means for them.
 */
export function useOpsDay(): {
  day: string | null
  setDay: (day: string | null) => void
} {
  const [day, setDay] = useOpsSearchParam(DAY_PARAM, isIsoDate)
  return { day, setDay }
}

/**
 * Registry record selection (`?record=<kind>:<dbId>`) — the ADDITIVE
 * ops-selection v2 bump (reserved in v1, delivered by the Registry story C).
 * The id is an OPAQUE string here (NO validate fn, exactly like `?event`):
 * resolving `<kind>:<dbId>` against the loaded record universe — and showing
 * quiet no-selection for unknown/malformed ids — is the RegistryScreen's job
 * (registry-selectors v1). This hook only normalizes absent/empty to null and
 * inherits every v1 semantic: unrelated params preserved, replace-not-push,
 * path untouched.
 */
export function useOpsRecord(): {
  recordId: string | null
  setRecordId: (id: string | null) => void
} {
  const [recordId, setRecordId] = useOpsSearchParam(RECORD_PARAM)
  return { recordId, setRecordId }
}
