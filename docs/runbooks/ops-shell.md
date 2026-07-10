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

## §sync (`/ops/sync` — EPIC D, smoke: `e2e/smoke-epic-d.flag-on.spec.ts`)

SYNC surfaces two things: nightly IMPORT-JOB health (did last night's ingest run
clean?) and the MERGE-REVIEW queue (deduplication candidates awaiting a human
approve/keep decision — the initiative's 2nd write surface, IRREVERSIBLE). Data:
`useSyncData v1` fetches `GET /api/import/jobs` (bare) + `GET
/api/import/merge-candidates?status=pending` in parallel; decisions POST to
`/api/import/merge-candidates/:id/approve-merge` (body `{targetEntityId}`) and
`/create-new`. The CURRENT side of a merge diff comes from AppProvider events
(bare-numeric-id string match). What the D-4 smoke covers (fixture values in
[brackets]):

Verification checklist (flag-ON, logged in):
1. Visit `/ops/sync` → the `NIGHTLY SYNC · 02:00 CET` label + one job card per recent
   job [3]. Each card shows a status dot (completed→green / failed→red / partial→amber /
   queued·running→neutral) and a meta line `HH:MM · OK · N RECORDS` or `HH:MM · N
   DEAD-LETTERS` [`15:00 · OK · 128 RECORDS`, `16:00 · 3 DEAD-LETTERS`, `17:00 · OK · 0
   RECORDS`]. The `HH:MM` is `startedAt ?? createdAt` as WALL-CLOCK time in the browser
   TZ (the one ambient-TZ read — the smoke pins `America/New_York`; live reads the
   viewer's TZ). The SYNC shell tab shows the pending-candidate count [`SYNC [3]`].
2. Each pending candidate is a MERGE CARD: kind chip · incoming name · `→ MATCHES →` ·
   current name · `N% MATCH` (green band ≥90, amber <90) · `VIA <source>`. When the
   current side resolves, a `FIELD | INCOMING | CURRENT` diff renders (`ops-sync-diff-row`
   rows for SPORT/COMPETITION/DATE/PARTICIPANTS that BOTH sides carry); a CHANGED
   INCOMING cell is amber. A candidate with a null `suggestedEntityId` is INCOMING-ONLY
   (`CURRENT NOT LOADED`, no diff table) and APPROVE is create-gated OFF.
3. `APPROVE MERGE` (enabled only when a `suggestedEntityId` exists) → the footer becomes
   `✓ MERGED INTO REGISTRY`; `KEEP SEPARATE` → `KEPT AS SEPARATE RECORDS`. The decided
   card's buttons are REPLACED by the terminal line (not re-decidable in-view) and the
   SYNC badge decrements. Decisions are SINGLE-FLIGHT (a rapid double-click fires once).
4. A rejected decision (e.g. a 409 "already decided", or any 5xx) renders a quiet inline
   error (`ops-sync-decision-error`) with the message, re-enables both buttons for a
   user-initiated retry, and leaves the badge unchanged.

| Symptom | Likely cause | Check / fix |
|---|---|---|
| SYNC renders `NO RECENT SYNC JOBS` / `NO PENDING CANDIDATES` unexpectedly | one/both fetches failed (QUIET by design — a failed fetch still settles the skeleton) | DevTools Network: `GET /api/import/jobs` + `/api/import/merge-candidates?status=pending` must resolve |
| Job times off by hours | the wall-clock is the AMBIENT browser TZ (the documented D-1 seam) — not a bug | confirm the viewer's TZ; the smoke pins `America/New_York` |
| Job stuck on `LOADING SYNC` | neither fetch settled (hung network) — the skeleton clears on success OR failure | DevTools Network — both requests must settle |
| Merge card shows `CURRENT NOT LOADED` where a match was expected | the suggested event isn't in AppProvider (not loaded), or `suggestedEntityId` is non-numeric | verify `GET /api/events` carries the id; DeduplicationService emits `String(eventId)` |
| `N% MATCH` looks 100× too big/small | `confidence` is a Decimal(5,2) already on a 0..100 scale — the raw value IS the percent (sync-selectors v1.2 corrected the legacy `*100`) | inspect the candidate's raw `confidence`; never re-scale |
| APPROVE MERGE greyed out | create-only candidate (`suggestedEntityId` null) — KEEP SEPARATE creates a new record | expected; the tooltip explains it |
| A decision "sticks" then reappears after reload | decisions are EMULATED in-memory in e2e (see below); a real reload refetches the backend | not an e2e concern on live data — the backend 409 guard is the real idempotency |

Known limitations (§sync):
- **Writes are EMULATED in e2e** (ops-e2e **v1.2**, extends the A-5/C-7 gap): the D-4
  smoke serves import JOBS STATICALLY and the merge-candidate store IN-MEMORY
  (`setUpSyncE2E`, reset per test) — approve/keep decisions mutate that store and never
  hit the real backend. The smoke proves the built bundle + the EPIC D contracts
  (`sync-selectors v1.2` diff/band derivation, `useSyncData v1` quiet-settle, the
  `merge-decision v1` single-flight write path incl. the inline-error branch) wired
  end-to-end — NOT the real routes. The real idempotency is the D-3-T0 backend 409 guard
  ("already decided"), covered by the backend vitest suite; a live-backend smoke remains
  future work.
- **`NIGHTLY SYNC · 02:00 CET` is STATIC copy** (design) — it is not read from a scheduler;
  the actual cadence lives in the backend cron/config, not the UI.
- **The badge is FIRST-VISIT populated** (pin 5): the pending count publishes UP to the
  shell tab only once the Sync screen mounts and settles; there is no pre-visit
  cross-screen count fetch (an E-item). It is not cleared on navigating away (persistent
  chrome, by design).

## §performance (EPIC E — HARDENING, E-1: `docs/ops-perf-verification.md`)

Two measurement layers: Layer A = deterministic vitest selector benches (node, no
network, warm-up + N samples, p50/p95/p99) pinning the algorithmic ceiling; Layer B =
Playwright `goto → settled-testid` wall-clock against the flag-on preview build, full
`/api/*` interception. Layer B numbers are **cold-boot-inclusive upper bounds** (each
iteration is a fresh SPA boot) — a real in-app tab switch is faster.

### SLO summary (9 SLOs, machine: win32 x64 i5-1345U, Chromium via `vite preview`)

| # | SLO (target · volume) | Measured | Verdict |
|---|---|---|---|
| 1 | Schedule initial render < 1.5s p95 @ 500 events | PW p95 1162ms (p50 959); derive p95 9.6ms | PASS |
| 2 | Theme toggle swap < 100ms p99 | PW p99 162ms (p50 97, min 80) | INCONCLUSIVE — see limitations |
| 3 | Rundown day-switch < 200ms p95 | PW p95 118ms (p50 100) | PASS |
| 4 | Rights render < 1s p95 @ 100 contracts | derive p95 0.63ms; DOM-at-scale not PW-measured | PASS (derivation) — see limitations |
| 5 | Registry initial render < 1.5s p95 @ 2,000 | pre-fix p50 2732/p95 3418ms (FAIL); post-remediation p50 **1083ms**/min 746ms, cold-boot p95 **1762ms** | DOM-render FIXED — median PASS; p95 tail now fetch/boot-bound |
| 6 | Registry search keystroke < 50ms p95 @ 2,000 | derive p95 2.5ms | PASS |
| 7 | Registry inspector hop < 100ms p95 | pre-fix p95 991/p50 850ms (FAIL); post-remediation p95 **108–153ms**/p50 **74–97ms** (~8× better) | APP OPERATION FIXED — residual ≈ Playwright harness floor |
| 8 | Sync initial render < 1.5s p95 @ 50 jobs + 100 candidates | PW p95 1032ms; derive p95 23ms | PASS |
| 9 | Merge decision click → terminal < 300ms (optimistic) | derive p95 0.002ms | PASS |

Original run: 6 PASS · 2 FAIL (#5, #7) · 1 INCONCLUSIVE (#2), plus a #4 DOM-at-scale
measurement gap. Every derivation layer is cheap (< 25ms) — no selector was ever the
bottleneck; both FAILs were DOM/React-render costs on the unvirtualized 2,000-row
registry table.

### Registry-virtualization remediation (closes #5/#7, flag-gated FEATURE, architect-approved A+C)

`src/pages/ops/RegistryScreen.tsx` + `registryWindow.ts`:
- **Row windowing** (closes #5) — the row list sits in a bounded-height scroll
  container; only the visible window (+ overscan) renders, with top/bottom spacer divs
  preserving scrollbar geometry. Uniform `ROW_HEIGHT = 44px`. **jsdom/pre-measure
  fallback:** a measured 0 viewport height (jsdom) renders the FULL range — windowing
  engages only on a real positive height (real browser), so existing unit tests keep
  seeing all rows.
- **`React.memo` row + a stable selection callback** (closes #7) — `RegistryTableRow`
  is memoized; a latest-ref indirection gives a truly stable `onSelect` (react-router
  v7's `setRecordId` is not referentially stable on its own), so a selection change
  re-renders only the two affected rows instead of the whole table.
- No backend change; the pure selectors were untouched (they were never the
  bottleneck). Pinned by `registryWindow.test.ts` (6 tests) + 2 new `RegistryScreen`
  windowing tests (RED→GREEN); full suite stayed green, `tsc -b` clean.

### Known measurement limitations (honest, not PASSes)

| Limitation | Detail |
|---|---|
| #2 theme toggle | Not isolatable below the ~70–90ms Playwright click+`waitFor` harness floor at this measurement layer; a clean verdict needs an in-page `performance.mark` (a production edit, out of the VERIFICATION hat). GATE: approve that instrumentation, or accept the toggle as visually-instant and de-scope the p99 SLO. |
| #4 rights DOM-at-scale | Only the derivation (0.63ms) was measured; the full DOM render at 100 contracts was not independently Playwright-measured (fixture screen renders ~9 rows). Row-count interpolation makes a DOM PASS *likely*, not proven. |
| Cold-boot upper bounds | Render numbers include a full SPA boot (React mount + AppProvider fetch + auth + screen mount). The #5 FAIL held regardless (min 1.4s pre-fix); #1/#8 PASSes are conservative. |
| Chromium-only | Layer B is Chromium-only by design. |

### Bare-array / pagination posture

- **Registry** (`useRegistryData`, 4-way bare arrays): derivation does not cross the
  1.5s budget until the hundreds-of-thousands range (271ms @ 80k records), but the
  **binding ceiling was always the DOM**, not the derivation — the unvirtualized table
  failed #5/#7 already at the 2,000-record SLO target. The E-1 remediation above
  (windowing) is what actually raises the client ceiling; the list is now windowed,
  not paginated (no backend contract change).
- **Sync** (`useSyncData`, jobs + candidates bare arrays): no breach of the 1.5s
  derivation budget to 20,000 candidates; at the SLO volume the DOM render also
  PASSES. Sync volumes are **server-bounded** (pending-only query) → no near-term
  pagination pressure, though the same bare-array pattern would recur if a source ever
  floods the pending queue.

### How to re-run

```
# Layer A (node benches — deterministic, no server):
npx vitest run --config vitest.perf.config.ts

# Layer B (Playwright — needs the flag-on preview server on :4181):
npx vite preview --outDir dist-e2e/on --port 4181 --strictPort   # build first if dist-e2e/on is stale
npx playwright test --project=flag-on perf.flag-on.spec.ts --workers=1
```

## §accessibility (EPIC E — HARDENING, E-2: `docs/ops-a11y-audit.md`)

Scope: the 5 ops screens + shared components they render (`EventInspector`,
`RecordInspector`, `RegistryCreateModal`, `OpsShell`). Dimensions checked: keyboard
operability, contrast (both themes, WCAG AA), visible focus.

### Keyboard operability — status: PASS (all 3 clickable rows/blocks)

The clickable-row/block shape occurred 3 times (`ScheduleRow`, the Rundown timeline
block, the Registry table row) — Rule of Three. `ScheduleRow` and the Rundown block
already had `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space); the Registry
table row had none of it (mouse-only FAIL at audit time). E-2-T2 fixed Registry and
extracted the shared primitive (`getRowActivationProps`) that all three now consume —
de-duplicated and consistent. All native `<button>`/`NavLink` controls across the 5
screens were already keyboard-operable by the UA.

### Focus visibility — status: PASS (after E-2-T2 fix)

No ops-authored `:focus`/`:focus-visible` rule existed anywhere in `ops.css`; every
native control relies on (and correctly shows) the browser default ring. One bug was
found and fixed: the **Rundown timeline block** set `outline-style: none` inline
whenever unselected/non-conflicted — since this is a selection/conflict indicator, not
a focus indicator, it unconditionally suppressed the UA focus ring for keyboard users
on most blocks, in both themes. E-2-T2 gave focus its own indicator independent of the
selection/conflict outline.

### Contrast — status: AA in both themes (after E-2-T3 nudge)

Two light-theme-only FAILs were found (both final-intent colors from the A-1-T4
sign-off, so nudged rather than silently re-picked, per that round's own rule):

| Token (light) | Before | Ratio | After | Ratio |
|---|---|---|---|---|
| `--alert-danger` | `#D71F24` | 4.49 | `#D31F24` | 4.63 (AA) |
| `--alert-negotiation` | `#AE551B` | 4.48 | `#A9551B` | 4.61 (AA) |

Same hue, single-channel (R) −4/−5 darkening, applied to `tokens.css`
`[data-theme="light"]` only; dark theme was already passing (5.03 / 6.62) and is
untouched. These surfaced specifically on RightsScreen's MISSING/NEGOTIATION matrix
rows and ScheduleScreen's unselected-row RIGHTS/CREW words — both render directly on
`--bg-shell`, a backdrop the earlier v2 contrast audit (A-1) hadn't checked. All other
pairs (93, from `docs/ops-contrast-audit.md`) carry forward unchanged.

### DEFERRED — 7 designer-polish notes (owner: dedicated designer session, AC-4)

None of these block cutover; tracked for E-4 debt servicing or a designer pass:

1. `--registry-*` STATUS token family (borrows other tokens today — naming/family decision)
2. Channel color vars for Ketnet / VRT MAX Sport / Radio 1 (Rundown unmapped/UNASSIGNED lanes)
3. Sport-icon/federation + per-kind create fields (RegistryCreateModal)
4. Provenance SOURCE-code-vs-full-name copy (`SYNCED FROM TSDB` vs "THE SPORTS DB")
5. `N PLAYERS` vs design's `12 PEOPLE` (AS-5) — already resolved as deliberate display-honesty; listed for completeness only
6. Copy strings: `MAX` platform header / `NIGHTLY SYNC · 02:00 CET` / season-label
7. `reasonCodes` + a merge-confirm step ahead of an irreversible decision (no code yet — new UX flow)

## §security-rbac (EPIC E — HARDENING, E-3: `docs/ops-security-review.md`)

STRIDE re-check of the two ops write paths (registry create, merge decisions) plus an
RBAC-parity comparison against the legacy `RequireRole` gates. Verdict: both write
paths are authenticated, rate-limited, tenant-scoped in their primary queries,
input-validated (Zod), and Prisma-parameterised.

### RBAC posture (current, post E-3-T2)

- **`/ops/*` stays authenticated-only** (no front-end `RequireRole` around `OpsShell`)
  — this was deliberately ACCEPTED, not left as an oversight: the backend
  `authorize()` middleware on every write route is the real, unchanged authorization
  boundary, and a UI guard would only duplicate a control already correct and
  enforced server-side. Per-tab UI role-hiding (graying out buttons a role can't use)
  is deferred as UX polish, not a security requirement.
- **Merge-decision write routes tightened: `sports` dropped.** All three routes
  (`POST /merge-candidates/:id/{approve-merge,create-new,ignore}`) now gate
  `authorize('planner', 'admin')`, matching legacy `ImportView`'s `['admin',
  'planner']`. Previously `authorize('planner','sports','admin')` let `sports` reach a
  one-click, irreversible merge decision that legacy `/import` denied at the UI — the
  real elevation this story closed. GET reads (`/merge-candidates`, `/jobs`) are
  unchanged (authenticated-only) — only writes were gated.
- **F-1 tenant guard added to the merge target lookup** (defense-in-depth,
  independent of RLS activation status). `updateImportedEvent` now accepts an
  optional `tenantId` and, when supplied, scopes the target lookup
  (`findFirst({ where: { id, tenantId } })`) instead of an id-only `findUnique`.
  `manualMergeNormalizedEvent` (the user-supplied-target path) threads it; the
  automated-import callers pass none (unchanged behavior, zero import-pipeline
  blast radius). Effect: a cross-tenant `targetEntityId` now finds no target instead
  of silently merging onto another tenant's event.
- Registry create was already `authorize('admin')` at the backend regardless of who
  reaches the `/ops/registry` modal — no data-level elevation there; a non-admin
  create still 403s (cosmetic UI exposure only, already covered by the disposition
  above).

### Open items (not closed by E-3-T2)

| Item | Description | Disposition |
|---|---|---|
| F-2 — no actor attribution | The 4 registry create routes (teams/players/sports/competitions) write no `createdBy` and emit nothing to `/api/audit`; a created record can't be traced to a user. Contrast the merge path, which records `reviewedBy`/`reviewedAt`. | Open — cheap fix (mirror the merge path); not yet scheduled |
| F-3 — missing sport-ownership check | `competitions.ts` create omits the tenant-ownership check teams/players perform, letting an admin reference a foreign-tenant `sportId`. | Open — cheap fix (`prisma.sport.findFirst({ id, tenantId })` guard); not yet scheduled |

Neither is a shipped data breach on its own (admin-only trust, low severity); both are
integrity/audit-trail gaps recorded for a future hardening pass.

## §rollout (`opsRedesign` / `VITE_OPS_REDESIGN` flag — E-5)

**Stated honestly against TD-27:** the flag is read from `import.meta.env` at BUILD
time (`src/flags.ts`) — there is **no runtime toggle**. Enabling or disabling `/ops/*`
for a population of users is a **rebuild + redeploy**, not a config flip or a
feature-flag-service switch. Rollback is symmetric: redeploy the flag-OFF build. See
§Flag procedure above for the mechanics; this section is the rollout SEQUENCE.

### Staged rollout suggestion (build-time flag, given the above constraint)

1. **Staging build, flag ON.** Build with `VITE_OPS_REDESIGN=true` and deploy to a
   staging environment only. Run the manual verification checklist (this runbook, all
   §sections) plus the automated smoke suites (`e2e/smoke*.flag-on.spec.ts`) against
   that build.
2. **Smoke sign-off.** Confirm the E-1 performance SLOs, E-2 accessibility fixes, and
   E-3 RBAC posture all hold on the staging build (not just in isolated test runs) —
   this is a real-build check, since the flag changes what bundle ships.
3. **Canary / limited-prod build, flag ON.** A separate build+deploy targeting a
   canary slice (or a subset of traffic/tenants if the deployment topology supports
   it) — still a distinct artifact from the flag-OFF prod build, since there's no way
   to flip a subset of already-deployed clients at runtime.
4. **Full prod build, flag ON.** Once the canary holds, build+deploy the flag-ON
   artifact as the new production build. Rollback at any stage = redeploy the
   previous (flag-OFF, or previous-stage) build — plan the deploy pipeline to keep
   the last flag-OFF artifact ready to re-deploy, since "rollback" here is a deploy
   action, not a toggle.

### TD-27 runtime-flag — DECIDED (E-4, 2026-07-10)

The architect **accepted redeploy-rollback for now** (no runtime override built). The flag
stays build-time; rollback = redeploy the flag-OFF build, as the staged plan above assumes.
A runtime override (settings service / env-served config / header override) remains a
possible future add — revisit if the two-live-surfaces cadence needs a faster kill-switch —
but is deliberately NOT built in this epic.

### Cutover cross-reference (ADR-016, E-6)

**ADR-016 is DECIDED (2026-07-10): COEXIST — flag flipped ON as a browse layer.** `/ops/*`
ships ON in prod ALONGSIDE the legacy screens (legacy retained for ALL editing + the
ImportView operator tabs SYNC doesn't cover); no legacy route is removed. So this §rollout
sequence (staged flag-ON builds) IS the cutover — there is no legacy-removal step. Making
ops the sole surface is a follow-on initiative (build the missing ops editors + reconcile
ImportView's dropped tabs). The staged-rollout mechanics above are how flag-ON traffic
live safely; ADR-016/E-6 covers making it the default.
