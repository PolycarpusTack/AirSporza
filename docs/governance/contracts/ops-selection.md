# CONTRACT SNAPSHOT: ops-selection

Version: 1 · Date: 2026-07-02 · Task: A-2-T2 (input contract for A-3-T2, A-4-T1, B-2-T1)

## Public interface

```ts
// src/components/ops/opsUrlState.ts
/** Shared Schedule/Rundown event selection — URL param `?event=<id>` (ADR-014). */
export function useOpsSelection(): {
  eventId: string | null                 // null when absent/empty
  setEventId(id: string | null): void    // null clears the param
}

/** Rundown day / Schedule week context — URL param `?day=<ISO date>` (ADR-014). */
export function useOpsDay(): {
  day: string | null                     // 'YYYY-MM-DD' or null (absent/invalid)
  setDay(day: string | null): void       // null clears the param
}
```

Requires a react-router context (any Router; used on /ops/:tab routes). Placement:
`src/components/ops/` per ADR-012 — deliberately NOT in the `src/hooks/` barrel, which is
imported by legacy code and would pull ops modules toward the main (flag-off) bundle.

## URL param contract (ADR-014 — PUBLIC, no rename without a migration shim)

| Param | Format | Owner hook | Shared by |
|---|---|---|---|
| `event` | opaque non-empty string | `useOpsSelection` | Schedule + Rundown inspector selection |
| `day` | `YYYY-MM-DD`, calendar-valid | `useOpsDay` | Rundown day pills + Schedule week context |
| `record` | (registry inspector) | **NOT implemented yet** — arrives with the Registry story (C), same module | Registry |

## Semantics (normative, enforced by `src/components/ops/opsUrlState.test.tsx`)

1. **Hydration is location-derived:** state re-reads the URL on every location change —
   reload, shared links, and back/forward across PUSHED navigations restore selection.
2. **Absent or empty-string param → null.** No error, no crash (ADR-014 silent fallback).
3. **`day` validation:** regex `YYYY-MM-DD` + calendar round-trip (rejects `2026-02-31`,
   which JS engines otherwise roll over to March 3). Invalid → null, silently.
4. **NO "today" defaulting** for absent `day` (ADR-014 specifies none): the hook returns
   null and each screen decides its own default. Do not add today-resolution to the hook.
5. **`event` ids are opaque** at hook level: resolving an id against loaded data — and
   silently rendering no selection for unknown ids — is the consuming screen's job
   (A-3 selectors). The hook only normalizes absent/empty.
6. **Setters preserve unrelated params** (functional `setSearchParams` update): setting or
   clearing `event` never touches `day`, and vice versa. Setters never change the path.
7. **History: setters REPLACE, never push** (judgment call — ADR-014 is silent):
   rapid row/block clicks leave zero history entries; ONE back-press exits the screen.
   Back/forward still walks selection states that were created by pushed navigations
   (tab clicks, external links) per rule 1. Revisit only with a UX decision at EPIC E.
8. **OpsShell v1 absolute-path rule:** acknowledged in the module header — these hooks
   never navigate; any future navigating variant must build absolute `OPS_BASE` paths.

## Depends on

- react-router-dom v7 `useSearchParams` (any router context).
- OpsShell v1 (routes these params decorate; `OPS_BASE` rule).

## Domain terms used

Screen, Rundown, Inspector (backlog §4 glossary).
