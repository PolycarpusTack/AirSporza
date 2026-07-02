# CONTRACT SNAPSHOT: OpsShell

Version: 1 · Date: 2026-07-02 · Task: A-2-T1 (input contract for A-2-T2 deep-linking, all screen stories B/C/D)

## Public interface

```ts
// src/components/ops/OpsShell.tsx (lazy-loaded — see "Flag & mounting")
/** Contractual mount point (ADR-012): AppRoutes mounts <OpsShell> at `${OPS_BASE}/*`. */
export const OPS_BASE = '/ops'

/** Tab registry — `id` values are the /ops/:tab URL segments (ADR-014 PUBLIC CONTRACT). */
export const OPS_TABS: readonly { id: OpsTabId; label: string }[]
// ids, in order: 'schedule' | 'planner' | 'rights' | 'registry' | 'sync'
export type OpsTabId = 'schedule' | 'planner' | 'rights' | 'registry' | 'sync'

export interface OpsShellProps {
  /** Badge slot per tab (design: `SYNC [3]`). Wired to real pending-merge data in EPIC D. */
  tabBadges?: Partial<Record<OpsTabId, number>>
}
export function OpsShell(props: OpsShellProps): JSX.Element
```

```ts
// src/flags.ts (feature-flag convention — first occurrence, established by A-2-T1)
/** true only when VITE_OPS_REDESIGN === 'true'; absent/other env → OFF. */
export function isOpsRedesignEnabled(): boolean
```

## Routes

| Path | Renders | Notes |
|---|---|---|
| `/ops` (index) | `Navigate → /ops/schedule` (replace) | |
| `/ops/schedule` | `ScheduleScreen` (placeholder until B-1) | `src/pages/ops/` |
| `/ops/planner` | `RundownScreen` (placeholder until B-2) | URL id `planner` = ADR-014 contract; component named per glossary ("Rundown") |
| `/ops/rights` | `RightsScreen` (placeholder, EPIC C) | |
| `/ops/registry` | `RegistryScreen` (placeholder, EPIC C/D) | |
| `/ops/sync` | `SyncScreen` (placeholder, EPIC D) | |
| `/ops/<anything else>` | `Navigate → /ops/schedule` (replace) | Documented fallback for unknown tabs |

**Splat-relative gotcha (normative for all ops routing code):** inside the `/ops/*` splat
route, RELATIVE `to` values resolve INCLUDING the matched splat segment
(`/ops/schedule` + `planner` → `/ops/schedule/planner`); a relative target in the `*`
fallback even self-matches and loops forever. All shell navigation therefore uses
ABSOLUTE paths built from `OPS_BASE`. Deep-link hooks (A-2-T2) must do the same.

## Flag & mounting (ADR-012)

- `AppRoutes` (src/App.tsx) registers `/ops/*` ONLY when `isOpsRedesignEnabled()`; flag OFF
  → the path falls through to AppContent's catch-all → `/dashboard`, and the ops chunk is
  never requested. Env: `VITE_OPS_REDESIGN` (typed in `vite-env.d.ts`, documented in
  `.env.example`, default OFF).
- **Flag mechanism limitation (TD candidate):** build-time env only — no runtime override;
  production rollback = redeploy. Test seam = mock `src/flags.ts` (read happens at call time).
- The shell is `React.lazy` — REQUIRED, not an optimisation: the useOpsTheme v1 FOUC guard
  runs at ops-chunk evaluation time, and ADR-012 requires an unchanged flag-off bundle.
- Auth: authenticated-only (`user ? shell : Navigate /login`, matching AppRoutes' existing
  pattern). **RBAC parity (RequireRole roles like legacy peers) deferred to E-3** — the story
  AC is silent on roles; revisit before cutover.
- `OpsThemeProvider` is mounted once, at the top of OpsShell (the mount A-1-T2 designed for).
  Chrome toggle uses `useOpsTheme` (`☀ LIGHT` shown in dark mode, `☾ DARK` in light).

## Chrome (README §Layout constants; ops-tokens v2 vars only, no hex)

48px header on `--surface-shell`, 1px `--border-shell` bottom border; content on `--bg-shell`.
Brand `PLANZA/OPS` — mono 700 13px ls 2px, `/OPS` in `--accent-shell`. Tabs — mono 600 10.5px
ls 1px, 6×12px padding, radius `--r-sm`; active = `--accent-shell` bg + `--accent-shell-fg`
text; inactive transparent + `--text-shell-2`; badge renders as `LABEL [n]`. LIVE badge —
bordered, `.ops-live-dot` pulses via `src/components/ops/ops.css` `@keyframes ops-live-pulse`
(opacity 1→0.3, 1.4s ease infinite, dot color `--alert-danger`). Three-pane layout is a
per-screen concern, NOT provided by the shell.

## Resolved ambiguities (recorded per task card)

1. Unknown `:tab` → redirect to schedule (not a 404 panel) — cheapest consistent fallback.
2. Badge slot = `tabBadges` prop with EPIC D wiring; shell renders `[n]` only when provided.
3. Flag-off /ops for unauthenticated users → `/login` (auth outranks the flag).
4. jsdom cannot verify chunk-level isolation or the visual pulse — tests pin module-level
   isolation (lazy import factory never invoked) and the ops.css keyframe contract; the
   network-level chunk assertion and visual pulse are A-5 E2E scope.

## Depends on

- **ops-tokens v2** (vars consumed by chrome/placeholders) · **useOpsTheme v1** (provider +
  toggle; lazy-chunk requirement) · react-router-dom v7 (`NavLink`, descendant `Routes`).

## Domain terms used

Ops Shell, Screen, Rundown, Ops Theme (backlog §4 glossary).
