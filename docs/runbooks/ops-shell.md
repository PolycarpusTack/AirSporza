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
- **E2E intercepts the network** (ops-e2e v1, recorded trade-off): the smoke
  suite serves fixture payloads via Playwright routes and never exercises the
  real backend — a gap vs EPIC A DoD "live data". Backend behavior is covered
  by the backend vitest suite; the e2e layer proves the built bundle, routing,
  flag wiring and derivations. A live-backend smoke remains future work.
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
