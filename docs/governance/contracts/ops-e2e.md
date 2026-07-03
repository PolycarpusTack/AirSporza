# CONTRACT SNAPSHOT: ops-e2e

Version: 1 · Date: 2026-07-03 · Task: A-5-T0 (input contract for A-5-T1 smoke spec, B-4/EPIC-B smoke stories)

**Changelog**
- **v1 amendment (2026-07-03, A-5-T1):** the trivial harness specs were ABSORBED
  into the real smoke specs `e2e/smoke.flag-on.spec.ts` (ACs 1–4) /
  `e2e/smoke.flag-off.spec.ts` (AC-5); this snapshot's former "## Harness proof"
  section was REWRITTEN as "## Specs" accordingly (declared here for honest
  diff accounting). AC-5 adds the network-level ops-chunk assertion
  (`OpsShell-<hash>.js` never requested flag-off; chunk-name rot guarded by the
  flag-on POSITIVE assertion with the same regex). Runbook
  `docs/runbooks/ops-shell.md` §verification mirrors the specs.
- **v1 amendment (2026-07-03, A-5-T1 review):** ADDITIVE `planzaApi.ts` exports
  `OPS_CHUNK` and `LEGACY_DASHBOARD_CHUNK` — the single source both specs must
  import (the rot-guard pairing breaks if the regexes are edited apart);
  `toApiDate` now THROWS on non-local-midnight Dates instead of silently
  truncating (fixture footgun guard). npm scripts and projects unchanged.

## Public interface (npm scripts + layout)

| Script | Does |
|---|---|
| `npm run test:e2e` | Both profiles (builds + serves + runs all `e2e/*.spec.ts`) |
| `npm run test:e2e:on` / `:off` | Single profile (`--project=flag-on` / `flag-off`) |
| `npm run e2e:serve:on` / `:off` | Build profile + `vite preview` (invoked by Playwright's webServer; manual use for debugging) |

Layout: specs in **`e2e/`** at repo root — `*.flag-on.spec.ts` runs under the
flag-on project, `*.flag-off.spec.ts` under flag-off (mirrors the vitest
routing-test naming `App.ops-routing.flag-{off,on}.test.tsx`). Shared helper:
**`e2e/planzaApi.ts`** (`setUpPlanzaE2E(page)` = auth seed + pinned clock +
full API interception; individual helpers exported too). Config:
`playwright.config.ts` (root). Browser: **chromium only** (lean on purpose).

## Two build profiles (TD-27 — build-time flag, no runtime toggle)

`VITE_OPS_REDESIGN` is a build-time Vite env, so each flag state is a separate
build + preview server:

| Project | Mode file | Port | Flag |
|---|---|---|---|
| `flag-on` | `.env.e2e-on` | 4181 | `VITE_OPS_REDESIGN=true` |
| `flag-off` | `.env.e2e-off` | 4182 | `VITE_OPS_REDESIGN=false` (explicit — a developer's local `.env` loads in every Vite mode and must never leak the flag ON) |

**Windows-safe env decision (recorded):** Vite **mode files** (`vite build
--mode e2e-…`), NOT shell env assignments and NOT a `cross-env` dependency —
npm scripts stay portable across cmd/PowerShell/bash. Both `.env.e2e-*` files
are **tracked in git** (no secrets; they are build profiles). Both profiles set
`VITE_API_URL=/api` → API calls are **same-origin**, so route interception
needs no CORS/preflight handling. `vite preview` provides the SPA history
fallback (deep links like `/ops/schedule?day=…` resolve).

## Auth decision (recorded)

The app stores a Bearer token in `localStorage('token')`; `AuthProvider`
resolves the user via `GET /auth/me` (src/hooks/useAuth.tsx). E2e therefore:
`addInitScript` seeds a dummy token, interception answers `/auth/me` with the
`E2E_USER` (role `planner`). **No login flow, no storage-state file** — nothing
else lives in the session, so storage state would only add indirection.
Constraint (pinned in the helper): interception must **never answer 401** —
the ApiClient clears the token and hard-redirects to `/login` on any 401.

## Data strategy: FULL network interception (recorded trade-off)

`e2e/planzaApi.ts` serves every `/api/*` endpoint the authenticated app calls
on boot (verified against AppProvider/useAuth/ScheduleScreen): `auth/me`,
`events`, `tech-plans`, `sports`, `competitions`, `settings/app` (all-null
payload → app keeps `DEFAULT_*` configs incl. crewFields), `contracts`.
Catch-all: **404 JSON** for anything unhandled (visible, and 404 has no auth
side effects). socket.io is websocket-based — not intercepted; it fails
quietly (retries are console noise only).

- Payloads **import `opsFixtureWeek.ts` directly** — single source of truth
  with the unit/component suites; sports/competitions mirror the
  ScheduleScreen.test.tsx inventory (ids 1–5 / 101–110).
- **API-shaped date serialization:** fixture e9's LOCAL-midnight `Date` is
  serialized from LOCAL components to `'YYYY-MM-DDT00:00:00.000Z'` — naive
  `JSON.stringify` would UTC-shift the day on machines east of UTC.
- **Clock:** `page.clock.install({ time: FIXTURE_NOW_DAYTIME })`
  (2026-03-04T10:00Z) before navigation; fixture week selected via deep link
  `?day=2026-03-02`.
- **TRADE-OFF (recorded, binding for A-5-T1's runbook):** this does **NOT
  exercise the real backend** — EPIC A DoD says "live data". Accepted at the
  DoR gate 2026-07-03; must appear in `docs/runbooks/ops-shell.md` §known
  limitations. Backend correctness remains covered by backend's own vitest
  suite; the e2e layer proves the built bundle + routing + flag wiring.

## Specs (A-5-T1 — superseded the A-5-T0 harness proof)

- `e2e/smoke.flag-on.spec.ts` — ACs 1–4: `/ops` → `/ops/schedule` redirect +
  POSITIVE ops-chunk request assertion; fixture week render (day groups, 9
  rows, comp-102 `EXPIRING` with `exact: true` — e2's title also contains the
  word); Football facet count 3 → 3 filtered rows; e3 selection → `?event=3` +
  inspector title + conflict callout pinned to the `YYYY-MM-DD HH:MM` shape
  (A-4-T0 display fix, `not.toContainText('T00:00:00')`); theme
  dark-by-absence → `☀ LIGHT` toggle → reload persistence (`planza.opsTheme`).
- `e2e/smoke.flag-off.spec.ts` — AC-5: authenticated `/ops` lands on
  `/dashboard` (NOT `/login`), legacy `DashboardView-*.js` chunk requested,
  `OpsShell-*.js` NEVER requested (closes OpsShell v1 §Resolved ambiguities #4
  + EPIC A DoD "bundle-split verified").

## Isolation guarantees

- vitest: `include: src/**` — `e2e/` never collected (suite stays 445/445).
- `tsc -b`: app tsconfig includes `src` + `packages` only — `e2e/` and
  `playwright.config.ts` are transpiled by Playwright's own loader instead
  (KNOWN GAP: e2e TS is not typechecked by `tsc -b`; TD candidate below).
- git: `dist-e2e/`, `test-results/`, `playwright-report/`, `blob-report/`,
  `playwright/.cache/` ignored; `.env.e2e-*` tracked.

## Depends on

`@playwright/test` ^1.61 (root devDependency; chromium via
`npx playwright install chromium`) · `opsFixtureWeek.ts` (fixture pins) ·
OpsShell v1 (routes/testids) · ops-selection v1 (`?day=`/`?event=` params) ·
flags.ts TD-27 semantics · Vite 6 (`preview --outDir`, mode env files).

## Domain terms used

Ops Shell, Screen, Fixture Week (backlog §4 glossary).
