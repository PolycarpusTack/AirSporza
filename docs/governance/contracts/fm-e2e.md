# CONTRACT SNAPSHOT: fm-e2e

Version: 1 · Date: 2026-08-16 · Task: FM1-7-T0

**Changelog**
- **v1 (2026-08-16, FM1-7-T0):** FIRST FM e2e capability, layered on `ops-e2e v1.2`
  (`docs/governance/contracts/ops-e2e.md`) — no existing ops-e2e behavior touched. New THIRD
  Playwright project `flag-fm-on` (`.env.e2e-fm-on`, port 4183, `VITE_FM_SHELL=true` +
  `VITE_OPS_REDESIGN=true` — the FM interim bridge (ADR-014) navigates to real `/ops/*` routes,
  so ops must be ON too). New `e2e/planzaApi.ts` export `setUpFmE2E(page)` (ADDITIVE — calls
  `setUpPlanzaE2E` for auth/clock/base, then registers FM's own routes). New trivial boot-proof
  spec `e2e/smoke-fm-boot.flag-fm-on.spec.ts` (TDD gate ahead of FM1-7-T1's full AC suite,
  mirroring A-5-T0's own harness-proof precedent). No `flag-fm-off` project — see below.

## Public interface (npm scripts + layout)

| Script | Does |
|---|---|
| `npm run test:e2e:fm-on` | `flag-fm-on` project only (builds + serves + runs `*.flag-fm-on.spec.ts`) |
| `npm run e2e:serve:fm-on` | Build the `e2e-fm-on` Vite mode + `vite preview` on port 4183 (invoked by Playwright's webServer; manual use for debugging) |

Layout: unchanged from `ops-e2e v1` — specs in `e2e/` at repo root, `*.flag-fm-on.spec.ts`
runs under the new `flag-fm-on` project (mirrors the existing `*.flag-on.spec.ts` /
`*.flag-off.spec.ts` naming). Shared helper: **`e2e/planzaApi.ts`**, now exporting
`setUpFmE2E(page)` alongside `setUpPlanzaE2E`/`setUpRegistryE2E`/`setUpSyncE2E`. Config:
`playwright.config.ts` (root, ADDITIVE — the `flag-on`/`flag-off` projects and their
`use`/`webServer` entries are byte-unchanged). Browser: chromium only (unchanged).

## THIRD build profile (TD-27 — build-time flag, no runtime toggle)

`VITE_FM_SHELL` is a build-time Vite env exactly like `VITE_OPS_REDESIGN` (TD-27), so the
FM-ON flag combination gets its own build + preview server:

| Project | Mode file | Port | Flags |
|---|---|---|---|
| `flag-on` | `.env.e2e-on` | 4181 | `VITE_OPS_REDESIGN=true` (unchanged) |
| `flag-off` | `.env.e2e-off` | 4182 | `VITE_OPS_REDESIGN=false` (unchanged) |
| `flag-fm-on` | `.env.e2e-fm-on` | 4183 | `VITE_FM_SHELL=true` **and** `VITE_OPS_REDESIGN=true` |

**No `flag-fm-off` project (decision recorded at FM1-7-T0):** `.env.e2e-off` already pins
`VITE_FM_SHELL=false` (set at FM1-2) alongside `VITE_OPS_REDESIGN=false`, so the flag-OFF AC
("`VITE_FM_SHELL=false` build → `/fm` falls through, fm chunk never requested") is **already
covered by the existing `flag-off` project** — a separate FM-specific OFF profile would just
rebuild an already-OFF combination at zero additional signal, for a real webServer/build cost.
FM1-7-T1's flag-off spec (`*.flag-off.spec.ts`) runs under this same existing project.

Same Windows-safe env decision as `ops-e2e v1` (Vite mode files, no shell env assignments, no
`cross-env`). `.env.e2e-fm-on` is tracked in git (no secrets) and sets `VITE_API_URL=/api`
(same-origin, no CORS handling needed for route interception) — identical convention to
`.env.e2e-on`/`.env.e2e-off`.

## `setUpFmE2E(page)` — FM interception (ADDITIVE to `setUpPlanzaE2E`)

Calls `setUpPlanzaE2E` first (auth seed + pinned clock + the full base `/api/*` interception
unchanged), then registers FM's own routes, which — per Playwright's reverse-registration-order
rule — OVERRIDE the base `events`/`tech-plans` routes where noted:

| Route | Behavior |
|---|---|
| `GET **/api/events` (override) | Base fixture week (`API_EVENTS`) **plus** `FIXTURE_UNPLACED_EVENT` (wire-shaped via the same `toApiDate` the base harness uses) |
| `GET **/api/tech-plans` (override) | Base `FIXTURE_PLANS` **plus** `FIXTURE_UNPLACED_EVENT_PLAN` |
| `GET **/api/fm/action-items/resolutions` | `{ itemKeys: [...resolvedKeys] }` — an in-memory array, seeded empty, **fresh per test** (a fresh `page` gets a fresh JS closure — same reset-per-test posture as `setUpRegistryE2E`/`setUpSyncE2E`'s stores) |
| `POST **/api/fm/action-items/resolve` | Reads `{ itemKey }` from the request body, pushes it into the same in-memory array (deduped — a repeat POST is a no-op on the array), responds `{ resolvedAt: FIXTURE_NOW_DAYTIME.toISOString() }` — a fixed value pinned to the exact instant `setUpPlanzaE2E`'s `pinFixtureClock` freezes the browser clock to, without reaching back into the page's clock from a Node-side route handler |
| `GET **/api/ripple-proposals*` | `{ proposals: [FIXTURE_RIPPLE_PROPOSAL_PENDING], nextCursor: null, hasMore: false }` — query-aware glob (the real client always sends `?status=PENDING`) |
| `GET **/api/broadcast-slots*` | **NOT re-registered** — inherited unchanged from `setUpPlanzaE2E`'s base route (serves `E2E_SLOTS`, unaffected by this task). This smoke profile needs no FM-specific slot on top of the base fixture. |

**Composition decision (recorded):** the UNPLACED case is deliberately kept OUT of the shared
`opsFixtureWeek.ts` fixture module itself and composed here instead — the module's own
FM1-3-T1 doc comment documents this exact pattern (`[...FIXTURE_EVENTS,
FIXTURE_UNPLACED_EVENT]` / `[...FIXTURE_PLANS, FIXTURE_UNPLACED_EVENT_PLAN]`), because several
ops unit-suite pins depend on the base fixture week's exact per-day event counts (e.g.
`RundownScreen.test.tsx`'s "renders 7 pills … UNFILTERED fixture-week counts" and
`rundownLayout.test.ts`'s "Thursday: only the UNASSIGNED lane"); inserting the extra event into
the shared fixture directly would have silently broken those. `setUpFmE2E` composes it in at
the network-interception layer only, so every existing ops-e2e/vitest pin stays byte-stable.

**All 5 action-item kinds reachable in this profile (verified against `opsFixtureWeek.ts`'s own
inventory comments):**

| Kind | Source |
|---|---|
| CONFLICT | Base fixture week — e3/e4 FULL conflict (same person, same start), e5/e6 PARTIAL conflict (overlapping windows) |
| RIGHTS | Base fixture week — comps 102/103/104/108/110 span EXPIRING/NEGOTIATION/MISSING/lapsed/boundary |
| CREW | Base fixture week — e7 zero-plans (OPEN), e8 blank-required-encoder (OPEN) |
| UNPLACED | Added here — `FIXTURE_UNPLACED_EVENT` (Sat, no channel, no slot) |
| FEED | Added here — `FIXTURE_RIPPLE_PROPOSAL_PENDING`, targeting the SAME event as UNPLACED (id 11) on purpose: proves kind-independence (two distinct action items on one event, never merged), mirroring the fixture's own FM1-3-T1 header comment |

## Specs

- `e2e/smoke-fm-boot.flag-fm-on.spec.ts` (FM1-7-T0) — ONE trivial boot-proof test: authenticated
  `/fm` redirects to `/fm/home` and the FM chrome renders (`PLANZA/FM` brand text visible,
  `FmShell.tsx`'s sidebar brand block). Deliberately NOT the full FM1-7 AC list — the CONTINUE
  loop, resolve-persists-on-reload, `+ NEW`→UNPLACED, and interim-bridge navigation ACs are
  FM1-7-T1's own scope, built on top of this profile once it's proven to boot green (mirrors
  A-5-T0's own harness-proof-before-real-specs precedent).

## Isolation guarantees (unchanged from `ops-e2e v1`, reconfirmed for the new profile)

- vitest: `include: src/**` — `e2e/` never collected; suite stayed at **970/970** after this
  task (no regression).
- `tsc --noEmit`: clean after this task's additions.
- The two EXISTING projects (`flag-on`/`flag-off`) re-run clean of interference from this
  task's changes: `flag-off`'s 1 spec passes; `flag-on`'s suite has 2 PRE-EXISTING failures
  (`smoke-epic-b.flag-on.spec.ts`'s RIGHTS-tab URL assertion, `smoke-epic-c.flag-on.spec.ts`'s
  24-row registry-universe count) that were **verified to reproduce identically against the
  unmodified `planzaApi.ts`** (this task's changes reverted, re-run in isolation) before this
  task touched anything — pre-existing, out of this task's scope, flagged for the story owner
  rather than silently fixed.
- git: `dist-e2e/`, `test-results/`, `playwright-report/`, `blob-report/` already ignored
  (confirmed in `.gitignore`, no change needed); `.env.e2e-fm-on` tracked.

## Depends on

`ops-e2e v1.2` (this profile is layered on top, zero modifications to its behavior) ·
`opsFixtureWeek.ts`'s `FIXTURE_UNPLACED_EVENT` / `FIXTURE_UNPLACED_EVENT_PLAN` /
`FIXTURE_RIPPLE_PROPOSAL_PENDING` (FM1-3-T1 fixtures) · `FmShell v1` (mount point `/fm`, brand
chrome) · `fmActionItems v1` / `ActionItemResolution v1` (route shapes) · ripple v1
(`GET /api/ripple-proposals`, SV-2-T3).

## Domain terms used

Fm Shell, Action Item, Resolution, Ripple Proposal (backlog §4 glossary / FM1-3/FM1-4 hand-offs).
