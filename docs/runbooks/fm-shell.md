# RUNBOOK: Planza/FM Shell (`/fm/*`)

Owner: Planza/FM initiative · Since: EPIC FM-1 (2026-08-14) · Status: ACTIVE (flag OFF everywhere, incl. production)
Related: ADR-020 (flagged shell) · ADR-014 (deep links, reused) ·
Contracts: `FmShell v1`, `fmActionItems v1`, `fmUrlState v1`, `ActionItemResolution v1`,
`FmToast v1`, `useContinue v1`, `FmCreateModal v1`, `fm-e2e v1` (docs/governance/contracts/)

> Structure mirrors `docs/runbooks/ops-shell.md` (purpose · flag procedure ·
> verification · symptoms · known limitations · per-EPIC stubs) — the
> established precedent for redesign-initiative runbooks under
> `docs/runbooks/`.

## Purpose / scope

Planza/FM ships as a THIRD parallel, feature-flagged app shell at `/fm/*`
(ADR-020), alongside the legacy app and the existing Ops shell (`/ops/*`).
EPIC FM-1 (the tracer bullet) delivers ONE fully working screen — Home: 4 KPI
tiles, a typed action-item inbox aggregating CONFLICT/RIGHTS/UNPLACED/CREW/FEED
risks, a detail pane with MARK RESOLVED, the global CONTINUE loop, and a
global create modal. This runbook covers: turning the shell on/off, verifying
a deployment, and diagnosing the common EPIC FM-1 failure modes. It does NOT
cover the legacy app or `/ops/*`, neither of which is affected by the
`fmShell` flag in either state.

**Interim bridge (read this first):** EPIC FM-1 ships no native FM screens
beyond Home. Every action-item CTA and post-create landing navigates into the
EXISTING `/ops/*` screens via the stable ADR-014 URL contract (`?event=`,
`?record=`) — `/ops/schedule?event=<id>`, `/ops/planner?event=<id>`,
`/ops/rights?record=competition:<id>`. This means **`fmShell` requires
`opsRedesign` ON too** for the interim bridge to land anywhere real — see
Flag procedure. EPIC FM-2/FM-3 replace these targets with native `/fm/*`
screens; this is a route-string swap at that point, not a rewrite.

## Flag procedure (`VITE_FM_SHELL`)

| State | Env at BUILD time | Result |
|---|---|---|
| ON | `VITE_FM_SHELL=true` (+ `VITE_OPS_REDESIGN=true` — see above) | `/fm/*` routes registered; fm chunk lazy-loads on first visit |
| OFF | unset, or any value ≠ `true` | `/fm` falls through to the legacy catch-all → `/dashboard`; fm chunk never requested |

- The flag is read from `import.meta.env` at build time (`src/flags.ts`,
  `isFmShellEnabled()`). **There is NO runtime toggle** (TD-27, same posture
  `opsRedesign` already accepted).
- **Rollback = change the env var + REBUILD + REDEPLOY.** You cannot disable
  `/fm` in a running deployment; plan rollback as a redeploy, not a switch
  flip.
- Enable: set `VITE_FM_SHELL=true` **and** `VITE_OPS_REDESIGN=true` in the
  deployment's build env (see `.env.example`), run the normal build pipeline,
  deploy `dist/`.
- Disable: remove the var (or set `false`), rebuild, redeploy.
- **Currently OFF everywhere, including `.env.production`** — EPIC FM-1 has
  not been through a rollout decision; this is a deliberate, stated posture,
  not an oversight. Do not flip it in any real deployment without an explicit
  go/no-go (mirrors ADR-016's precedent for the ops shell's own cutover).
- Auth outranks the flag: unauthenticated `/fm` goes to `/login` in BOTH
  states.

## Verification (manual checklist)

Mirror of the automated smoke suite (`npm run test:e2e:fm-on` for the flag-ON
project, `smoke-fm-boot.flag-off.spec.ts` under the existing flag-off
project) — run these by hand against a deployed build when e2e isn't
available. Fixture-week values in [brackets] apply to the e2e/intercepted
environment; on live data substitute a week you know.

Flag-ON build (`VITE_FM_SHELL=true` + `VITE_OPS_REDESIGN=true`), logged in:
1. Visit `/fm` → URL becomes `/fm/home`; 216px sidebar (`PLANZA/FM` brand,
   OVERVIEW/PLANNING/SPORT/RESOURCES sections) + 52px top bar render.
2. Home's 4 KPI tiles show non-zero counts for a week with real risk data
   [fixture week: CONFLICT/RIGHTS/UNPLACED all non-zero]; the inbox lists at
   least one row of each of the 5 kinds (CONFLICT/RIGHTS/UNPLACED/CREW/FEED).
3. Click a CONFLICT row → detail pane shows kind badge/title/body; click its
   primary CTA → lands on `/ops/schedule?event=<id>` with that event selected
   in the Ops inspector (proves the interim-bridge contract end to end).
4. Click MARK RESOLVED on a row → it dims (45% opacity) with a ✓ prefix
   immediately; **reload the page** → it is STILL dimmed/✓ (proves
   `ActionItemResolution` persistence through the real
   `POST/GET /api/fm/action-items/resolve(s)` round trip, not just optimistic
   client state).
5. Click CONTINUE → navigates to the first unresolved item in priority order
   (CONFLICT > RIGHTS > UNPLACED > CREW > FEED) and shows a toast
   `"<KIND>: <title>"`. Resolve what it landed on, return to `/fm/home`,
   click CONTINUE again — repeat until the queue is empty, at which point
   CONTINUE shows an "ALL CLEAR" toast and does not navigate. The top-bar
   count chip updates live as items resolve.
6. Click "+ NEW" → a 540px centered modal opens with TRANSMISSION (default) /
   TEAM / ATHLETE / COMPETITION kind tabs. Create a transmission with no
   channel selected → the modal closes, you land on
   `/ops/schedule?event=<newId>`; back on `/fm/home`, a new UNPLACED item is
   present for it. Create a TEAM/ATHLETE/COMPETITION → lands on
   `/ops/registry?record=<kind>:<id>`.

Flag-OFF build (`VITE_FM_SHELL=false`, `opsRedesign` state irrelevant),
logged in:
7. Visit `/fm` → you land on `/dashboard` (NOT `/login` — that would be an
   auth regression, not flag fallthrough).
8. DevTools Network: no `FmShell-*.js` request occurred (bundle-split intact).

## Symptom table

| Symptom | Likely cause | Check / fix |
|---|---|---|
| `/fm` shows `/dashboard` although the flag should be ON | Built without `VITE_FM_SHELL=true` (build-time flag!), or `VITE_OPS_REDESIGN` wasn't ALSO set | Inspect the BUILD env, not the runtime env; both flags must be `true` together; rebuild + redeploy |
| Blank/black screen at `/fm` | `fm` lazy chunk failed to load (missing `FmShell-*.js` asset, CDN/cache mismatch after deploy) | DevTools Network for the chunk request status; hard-reload; verify `dist/assets/` deployed completely |
| Wrong / missing action items in the inbox | Selector or fixture drift — `fmActionItems.ts`'s `deriveActionItems` composes `ops/selectors.ts` (`deriveCrewHealth`/`deriveRightsStatus`/`deriveCrewRoles`) + its own UNPLACED predicate + ripple `FEED` mapping | Check the upstream selector's own contract hasn't drifted (`ops-selectors v3`); verify `GET /api/events`/`/contracts`/`/tech-plans`/`/ripple-proposals?status=PENDING` all resolve; a quiet ripple-fetch failure only omits FEED, never the other 4 kinds |
| MARK RESOLVED doesn't survive reload | `ActionItemResolution` migration/RLS issue, or the `GET /api/fm/action-items/resolutions` route isn't returning the resolved key for the current user+tenant | Check the migration `20260814200000_add_action_item_resolution` applied; verify `POST .../resolve` returns 200 and `GET .../resolutions` includes the key afterward (tenant+user scoped) |
| CTA lands on the wrong screen / a 404-feeling blank ops tab | Broken interim-bridge target — `targetRoute` in `fmActionItems.ts` must be a REAL `OPS_TABS` id (`schedule`/`planner`/`rights`/`registry`/`sync`) | Check the item's `targetRoute` against `OpsShell.tsx`'s `OPS_TABS`; a past bug shipped `/ops/rundown` (not a real tab — the day-timeline tab id is `planner`), caught and fixed before merge — if it recurs, it's a regression |
| RIGHTS item CTA lands on Rights but nothing is preselected | **Known gap, not a bug** — `RightsScreen.tsx` doesn't consume `?record=` yet (only `RegistryScreen` does); documented in `fmActionItems.ts`'s own header. Landing on the tab (never a crash) is all EPIC FM-1 promises for RIGHTS | Wiring `?record=` support into `RightsScreen` is FEATURE work for a future story, not a regression to chase now |
| CONTINUE shows ALL CLEAR while items are still visibly unresolved | `useContinue()` runs a SEPARATE `useFmActionItems()` fetch from Home's own (documented double-fetch trade-off, FM1-5-T1) — a genuine race is possible if the two fetches settle inconsistently on a slow/flaky network | Reload `/fm/home` and retry; if it reproduces reliably (not just under network stress), it's a real bug — check both hooks are reading the same underlying data |
| CONTINUE's toast never appears / disappears too fast to read | `FmToastHost` shows one message at a time, ~2.6s auto-dismiss, only one instance mounted (in `FmShell.tsx`, wraps the whole `/fm/*` tree) | Confirm `FmToastHost` is still mounted at the shell level, not per-screen; check `data-testid="fm-toast"` renders on the click |
| Create modal's TEAM/ATHLETE/COMPETITION tabs show the wrong kind pre-selected, or an unexpected "SPORT" 4th tab appears when opened | `RegistryCreateModal`'s own internal kind selector (team/player/sport/competition) is a SEPARATE control from FM's outer tabs, seeded via its additive `initialKind` prop — "sport" remains reachable via the modal's OWN internal tabs even from FM's chrome (accepted overlap, not filtered) | Expected, documented behavior (`FmCreateModal.tsx`'s own header) — not a bug unless the SEED itself is wrong (ATHLETE should seed "player", not "team") |
| Smoke suite passes/fails unexpectedly on a local machine | Stale `vite preview` server still holding port 4181/4182/4183 — `reuseExistingServer` (outside CI) then serves the PREVIOUS build | Kill the process on the port (e.g. `npx kill-port 4181 4182 4183`) and rerun `npm run test:e2e:fm-on` |

## Known limitations

- **Interim-bridge targets are `/ops/*`, not native FM screens** — EPIC FM-1
  ships only Home; every other nav item (Schedule board, Season calendar,
  Competitions, Teams, Athletes, Crew, Match day) is a placeholder panel that
  never crashes but does nothing yet. EPIC FM-2/FM-3/FM-4 build the real
  screens; the interim-bridge targets flip to native `/fm/*` routes at that
  point.
- **RIGHTS items don't visually preselect on landing** (see symptom table) —
  `RightsScreen.tsx` has no `?record=` consumer yet; a FEATURE gap for a
  future story, not scoped to EPIC FM-1.
- **`useContinue`'s double-fetch** (FM1-5-T1, documented, not fixed here): the
  top-bar CONTINUE button and Home's own inbox each run an independent
  `useFmActionItems()` fetch rather than sharing one subscription. Both are
  quiet-failure, additive fetches — the cost is extra requests, not
  correctness, but a shared fetch/context de-dup is a candidate for a later
  EPIC once a second real shell-level consumer exists.
- **E2E intercepts the network** (`fm-e2e v1`, extends the `ops-e2e v1`
  trade-off): the smoke suite serves fixture payloads via Playwright routes
  and never exercises the real backend. Backend correctness (the resolve
  route's idempotent upsert, the migration's RLS policy) is covered by the
  backend vitest suite (`backend/tests/fmActionItems-routes.test.ts`,
  `actionItemResolution-structure-rls.test.ts`), not the e2e layer.
- **No runtime flag toggle** (TD-27): see Flag procedure — rollback is a
  redeploy. `fmShell` additionally requires `opsRedesign` ON, so a rollback
  plan must account for both flags together if `opsRedesign` is ever
  independently toggled.
- **Create modal's visual seam**: `FmCreateModal` cannot fully de-chrome the
  wrapped `DynamicEventForm`/`RegistryCreateModal` (their own header text
  renders as a sub-header inside FM's outer panel) — a `transform:
  translateZ(0)` containment technique confines their own `position: fixed`
  backdrops to the 540px body, but this is a stated interim visual
  compromise, not a bug to chase (`FmCreateModal.tsx`'s own header comment).

## §FM-2 — Schedule board upgrades

Not yet built. Will replace `/ops/schedule` as the CONFLICT/CREW/FEED interim
bridge target; adds the UNPLACED tray, channel reassignment, undo/history,
and the ripple cascade banner. See `docs/backlog-planza-fm.md` EPIC FM-2.

## §FM-3 — Sports world

Not yet built. Will replace `/ops/rights`/`/ops/registry` as the RIGHTS and
TEAM/ATHLETE/COMPETITION-create interim bridge targets; adds Competitions,
Team profile, and Athlete profile screens. See `docs/backlog-planza-fm.md`
EPIC FM-3.

## §FM-4 — Crew + Match Day

Not yet built. Adds the Crew squad screen and the per-event Match Day
screen. See `docs/backlog-planza-fm.md` EPIC FM-4.

## §FM-5 — Consolidation

Not yet built. Season calendar, light theme, and the ops/legacy retirement
decision (gated on an ops-stakeholder taste-test, mirroring the SV EPIC's
FEED=review gate). See `docs/backlog-planza-fm.md` EPIC FM-5.
