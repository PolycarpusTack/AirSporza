# CONTRACT SNAPSHOT: useSyncData

Version: 1 · Date: 2026-07-09 · Task: D-1-T2 (consumers: SyncScreen D-1, post-decision refetch D-3)

The Sync screen's quiet parallel fetch — the `useRegistryData v1` idiom NARROWED
from four collections to TWO fetched IN PARALLEL (import jobs + pending merge
candidates), plus a `refresh()` pre-planned for D-3's post-decision refetch. All
job/candidate derivation stays in `sync-selectors v1`; this hook only fetches.

## Public interface

```ts
// src/components/ops/useSyncData.ts
export interface UseSyncDataReturn {
  jobs: ImportJob[]                 // [] until settled; then the API list (quiet failure keeps prior value)
  candidates: ImportMergeCandidate[] // pending merge candidates (server-filtered status='pending')
  isSettled: boolean                // true after BOTH settle — success OR failure; only ever set true
  refresh: () => Promise<void>       // refetch both; resolves once both settle (D-3 awaits it post-decision)
}
export function useSyncData(): UseSyncDataReturn
```

## Semantics (normative — mirrors useRegistryData v1, narrowed to two collections)

1. **Parallel mount fetch.** One `useEffect` (stable `load`, deps `[load]`)
   dispatches `importsApi.listJobs()` and
   `importsApi.listMergeCandidates({ status: 'pending' })` — both in flight before
   any await (asserted: both called once, with the `{ status: 'pending' }` arg,
   before either resolves).
2. **Quiet failure.** A rejected fetch leaves its collection at its prior value
   (`[]` until data first arrives). No toast, no error state. A single rejection
   does not affect the other collection.
3. **`isSettled` = both-settled.** Flips true only after both fetches settle
   (success OR failure), so a failed fetch never leaves the Sync skeleton hanging.
   ONLY EVER set true (never reset) — a `refresh()` keeps the screen showing data
   while it refetches (quiet).
4. **`refresh()`** re-runs the same `load`: refetches both, updates state, resolves
   once both settle. Pre-planned for D-3 (`await refresh()` after an approve/keep so
   the merge queue + tab badge re-derive). Does not reset `isSettled`.
5. **`isActiveRef` cleanup.** A shared `useRef` guards the mount effect AND a
   `refresh()` in flight at unmount; post-unmount resolutions never write state.
   Same R18 limitation as useRegistryData (post-unmount setState is a silent no-op;
   the unmount test asserts clean settle / no unhandled rejection, not "guard hit").
6. **BARE-ARRAY / unbounded-fetch assumption (recorded).** `listJobs()` is bare
   (backend default limit — pin 3 "N most recent"); `listMergeCandidates` returns a
   bare array. Unbounded fetch — E-1 revisits SLO/pagination. Belt-and-suspenders
   (intentional): the per-fetch `.catch` AND `Promise.allSettled` each independently
   guarantee the aggregate never rejects — both kept on purpose, do not "simplify".

## Test seam

`@vitest-environment jsdom`; `renderHook`/`act`/`waitFor`/`cleanup`. Mock
`'../../services'` with `{ importsApi: { listJobs, listMergeCandidates } }`.
Hand-rolled `deferred()` promises drive the parallel / mid-flight-refresh /
post-unmount pins. 8 tests.

## Depends on

`src/services` (`importsApi.listJobs`, `importsApi.listMergeCandidates`,
`ImportJob`, `ImportMergeCandidate` — barrel-exported) · React state/effect/ref.
Projection stays in `sync-selectors v1` (SyncScreen wraps `jobs` via `deriveJobCard`
and `candidates` via `pendingCandidateCount`). Badge publish = `OpsShell v1.1`
`OpsTabBadgeContext`.

## Domain terms used

Sync Job, Merge Candidate, Pending Count — backlog §4 + §EPIC D glossary.
