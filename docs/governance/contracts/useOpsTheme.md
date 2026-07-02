# CONTRACT SNAPSHOT: useOpsTheme

Version: 1 · Date: 2026-07-02 · Task: A-1-T2 (input contract for A-2-T1 OpsShell)

## Public interface

```ts
// src/components/ops/OpsThemeProvider.tsx
export type OpsTheme = 'dark' | 'light'

/** Context provider. Mount ONCE, inside the flag-gated ops shell only (A-2).
 *  Never wired into App.tsx or legacy screens. */
export function OpsThemeProvider({ children }: { children: ReactNode }): JSX.Element

/** Throws `Error(/OpsThemeProvider/)` if used outside the provider. */
export function useOpsTheme(): { theme: OpsTheme; toggle(): void }
```

## Semantics (normative, enforced by `src/components/ops/OpsThemeProvider.test.tsx`)

1. No stored preference → `theme === 'dark'`, `<html>` has NO `data-theme` attribute, and
   nothing is written to storage (the user's non-choice is not persisted).
2. `toggle()` → light: sets `data-theme="light"` on `<html>` (via `useLayoutEffect`, before
   paint) and persists `'light'` to localStorage key **`planza.opsTheme`**. Toggling again
   removes the attribute and persists `'dark'`.
3. Stored `'light'` on mount → theme is light; any other stored value (incl. garbage) → dark.
4. localStorage unavailable (get/set throws) → no crash, no surfaced error; toggling still
   works session-only (ADR-013 degradation).
5. The swap is CSS-variable-only: one attribute flip on `<html>`; no per-component theme
   state, no re-render outside the provider's subtree. Palette <100ms by construction
   (cascade recalculation of the nine `-shell` vars — see ops-tokens v1 guarantee 3 for why
   legacy screens are inert).

## FOUC guard (design choice)

**Pre-hydration attribute set at module scope** (ADR-013's second option), NOT an
`index.html` inline script:

- The guard runs when `OpsThemeProvider.tsx` is evaluated. The ops shell is a lazy `/ops/*`
  route (ADR-012), so the ops chunk — and this guard — evaluates strictly before React
  renders any ops content: stored `'light'` is on `<html>` before the first ops paint.
- It only ADDS `data-theme="light"` when stored; absent/dark preference leaves `<html>`
  untouched (guarantee 1).
- Rationale vs inline script: zero changes to `index.html`/legacy files, guard ships inside
  the flag-gated bundle (flag OFF → code never loads), and legacy screens are shell-var-inert
  anyway so even an early global attribute would be harmless. Revisit only if ops content
  ever renders in the initial (non-lazy) chunk — then an inline head script becomes necessary.

## Depends on

- **ops-tokens v1** (`docs/governance/contracts/ops-tokens.md`): attribute name/value and the
  nine `-shell` vars it flips.
- localStorage key `planza.opsTheme` (ADR-013). Server-side persistence explicitly deferred.

## Domain terms used

Ops Shell, Ops Theme (backlog §4 glossary).
