# CONTRACT SNAPSHOT: ops-e2e

Version: 1.1 · Date: 2026-07-06 · Task: A-5-T0 (v1) + C-7-T1 (v1.1 stateful registry store)

**Changelog**
- **v1.1 (2026-07-06, C-7-T1):** FIRST STATEFUL interception capability. New
  `setUpRegistryE2E(page)` (ADDITIVE — calls `setUpPlanzaE2E` for auth/clock/base,
  then registers the registry routes) backed by an IN-MEMORY `RegistryStore`
  seeded from the anonymised fixture families (`FIXTURE_{SPORTS,COMPETITIONS,
  TEAMS,PLAYERS}` — NOT `E2E_SPORTS`, whose sport-5 federation differs).
  **Reset per test:** a fresh `page` → a fresh store (call it per test / in
  `beforeEach`). Routes: `GET /sports|/competitions` (store); query-aware
  `GET **/api/teams*` (`?competitionId` → linked teams, else full store WITH
  `_count`) and `GET **/api/players*` (`?teamId` → roster, else full store WITH
  `teamLinks`); `GET **/api/teams/*/competitions` (`TeamCompetitionLink[]`) and
  `GET **/api/players/*/teams` (`PlayerTeamLink[]`); `POST` team/player/sport/
  competition → append + return the created entity with `externalRefs: {}`
  (→ SOURCE MANUAL) and, for teams, `_count:{competitionLinks:0,playerLinks:0}`;
  a NAME collision → `409 { message: '<kind> … already exists' }` (the shape
  `registry-create v1` pins; the modal branches on `status===409`);
  `PATCH **/api/teams|players/*/notes` → mutate the store row's `notes` (the next
  list GET re-derives). A minimal linked graph is seeded so a HOP has a target
  (team 1 → competitions 101/103 + players 1/2). **Registration order** (Playwright
  reverse-order): general `teams`/`players` BEFORE the specific per-id routes;
  registry `sports`/`competitions` LAST so they override the static base routes.
  **Recorded gap:** the A-5 real-backend trade-off now covers WRITES too — the
  create/duplicate/remark round-trips are EMULATED in-memory, not proven against
  the real backend (backend routes covered by backend vitest incl. C-4-T0
  P2002→409). New spec `e2e/smoke-epic-c.flag-on.spec.ts` (4 ACs). Runbook
  §registry + writes-known-limitation added. Scope pinned MINIMAL (Size M): per-
  kind arrays, only teamId/competitionId filtering, only the CRUD the 4 ACs
  exercise — NO general fake-backend, no delete routes.
- **v1 amendment (2026-07-04, B-4-T1):** interception surface EXTENDED —
  `GET /api/channels` (FIXTURE_CHANNELS) and `GET /api/broadcast-slots*`
  (FIXTURE_SLOTS + the e2e-local `MIDNIGHT_BOUNDARY_SLOT`, honoring the
  service's `?dateStart/dateEnd` query as a HALF-OPEN day window
  `[dateStart, dateEnd)` on the textual date of `plannedStartUtc`; start-less
  slots EXCLUDED whenever a window param is present, mirroring Prisma's
  gte/lte null exclusion; no query → all). **Recorded DIVERGENCE:** the real
  backend uses an INCLUSIVE `lte` on dateEnd — a midnight-UTC slot returns for
  BOTH adjacent days in prod, one day here; the interception deliberately
  models what a day window MEANS, and the backend `lte` question is a
  retro/debt item. The boundary slot is spec-pinned at the NETWORK level
  (present in Tuesday's payload, absent from Monday's). Clock pin switched to
  `clock.setFixedTime` (frozen Date — kills drift on time-derived literals;
  nothing needs ticking timers). `E2E_COMPETITIONS` now aliases the shared
  `FIXTURE_COMPETITIONS` (single source since B-3-T1; delta: comp 107
  'Quiet G', matrix-excluded by the universe rule — no spec literals moved).
  New spec `e2e/smoke-epic-b.flag-on.spec.ts` (EPIC B journey; SEPARATE file
  so EPIC A pins stay byte-stable — zero build cost, the flag-on
  project/webServer is shared). Clock note: tile counts are identical at
  FIXTURE_NOW and FIXTURE_NOW_DAYTIME; the comp-101 validity-bar literal is
  clock-sensitive (44.1629% at the e2e daytime clock vs the unit suite's
  44.2009%). Runbook §rundown/§rights filled.
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
- `e2e/smoke-epic-b.flag-on.spec.ts` — EPIC B journey (schedule selection →
  rundown lanes/pills → rights tiles/matrix; B-4-T1).
- `e2e/smoke-epic-c.flag-on.spec.ts` — EPIC C registry (C-7-T1, uses the stateful
  `setUpRegistryE2E`): AC-1 counters/facets/search-facet-compose; AC-2 row select
  → `?record` + inspector, LINKED hop, deep-link restore; AC-3 create (MANUAL
  provenance) + duplicate-409 inline error, modal stays open; AC-4 protected
  remark save → `REMARKS · MANUAL` box.

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
