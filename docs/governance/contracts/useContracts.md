# CONTRACT SNAPSHOT: useContracts

Version: 1 · Date: 2026-07-04 · Task: B-3-T2 PREP (consumers: ScheduleScreen, RundownScreen, RightsScreen)

## Public interface

```ts
// src/components/ops/useContracts.ts — the shared quiet contracts fetch.
// Extracted at the THIRD consumer (B-1 pin 4 pre-authorized the trigger).
export interface UseContractsReturn {
  contracts: Contract[]   // [] until the first resolution; then the API list
}
export function useContracts(): UseContractsReturn
```

## Semantics (normative — behavior mirrors the A-3-T2/B-1-T2 screen blocks verbatim)

1. ONE `contractsApi.list()` fetch on mount; never refetches (no deps). The
   no-refetch-across-selection-changes ACs of Schedule/Rundown pin this.
2. QUIET failure: `.catch` swallows — consumers derive MISSING/empty until data
   arrives (pinned ops design). No toast, no error state.
3. `isActive` cleanup: post-unmount resolutions never write state.

## Test seam

Mock `'../../services'` `contractsApi.list` exactly as the screens' suites
already do — the hook reads the same module, so existing `vi.mock` setups and
call-count assertions work unchanged.

## Depends on

`src/services` (`contractsApi.list`) · React state/effect. Consumers own all
derivation (ops-selectors v3).

## Domain terms used

Contract, Rights Status (backlog §4 glossary).
