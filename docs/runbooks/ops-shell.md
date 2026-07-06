# RUNBOOK: Ops Shell (`/ops/*`)

Owner: ops-redesign initiative · Since: EPIC A (2026-07-03) · Status: ACTIVE
Related: ADR-012 (flagged shell) · ADR-013 (theming) · ADR-014 (deep links) ·
Contracts: `OpsShell v1`, `useOpsTheme v1`, `ops-e2e v1` (docs/governance/contracts/)

> First runbook of the OPS-REDESIGN INITIATIVE — its section structure (purpose ·
> flag procedure · verification · symptoms · known limitations · per-screen
> stubs) is the precedent for future ops runbooks. Pre-existing repo runbooks
> live at `docs/governance/runbook-ci-and-migrations.md` and
> `docs/governance/runbook-api.md`; ops runbooks live under `docs/runbooks/`
> going forward.

## Purpose / scope

The Ops redesign ships as a parallel, feature-flagged app shell at `/ops/*`
(SCHEDULE live; PLANNER/RIGHTS/REGISTRY/SYNC arrive in EPICs B–D). This runbook
covers: turning the shell on/off, verifying a deployment, and diagnosing the
common failure modes. It does NOT cover the legacy app (`/dashboard`,
`/planner`, …), which is unaffected by the flag in either state.

## Flag procedure (`VITE_OPS_REDESIGN`)

| State | Env at BUILD time | Result |
|---|---|---|
| ON | `VITE_OPS_REDESIGN=true` | `/ops/*` routes registered; ops chunk lazy-loads on first visit |
| OFF | unset, or any value ≠ `true` | `/ops` falls through to the legacy catch-all → `/dashboard`; ops chunk never requested |

- The flag is read from `import.meta.env` at build time (`src/flags.ts`).
  **There is NO runtime toggle** (TD-27 / TD candidate recorded at A-2-T1).
- **Rollback = change the env var + REBUILD + REDEPLOY.** Stated honestly:
  you cannot disable `/ops` in a running deployment; plan rollback as a
  redeploy, not a switch flip.
- Enable: set `VITE_OPS_REDESIGN=true` in the deployment's build env (see
  `.env.example`), run the normal build pipeline, deploy `dist/`.
- Disable: remove the var (or set `false`), rebuild, redeploy.
- Auth outranks the flag: unauthenticated `/ops` goes to `/login` in BOTH
  states.

## Verification (manual checklist)

Mirror of the automated smoke suite (`npm run test:e2e`, `e2e/smoke.flag-*.spec.ts`)
— run these by hand against a deployed build when e2e isn't available.
Fixture-week values in [brackets] apply to the e2e/intercepted environment;
on live data substitute a week you know.

Flag-ON build, logged in:
1. Visit `/ops` → URL becomes `/ops/schedule`; 48px `PLANZA/OPS` chrome renders.
2. Visit `/ops/schedule?day=<monday>` [2026-03-02] → day-grouped table renders
   [9 rows Mon–Fri, Sat/Sun empty]; RIGHTS column shows derived words
   [comp-102's event shows `EXPIRING`].
3. Click a sport facet → table filters to that sport; the facet count matches
   the row count [Football → 3 rows]; click again to clear.
4. Click an event row → URL gains `?event=<id>`; right-hand inspector shows the
   event title; for an event with a crew double-booking, a red callout appears
   with a `YYYY-MM-DD HH:MM` time [e3 → `2026-03-03 18:00`] — a raw
   `…T00:00:00.000Z` in that text is a regression of the A-4-T0 fix.
5. Theme: with clean storage `<html>` has no `data-theme`; click `☀ LIGHT` →
   `data-theme="light"`; reload → light persists; `☾ DARK` switches back.

Flag-OFF build, logged in:
6. Visit `/ops` → you land on `/dashboard` (NOT `/login` — that would be an
   auth regression, not flag fallthrough).
7. DevTools Network: no `OpsShell-*.js` request occurred (bundle-split intact).

## Symptom table

| Symptom | Likely cause | Check / fix |
|---|---|---|
| `/ops` shows `/dashboard` although the flag should be ON | Built without `VITE_OPS_REDESIGN=true` (build-time flag!) | Inspect the BUILD env, not the runtime env; rebuild + redeploy |
| Blank/black screen at `/ops` | Ops lazy chunk failed to load (missing `OpsShell-*.js` asset, CDN/cache mismatch after deploy) | DevTools Network for the chunk request status; hard-reload; verify `dist/assets/` deployed completely |
| `/ops` redirects to `/login` while logged in elsewhere | Token missing/expired — any API 401 clears `localStorage.token` and hard-redirects | Log in again; check `/api/auth/me` response |
| RIGHTS column all `MISSING` / wrong rights words | Contracts fetch failed (it is QUIET by design — A-3-T2) | DevTools Network `GET /api/contracts`; backend up? CORS? |
| Rows render but no conflict callout where expected | `tech-plans` fetch failed, or conflict windows off (duration/date shapes) | `GET /api/tech-plans` in Network; verify event `startDateBE`/`durationMin` |
| Theme stuck / wrong theme at load | Stale `planza.opsTheme` localStorage key | DevTools → Application → Local Storage → delete `planza.opsTheme`, reload |
| Times/dates shifted by a day | Date-object vs ISO-string handling regression (`getDateKey` normalization) | Compare an affected event's `startDateBE` shape; see ops-selectors contract §dates |
| Smoke suite passes/fails unexpectedly on a local machine | Stale `vite preview` server still holding port 4181/4182 — `reuseExistingServer` (outside CI) then serves the PREVIOUS build | Kill the process on the port (e.g. `npx kill-port 4181 4182`, or Task Manager) and rerun `npm run test:e2e` |

## Known limitations

- **RBAC parity deferred to E-3** (OpsShell v1): `/ops` requires authentication
  but no specific role yet, unlike legacy peers behind `RequireRole`. Revisit
  before cutover.
- **Theme is localStorage-only** (useOpsTheme v1 / ADR-013): per-browser, not
  per-user; no server persistence. Private-mode/storage-blocked browsers get
  session-only theming.
- **E2E intercepts the network** (ops-e2e v1/**v1.1**, recorded trade-off): the
  smoke suite serves fixture payloads via Playwright routes and never exercises
  the real backend — a gap vs EPIC A DoD "live data". **As of C-7 this gap now
  covers WRITES too:** the registry create (`POST` sports/competitions/teams/
  players), the duplicate-409, and the protected remark save (`PATCH …/notes`)
  are EMULATED against an in-memory store (`setUpRegistryE2E`, reset per test) —
  the smoke proves the built bundle + the write-path UI contract
  (`registry-create v1` payload/error shape, MANUAL provenance, remark round-trip)
  wired end-to-end, NOT the real backend routes. Backend write behavior (incl.
  the C-4-T0 P2002→409 mapping and the notes protected-field route) is covered by
  the backend vitest suite. A live-backend smoke remains future work.
- **No runtime flag toggle** (TD-27): see Flag procedure — rollback is a
  redeploy.
- **`+ PLAN` in the inspector** navigates to legacy `/sports` without
  preselecting the event; `RequireRole` may bounce non-planner roles
  (EventInspector v1, accepted).

## §rundown (`/ops/planner` — B-1/B-2, smoke: `e2e/smoke-epic-b.flag-on.spec.ts`)

Verification checklist (fixture values in [brackets], per the EPIC B smoke):
1. Select an event on SCHEDULE → URL gains `?event=<id>`; open
   `/ops/planner?day=<its day>&event=<id>` [e3 → `?day=2026-03-03&event=3`] →
   the same event's block carries the ACCENT outline (selection is shared via
   URL — EPIC B DoD); a crew-conflicted partner keeps the DANGER outline.
2. The day pill for the resolved day is active [TUE 3]; block positions are
   correct to the minute on the 05:00–24:00 axis [e3: left ≈68.42%, width
   ≈10.53% — slot 18:00–20:00 on Eén].
3. Click another day pill → lanes swap to that day's blocks, `?day=` updates,
   `?event=` survives [MON → blocks e1+e2, e3 gone].
4. Unresolvable-channel events appear in the UNASSIGNED lane (never dropped);
   clamped/off-axis blocks are tooltip-flagged.

| Symptom | Likely cause | Check / fix |
|---|---|---|
| All blocks in UNASSIGNED / lanes missing | `GET /api/channels` or `/api/broadcast-slots` failed (quiet fallback puts everything in UNASSIGNED, event-window positioned) | DevTools Network for both endpoints; slots must return the day's window |
| Block at the wrong time vs the schedule | Slot-vs-event window divergence is BY DESIGN (slot wins — rundown-layout v1); verify the slot's `plannedStartUtc` | Compare the block tooltip (raw window) with the slot row |
| Day pill counts ≠ visible blocks | Counts are UNFILTERED events per day; blocks show the SELECTED day only | Expected behavior — check `?day=` |
| Params lost when clicking the PLANNER tab | Tab NavLinks are plain paths — `?day`/`?event` drop on tab switch (retro item) | Deep-link with params; not a defect today |

## §rights (`/ops/rights` — B-3, smoke: `e2e/smoke-epic-b.flag-on.spec.ts`)

Verification checklist:
1. Tiles show VALID / EXPIRING / IN NEGOTIATION / MISSING counts that
   reconcile 1:1 with the matrix rows below [fixture: 3/2/1/3] — tiles are a
   FOLD over the rows (identity by construction).
2. Matrix rows order severity-first (MISSING, EXPIRING, NEGOTIATION, VALID)
   then name; status words are DERIVED (never the stored contract.status —
   a stored 'expiring' on a lapsed contract correctly shows MISSING).
3. Platform cells: ● = right held (linear→LINEAR, on-demand→MAX, radio→RADIO);
   ON-DEM is RESERVED and always `·` (AS-8 — see known limitations).
4. Validity: `Until <date>` + 3px bar (red <15% / amber <50% / green of the
   term remaining); NO CONTRACT rows show the red word and no bar; lapsed rows
   keep their past date with the bar gone.
5. Until contracts settle, the screen shows LOADING CONTRACTS (never an
   everything-MISSING flash).

| Symptom | Likely cause | Check / fix |
|---|---|---|
| Every row NO CONTRACT / MISSING tile = row count | `GET /api/contracts` failed (quiet — screen renders honestly after settle) | DevTools Network `/api/contracts`; backend up? |
| Tile counts look wrong vs the contracts table | Words are DERIVED from validUntil vs today — stored statuses are ignored (stale) | Check `validUntil`; see ops-selectors v3 §rights precedence |
| ON-DEM column never lights | RESERVED by design (AS-8) — `'on-demand'` maps to MAX | Not a defect; revisit at the AS-4/AS-8 stakeholder session |
| Screen stuck on LOADING CONTRACTS | The contracts request never settles (hung network) | DevTools Network — the skeleton clears on success OR failure |

Known limitation (AS-8): the ON-DEM column lights only when the domain model
distinguishes a non-MAX on-demand right — reserved until the AS-4/AS-8
stakeholder session resolves it.

## §registry (`/ops/registry` — EPIC C, smoke: `e2e/smoke-epic-c.flag-on.spec.ts`)

The registry is the sports CMS and the initiative's FIRST WRITE surface (create +
protected remarks). What the C-7 smoke covers (fixture values in [brackets]):

Verification checklist (flag-ON, logged in):
1. Visit `/ops/registry` → the toolbar counters read `N SPORTS · N COMPETITIONS ·
   N TEAMS · N PLAYERS` [`5 SPORTS · 10 COMPETITIONS · 3 TEAMS · 6 PLAYERS`] —
   `N PLAYERS`, never "PEOPLE" (AS-5). The left BROWSE rail counts match and are
   ALWAYS unfiltered.
2. Click the Teams facet → the table filters to the team rows [3]; type an
   editor's query → rows filter as-you-type and COMPOSE with the active facet
   (facet counts stay unfiltered). The LINKED column reads the server `_count`
   [team 1 → `5 linked records`].
3. Click a row → `?record=<kind>:<id>` appears and the inspector hydrates the
   record; a linked-record row in the inspector HOPS (updates the inspector + the
   URL); a fresh load of a `?record=` deep link restores the same inspector.
4. `+ NEW` → pick a kind, enter the required fields, CREATE → the modal closes,
   filters clear, and the inspector shows the new record with
   `MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE` (created records send no
   `externalRefs` → SOURCE MANUAL). A duplicate name → an inline error and the
   modal STAYS open (no phantom row).
5. On a team/player, the remark ghost (`+ ADD REMARK` / `EDIT REMARK`) opens an
   inline editor; SAVE → the `REMARKS · MANUAL` box renders the saved text.

| Symptom | Likely cause | Check / fix |
|---|---|---|
| Registry renders EMPTY (no rows, counters all 0) | One or more of the four list fetches failed, or `isSettled` never flips | DevTools Network: `GET /api/{sports,competitions,teams,players}` — all four must resolve (success OR failure settles the skeleton); the store must be seeded |
| LINKED column shows `0 …` for everything | the list payload lacks the `_count`/`teamLinks` embeds (C-1-T0) | verify the list responses carry `_count` (competitions/teams) and `teamLinks` (players) |
| Inspector shows no hop rows | the LAZY linked-record endpoints failed | Network: `GET /teams/:id/competitions`, `/players?teamId=`, `/players/:id/teams`, `/teams?competitionId=` |
| Create fails / generic error | wrong `*.create` endpoint, or a non-201 that isn't 409 | Network the `POST`; a duplicate must return **409** with a `{ message }` — anything else renders the generic error (`registry-create v1`) |
| A duplicate create shows the GENERIC error, not the inline "already exists" | backend not mapping P2002 → 409 (C-4-T0) | verify the create route's P2002→409 catch; the UI branches on `status === 409` |
| Wrong SOURCE word (e.g. TSDB where MANUAL expected) | provenance predicate keys on the FIRST `externalRefs` key (C-1 pin 3); a manual create must send `{}` | inspect the record's `externalRefs`; manual = no keys → MANUAL |
| Remark not saving | wrong `PATCH …/notes` route, or the refresh didn't re-derive | Network the `PATCH`; a successful save + refetch re-renders the REMARKS box |

Known limitation (writes): see §known-limitations — the C-7 smoke EMULATES the
create/remark writes in-memory; the real backend write routes are proven by the
backend vitest suite, not the e2e layer. Rollback of the whole shell (registry
included) is flag OFF + REBUILD + REDEPLOY (TD-27), never a runtime switch.
