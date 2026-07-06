# CONTRACT SNAPSHOT: useRegistryData

Version: 1 · Date: 2026-07-06 · Task: C-1-T2 (consumers: RegistryScreen C-2, create-refresh C-4)

The Registry screen's quiet parallel fetch — the `useContracts v1` idiom extended
from ONE collection to FOUR fetched IN PARALLEL, plus a `refresh()` for C-4's
post-create refetch. All record projection/derivation stays in `registry-selectors
v1`; this hook only fetches.

## Public interface

```ts
// src/components/ops/useRegistryData.ts
export interface UseRegistryDataReturn {
  sports: Sport[]              // [] until settled; then the API list (quiet failure keeps prior value)
  competitions: Competition[]
  teams: Team[]
  players: Player[]
  isSettled: boolean           // true after ALL FOUR settle — success OR failure; only ever set true
  refresh: () => Promise<void>  // refetch all four; resolves once all four settle (C-4 awaits it post-create)
}
export function useRegistryData(): UseRegistryDataReturn
```

## Semantics (normative — mirrors useContracts v1, extended to four collections)

1. **Parallel mount fetch.** One `useEffect` (stable `load`, deps `[load]`)
   dispatches `sportsApi.list()`, `competitionsApi.list()`, `teamsApi.list()`,
   `playersApi.list()` — all four in flight before any await (asserted: all four
   `.list()` called once before any resolves).
2. **Quiet failure (useContracts pin 2).** A rejected fetch leaves its collection
   at its prior value (`[]` until data first arrives). No toast, no error state —
   consumers derive empty until data arrives. A single rejection does not affect
   the other three.
3. **`isSettled` = all-four-settled.** Flips true only after every fetch has
   settled (success OR failure), so a failed fetch never leaves the C-2 skeleton
   hanging. It is ONLY EVER set true (never reset to false) — a `refresh()` keeps
   the screen showing current data while it refetches (quiet).
4. **`refresh()`** re-runs the same `load`: refetches all four, updates state,
   returns a `Promise<void>` that resolves once all four settle. Pre-planned for
   C-4 (`await refresh()` then `setRecordId('<kind>:<newId>')`). Does not reset
   `isSettled`.
5. **`isActiveRef` cleanup (useContracts pin 3, widened).** A `useRef` (not the
   `let isActive` of useContracts — it must be SHARED by the mount effect AND a
   `refresh()` in flight at unmount, so `.current` is read in both). Every setter
   checks it; post-unmount resolutions never write state.
   - **R18 limitation (recorded):** under React 18.3.1 a post-unmount `setState`
     is a SILENT no-op (the old warning was removed), so this guard has no
     OBSERVABLE test signal — it is a forward-compat + refresh-vs-unmount-race
     guard mirroring the pinned idiom. The unmount test asserts the achievable
     guarantee (post-unmount resolutions settle cleanly, no unhandled rejection),
     not "guard was hit".
6. **BARE-ARRAY / unbounded-fetch assumption (recorded).** The four `.list()`
   calls take no pagination params and return bare arrays (verified in
   `src/services/*`). Unbounded fetch — E-1 revisits the SLO/pagination.
   - Belt-and-suspenders (intentional): the per-fetch `.catch` AND
     `Promise.allSettled` each independently guarantee the aggregate never
     rejects. Both are kept on purpose (documented in-code) — do not "simplify"
     one away.

## Test seam

`@vitest-environment jsdom`; `renderHook`/`act`/`waitFor`/`cleanup`. Mock
`'../../services'` with `{ sportsApi, competitionsApi, teamsApi, playersApi }`
each exposing `.list`. Hand-rolled `deferred()` promises drive the parallel /
mid-flight-refresh / post-unmount pins. 7 tests.

## Depends on

`src/services` (`sportsApi.list`, `competitionsApi.list`, `teamsApi.list`,
`playersApi.list` — barrel-exported) · React state/effect/ref. Projection stays
in `registry-selectors v1` (C-2 wraps these four arrays in `buildRegistryIndex`).

## Domain terms used

Registry, Record collections (Sports/Competitions/Teams/Players) — backlog §4 +
§EPIC C glossary.
