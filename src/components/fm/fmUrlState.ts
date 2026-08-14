/**
 * URL-backed FM inbox selection (FM1-2-T2).
 * Contract: Contract Snapshot `fmUrlState v1` (this task's hand-off).
 *
 * `?inbox=<key>` on /fm/home is the ONLY param this module builds. Components
 * never touch search params directly — they use this hook, which validates
 * the value and falls back silently.
 *
 * Structurally copied from `src/components/ops/opsUrlState.ts` — sibling
 * pattern, NOT a shared import (Rule of Three: this is only the 2nd
 * occurrence of "shared-param-plumbing hook", same reasoning FM1-2-T1 already
 * applied to the shell itself). Same `{ replace: true }` history semantics,
 * same "silent fallback to null on absent/invalid value" convention.
 *
 * DELIBERATELY DEFERRED (not forgotten): `?sport`, `?comp`, `?team`,
 * `?person` are NOT built here. CONTINUE and the create-modal's navigation
 * targets in EPIC FM-1 navigate INTO the existing `/ops/*` screens using
 * THEIR EXISTING `useOpsSelection`/`useOpsDay` hooks and ADR-014 URL contract
 * at the destination — not a new FM param. The remaining FM params arrive
 * with the screens that actually consume them (EPIC FM-2/FM-3); building them
 * now would be speculative params with no reader (Core §5.3).
 *
 * FmShell v1 does not call this hook yet — wiring it into the shell for real
 * `?inbox` hydration is FM1-4's job (Story FM1-2's own Pull Gate note). This
 * module only builds and proves the hook works in isolation.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

const INBOX_PARAM = 'inbox'

/**
 * Shared param plumbing: read (empty string = absent; failing `validate` = absent,
 * silently) and write (null clears; other params always preserved; replace, not push).
 */
function useFmSearchParam(
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
 * Home inbox selection (`?inbox=<key>`).
 * The key is an OPAQUE string here — resolving it against the derived action
 * item list (and silently showing no selection for unknown keys) is the
 * consuming screen's job (FM1-3's deriveActionItems / FM1-4's FmHomeScreen);
 * this hook only normalizes absent/empty to null.
 */
export function useFmSelection(): {
  inboxKey: string | null
  setInboxKey: (key: string | null) => void
} {
  const [inboxKey, setInboxKey] = useFmSearchParam(INBOX_PARAM)
  return { inboxKey, setInboxKey }
}
