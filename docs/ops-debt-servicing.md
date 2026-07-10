# Ops redesign — E-4 TD servicing decisions ("no invisible debt")

**Story E-4 · EPIC E (HARDENING) · Hat = PREPARATORY/VERIFICATION (governance consolidation — no
production code changed by this task).** Date: 2026-07-10.

**Why this doc, not `debt-register.md`:** `docs/governance/debt-register.md` has uncommitted
changes from a separate parallel session at the time of writing — every A–D retro explicitly
deferred its debt write-up until "the register is free". Editing/staging/reverting that file
here would risk clobbering the other track's work, so this doc is the E-4 deliverable instead.
**Housekeeping follow-up:** once `debt-register.md` is free, merge every numbered item below into
it (most as new `TD-3x` entries; a few as amendments to existing TD-23/24/25/27 entries) — this
doc's numbering (`E4-01..E4-38`) is scratch, not permanent, and should be replaced by whatever the
register's next free TD number is at merge time.

**Method.** Every item below was re-read against the four retro blocks in
`docs/backlog-planza-ops-redesign.md` (EPIC A/B/C/D "Debt candidates awaiting a free
`debt-register.md`" + "Found work" + "Process notes" sections), the three completed E-1/E-2/E-3
verification docs, and the pre-existing TD-23..27 entries in `debt-register.md`. Where a claim was
checkable in the current tree it was re-verified (noted inline as "verified 2026-07-10"); nothing
below is asserted from memory of the backlog text alone where code was available to check.

**Important context discovered during this pass:** E-1 (perf), E-2 (a11y) and E-3 (security) were
**already executed** as of today (2026-07-10) — their docs contain not just verification findings
but "§E-1 remediation", "E-2-T3 — Resolution" and "E-3-T2 — Resolution" sections showing
architect-decided fixes already landed in code. This closes several items that would otherwise
still be open gates (see §4). Only three gates remain genuinely undecided for E-4 to surface (§5).

---

## 1. Pre-existing ACTIVE ops TDs (TD-23..27)

| ID | Item | Re-verification (2026-07-10) | Disposition | Owner |
|---|---|---|---|---|
| TD-23 | `ui/Btn.tsx` vs `ui/Button.tsx` duplication — never import either into `ops/` | **Verified: zero imports of either from `src/components/ops` or `src/pages/ops`.** Guard holds. | **ACCEPT-WITH-OWNER** — keep avoiding in ops (cheap, already working); the Btn/Button consolidation itself is a `src/components/ui/` concern, outside this initiative's scope | Owner: whoever next touches `ui/Btn`/`ui/Button` (not an ops-initiative task) |
| TD-24 | `Event`/`Contract` `@deprecated` fields — ops must consume `platforms[]`/`BroadcastSlot` | **Verified**: `rundownLayout.ts`/`ops-selectors` resolve channel via `BroadcastSlot` + relation fallback (never the deprecated string fields); no ops file reads `Event.channel`/`Event.duration`/legacy rights booleans. | **DECIDED-ELSEWHERE / SCHEDULE** — guard holds today; the fields' actual *removal* is explicitly deferred to the E-6 cutover ADR (ADR-016), per the existing register entry. No new decision needed at E-4. | E-6-T0 (ADR-016 scope) |
| TD-25 | `Event.participants` free text — Registry LINKED must use repo relations | **Verified**: `registrySelectors.ts:16-17` states and enforces the rule in a header comment; no `.participants` parsing found in registry code. | **ACCEPT-WITH-OWNER** — guard holds; migration/backfill of `participants` into structured relations is a product decision with no current trigger, not an ops-initiative blocker | Registry/domain-gaps track (out of ops-initiative scope) |
| TD-26 | Ops light-theme AA-derived values | Already ✅ **SETTLED** 2026-07-02 (signed off). | **CLOSED** — not re-opened by E-4 (per its own instruction) | n/a |
| TD-27 | `opsRedesign` flag build-time only, no runtime override | **Verified**: `src/flags.ts` header comment still states "flags are build-time only… no runtime override"; `isOpsRedesignEnabled()` reads `import.meta.env.VITE_OPS_REDESIGN` directly. Unchanged. | **ARCHITECT GATE 1** — see §5 | Architect |

---

## 2. EPIC A debt candidates

| # | Item (origin: EPIC A retro) | Re-verification | Disposition |
|---|---|---|---|
| E4-01 | Double conflict scan in `ScheduleScreen` (unify when Rundown becomes 2nd consumer) | **Verified CLOSED**: `ScheduleScreen.tsx:95` has exactly one `detectCrewConflicts(...)` call site (memoized), feeding both the table and the inspector — the "one pass per screen" convention (B-1 pin 4) was already applied here. | **CLOSED** (resolved in-flight, not separately recorded until now) |
| E4-02 | Second `contractsApi.list` consumer extraction moment (arrives with B-1) | EPIC B retro records this explicitly: "contracts-duplication loop opened B-1-T2 → closed B-3-T2 PREP" (`useContracts` extraction). | **CLOSED** |
| E4-03 | e2e TS not typechecked by `tsc -b` | **Verified**: root `tsconfig.json` `include` = `["src", "packages"]` — `e2e/` is excluded from every `tsc -b` run. Still true across all 4 epics' e2e specs (13+ specs, incl. `perf.flag-on.spec.ts`). | **SCHEDULE** — add a dedicated `tsconfig.e2e.json` + a CI step (`tsc -p tsconfig.e2e.json --noEmit`); cheap, no urgency; bundle with the next e2e-touching task (E-6-T1 regression run is a natural moment) |
| E4-04 | e2e profile builds serial/un-cached (~45s/run) | Unchanged; grows slightly with each epic's added specs (now 13+D + perf spec). | **ACCEPT-WITH-OWNER** — CI wall-clock cost only, not a correctness or security issue; revisit only if e2e turnaround becomes a felt bottleneck |
| E4-05 | Theme-toggle e2e selector keys on the glyph label (testid candidate) | Not touched by E-1/E-2/E-3; the perf spec's theme-toggle measurement (E-1 GATE E-1-B, §4) reuses the same fragile selector. | **SCHEDULE** — one-line `OpsShell` `data-testid` addition + matching spec update; bundle with E-6-T1 (the one remaining FEATURE task that already touches `OpsShell`/e2e) |
| E4-06 | Live-backend smoke gap (e2e is full network-interception, never the real backend) | Recorded in `docs/runbooks/ops-shell.md` §known limitations since A-5; unchanged through B/C/D. | **ACCEPT-WITH-OWNER** — documented trade-off since the A-5 harness decision; a real-backend smoke suite is a distinct initiative, not an ops-redesign gap |
| E4-07 | Full vitest suite occasionally flaky under process contention (pre-existing `DynamicEventForm` timing tests) | Pre-existing, not introduced by ops work. | **DECIDED-ELSEWHERE** — owned by whoever owns `DynamicEventForm` / the mitigation-plan track, not this initiative |

---

## 3. EPIC B debt candidates

| # | Item (origin: EPIC B retro) | Disposition |
|---|---|---|
| E4-08 | `isNoAgreement` selector boolean (v3.1) replacing the `validityLabel` string discriminant | **SCHEDULE** — cosmetic type-safety cleanup in `ops-selectors`; bundle with the next `ops-selectors` touch (no standalone story needed) |
| E4-09 | Title-case contract-date formatter at occurrence two | **SCHEDULE (Rule-of-Two watch)** — do not extract yet; extract when a 3rd consumer appears (Core §5 discipline, same rule the initiative has followed throughout) |
| E4-10 | Sub-lane stacking UX (Rundown same-lane overlap renders occluded, pin 5) | **ACCEPT-WITH-OWNER** — documented v1 limitation (B-1 pin 5: deterministic paint order + tooltip keeps the occluded block discoverable); revisit as a designer/UX item only if real usage surfaces it as a complaint |
| E4-11 | Season label unwired | **CLOSED** — folded into the E-2-T3 designer-notes package and dispositioned there ("copy… season-label" → deferred to a dedicated designer session, does not block cutover) |
| E4-12 | Rights matrix recompute per events-socket update (flagged "check at E-1 SLO run") | E-1 measured `deriveRightsMatrix` at 0.63ms p95 (100 contracts) — cheap regardless of recompute frequency; no measured problem. **ACCEPT-WITH-OWNER** — no action; revisit only if socket-update frequency or contract volume rises materially |

---

## 4. EPIC C debt candidates

| # | Item (origin: EPIC C retro) | Disposition |
|---|---|---|
| E4-13 | Registry table row + row-click: clickable `<div>` with no keyboard a11y | **CLOSED** — fixed at E-2-T2 (`role`/`tabIndex`/`onKeyDown` added via the shared `getRowActivationProps`, Rule-of-Three extraction with ScheduleRow/Rundown-block) |
| E4-14 | `STATUS_COLOR` token→var map duplicated `RegistryScreen` + `RecordInspector` (Rule-of-Two watch) | **SCHEDULE (Rule-of-Two watch)** — do not extract yet (only 2 occurrences of *this specific* map); see E4-24 for the related Sync maps — extract when any one map hits its 3rd occurrence |
| E4-15 | 320px inspector chrome duplicated (`EventInspector` + `RecordInspector`) | **ACCEPT-WITH-OWNER** — this is an *already-made* decision (C retro: "Rule-of-Two watch, do NOT extract yet" — the two inspectors' behavior diverges enough that forcing a shared base now would be premature abstraction); no new decision needed |
| E4-16 | C-1-T0 registry list embed tests cover only the bare-array `findMany` branch; paginated branch untested | **ACCEPT-WITH-OWNER** — now effectively moot: E-1's GATE E-1-A was resolved via **client-side row windowing** (architect choice A+C), not server pagination, so the untested paginated backend branch has no current consumer. Revisit only if a future architect decision moves to server pagination (§4 in the E-1 doc's option B, not chosen). |
| E4-17 | Create-modal cancel-during-submit still fires `onCreated` (POST already succeeded) | **ACCEPT-WITH-OWNER** — defensible as recorded (the write already happened server-side; suppressing the callback would just delay the inevitable list refresh) |
| E4-18 | 7 designer notes: `--registry-*` STATUS token family · channel color vars (Ketnet/VRT MAX Sport/Radio 1) · sport-icon/federation + per-kind create fields · provenance SOURCE-code-vs-full-name · copy (`MAX`/`NIGHTLY SYNC`/season-label) · `N PLAYERS` vs `12 PEOPLE` · `reasonCodes` + merge-confirm step | **CLOSED / DEFERRED** — already consolidated and dispositioned at E-2-T3: `N PLAYERS` is a resolved deliberate honesty deviation (no action); the other 6 are deferred as one designer sign-off package, explicitly stated to **not block cutover** |
| E4-19 | No sync-timestamp field on any list/record payload → design's `· LAST SYNC` provenance suffix not renderable | **CLOSED** — already an accepted, recorded honesty deviation (dropped the suffix rather than fake it), not an open item |

---

## 5. EPIC D debt candidates

| # | Item (origin: EPIC D retro) | Re-verification | Disposition |
|---|---|---|---|
| E4-20 | D-3-T0 409-guard block inline ×3 across the merge-decision routes (Rule of Three MET — `assertPending` helper candidate) | **Verified**: `mergeCandidates.ts:111-112, 179-180, 233-234` — the identical `if (candidate.status !== 'pending') return next(createError(409, ...))` block appears 3 times, unchanged. | **FIX-NOW** — Rule of Three is met, the extraction is pure/behavior-preserving (a `assertPending(candidate)` helper), and it's cheap; recommend as the first PREPARATORY commit alongside/before E-6-T1 (which already touches this file's neighborhood) |
| E4-21 | `ReviewTab` additive export existed purely for D-2-T0 characterization; "remove it with the legacy screen at the EPIC E cutover" | **Verified still present**: `src/pages/ImportView.tsx:472 export function ReviewTab()`. | **SCHEDULE (already the plan)** — this is precisely E-6-T1's AC-3/pin-2 scope ("debt-closing floor" even under COEXIST); no new decision needed, just execution |
| E4-22 | SYNC surfaces no `ignore` decision (legacy `ImportView` retains it) | Unchanged — `ignore` route exists in `mergeCandidates.ts` but SYNC v1 UI never calls it. | **SCHEDULE** — scope decision owned by ADR-016 (E-6-T0): whether `ignore` migrates to SYNC or stays ImportView-only under COEXIST |
| E4-23 | `dotColor` collapses `queued`+`running` → neutral (no not-started vs in-progress distinction) | Unchanged. | **ACCEPT-WITH-OWNER** — minor UX granularity loss, low interest; fold into the E-2-T3 designer-notes package if a designer ever flags it, otherwise no action |
| E4-24 | Merge DIFF compares only SPORT/COMPETITION/DATE/PARTICIPANTS (thin `Event` entity has no venue/country/status/home-away counterpart the CURRENT side can show) | Unchanged. | **SCHEDULE (post-cutover, conditional on ADR-016 scope)** — a richer CURRENT source needs either a broader `Event` read or a different data source; owned by whatever E-6-T0 decides about the ImportView/Sync reconciliation, not a standalone fix |
| E4-25 | SYNC tab badge populates only on the FIRST Sync visit (no shell-level pre-visit count fetch) | Unchanged. | **SCHEDULE** — small: `useSyncData`'s pending-count needs a shell-level (or App-level) prefetch instead of screen-mount-triggered; bundle with next `OpsShell`/`SyncScreen` touch |
| E4-26 | `statsJson.recordsProcessed` key assumed, not confirmed against a live job payload | Unchanged — no real-backend verification has occurred anywhere in this initiative (A-5's own recorded trade-off). | **ACCEPT-WITH-OWNER** — same class of gap as the initiative-wide "live-backend smoke gap" (E4-06); confirm opportunistically the first time a real import job payload is available, e.g. at cutover verification |
| E4-27 | `DOT_COLOR`/`BAND_COLOR` (`SyncScreen`) vs `STATUS_COLOR` (`RegistryScreen`/`RecordInspector`) — three independent per-screen color-token→var maps | **Verified**: `STATUS_COLOR`/`DOT_COLOR`/`BAND_COLOR` all present, one map per screen family (`RegistryScreen.tsx`, `SyncScreen.tsx`, `RightsScreen.tsx` all define local color maps). | **SCHEDULE (Rule-of-Two/Three watch, same bucket as E4-14)** — these are 3 *different* maps (not 3 occurrences of the same map), so no single one has hit the Rule of Three yet; watch for the next screen that needs any one of these specific mappings before extracting |

---

## 6. E-1 (perf) residuals not yet in the debt register

E-1's headline gate (GATE E-1-A, pagination/virtualization) is **already resolved** — the
architect chose row-windowing + `React.memo` (option A+C), landed as a flag-gated FEATURE, and
re-measured (#5 median render 2732ms→1083ms, #7 p95 991ms→108-153ms). The items below are the
honest residuals E-1 itself flagged as *not* fully closed by that remediation.

| # | Item | Disposition |
|---|---|---|
| E4-28 | GATE E-1-B — theme-toggle (#2) not verifiable below the ~80ms Playwright-harness floor | **ACCEPT-WITH-OWNER (for E-4 purposes) / already an open E-1-raised gate** — E-1 itself frames this as needing either a tiny in-page `performance.now()` instrumentation (a production edit, deliberately out of E-1's VERIFICATION hat) or accepting the toggle as visually-instant and de-scoping the p99 SLO to a coarser budget. E-4 does not re-decide this (it is E-1's own gate, not one of E-4's three) — flagging here only so it isn't lost; recommend bundling the decision with the E-4 gates below when the architect next convenes. |
| E4-29 | #4 Rights DOM-at-scale — derivation measured (0.63ms, PASS) but the full 100-contract DOM render was never independently Playwright-measured (inferred safe by row-count interpolation vs the 500-row Schedule PASS) | **ACCEPT-WITH-OWNER** — inference is reasonable (100-200 rows « the 500-row case that passed at 1.16s p95); a scaled Rights Playwright run would close the gap cheaply if ever wanted, but nothing indicates risk |
| E4-30 | N=15 p95 "single-worst-of-15" estimator swung 1395–4313ms across runs (registry cold-boot p95, item #5) | **SCHEDULE** — methodology fix only (increase sample count and/or use a proper percentile function instead of a worst-of-N proxy); no production code involved, cheap to do whenever E-1's numbers are next revisited (e.g. at E-6-T0 evidence-gathering) |
| E4-31 | Bare-array unbounded fetch — `useSyncData` (jobs + candidates) has no pagination; `useRegistryData`'s ceiling is now addressed client-side (windowing) but Sync's is not | **ACCEPT-WITH-OWNER** — E-1 found no near-term pressure (sync derivation stays « budget to 20,000 candidates, and volumes are server-bounded to pending-only); revisit only if a source ever floods the pending queue |

---

## 7. E-2 (a11y) residuals

E-2 is **fully closed** — audit (T1) → remediation (T2: Registry keyboard fix + Rundown
focus-suppression fix + shared `getRowActivationProps` extraction) → contrast fix + designer-note
consolidation (T3). Recorded here only for completeness of the "no invisible debt" enumeration;
no open items remain from E-2 itself beyond the designer-notes package already folded into E4-18
above (deferred, does not block cutover).

| # | Item | Disposition |
|---|---|---|
| E4-32 | Contrast FAILs — `--alert-danger`/`--alert-negotiation` on `--bg-shell`, light theme, 4.49/4.48 vs 4.5:1 | **CLOSED** — fixed (single-channel −4/−5 darkening, now 4.63/4.61, both AA) |
| E4-33 | Rundown block focus-visibility bug (unconditional `outline-style: none` suppressing the UA default ring) | **CLOSED** — fixed at E-2-T2 |
| E4-34 | *(new, found during this pass — not previously recorded anywhere)* `RegistryCreateModal`'s dialog has no `onKeyDown` for Escape and no focus-trap/initial-focus management beyond the NAME field's `autoFocus` | The a11y audit (§2.1) explicitly noted this as "not scored… outside the clickable-div scope" but did not carry it to a disposition. **SCHEDULE** — small, good-practice a11y polish (Escape-to-close, focus return on close); not a scored WCAG failure in the audit's own scoping, low priority; bundle with any future `RegistryCreateModal` touch |

---

## 8. E-3 (security) residuals — the two items this task's brief called out by name

E-3-T1 (STRIDE review) found 3 residual findings (F-1/F-2/F-3) plus the RBAC-parity gate.
E-3-T2 (already executed today) **closed the RBAC gate and F-1**, but **F-2 and F-3 were left
open** — the E-3-T2 resolution section explicitly lists only 4 dispositions (merge-route
tightening, UI-stays-authenticated-only acceptance, per-tab-hiding deferral, F-1 fix) and does not
mention F-2 or F-3 at all.

| # | Item | Disposition |
|---|---|---|
| E4-35 | RBAC parity gate (`/ops/*` authenticated-only vs legacy `RequireRole` peers; headline finding: `sports` could reach an irreversible merge decision the legacy `/import` route denied) | **CLOSED** — E-3-T2 tightened the real backend boundary (`mergeCandidates.ts` write routes now `authorize('planner','admin')`, dropping `sports`, matching legacy `ImportView`'s `['admin','planner']`), pinned by a new authz test that exercises the real `authorize` middleware. Front-end stays authenticated-only by explicit architect acceptance (backend is the authoritative boundary). |
| E4-36 | F-1 — merge-target lookup had no app-level `tenantId` scope (cross-tenant overwrite risk, RLS-dependent) | **CLOSED** — fixed as defence-in-depth independent of the RLS track: `updateImportedEvent` now accepts an optional `tenantId` and `manualMergeNormalizedEvent` threads it; pinned by `tests/mergeCandidates-tenant-scope.test.ts` |
| E4-37 | **F-2 — no actor attribution on registry create** (none of the 4 create routes records `createdBy`; no `/api/audit` emission — contrast the merge path's `reviewedBy`/`reviewedAt`) | **FIX-NOW** — cheap, mirrors an existing pattern already in the codebase (the merge-decision routes' `reviewedBy = user.email \|\| user.id`), closes a real Repudiation gap STRIDE flagged as un-mitigated (not merely cosmetic), no schema risk expected (likely just a new column or reuse of an existing audit hook). Recommend as the next backend task, e.g. bundled with E4-20/E4-38 as a small backend-hardening batch before the E-6 cutover, or immediately if the architect wants it ahead of E-6. |
| E4-38 | **F-3 — competition create missing sport-ownership check** (`competitions.ts` create sets `sportId` with no tenant-ownership re-check, unlike teams/players which already guard "Unknown sport") | **FIX-NOW** — same class as F-2: cheap, mirrors the existing teams/players guard exactly (`prisma.sport.findFirst({ where: { id: sportId, tenantId } })`), closes a cross-tenant FK integrity gap, admin-only today so severity is low but the fix is nearly free. Recommend bundling with E4-37. |

---

## 9. THREE ARCHITECT GATES (E-4 cannot dispose these — architect decides)

### Gate A — TD-27: runtime override for `opsRedesign`, or accept redeploy-rollback

- **Status:** OPEN. `src/flags.ts` is unchanged — build-time Vite env only, no runtime path.
- **Options:**
  1. **Add a runtime override** (e.g. a tiny settings-service lookup, a signed query param, or a
     DB-backed flag row checked once at boot) so rollback = flip a value, no redeploy. Cost:
     M — needs a flag-source decision, a fetch/seam in `flags.ts`, and a test for the override
     path; touches the one place every future flag will copy, so gets the convention right for
     free going forward.
  2. **Accept build-time-only, state it honestly.** Cost: ~0 (already done — the runbook and
     TD-27 entry already say "rollback = redeploy"). Risk: any *future* rollback under incident
     pressure takes a full build+deploy cycle, not a config flip.
- **Recommendation:** given `opsRedesign` is still OFF in prod and E-6 is the only remaining
  epic, a minimal runtime override (option 1, scoped small — e.g. read an env-served JSON config
  fetched once at app boot, falling back to the build-time env if absent) is worth doing **before**
  the E-6 cutover flips the default, specifically because cutover is the moment rollback speed
  matters most. If the architect judges the redeploy cadence fast enough (e.g. CI/CD is already
  sub-5-minutes), accepting redeploy-rollback and shipping honestly is a legitimate, cheaper
  choice. **Architect decides.**

### Gate B — ADR-014 amendment: carry `?day`/`?event`/`?record` across tab switches

- **Status:** OPEN. Verified: `OpsShell.tsx`'s tab navigation contains no logic that reads or
  forwards the current `day`/`event`/`record` search params onto the next tab's `NavLink` — cross-
  screen selection today works only via an explicit deep link (e.g. pasting `?event=3` after
  switching tabs), not by carrying state across a tab click, exactly as the EPIC B retro recorded.
- **Options:**
  1. **Amend ADR-014** so tab `NavLink`s forward the currently-relevant params (day for
     schedule/rundown, event for schedule/rundown, record for registry) when switching tabs, where
     the target tab has a meaningful use for them. Cost: S — a `useOpsSelection`/`useOpsDay`-level
     change to how `OPS_TABS` links are constructed; no new state model, just param-carrying.
  2. **Leave deep-link-only.** Cost: 0. UX cost: a planner who selects an event on Schedule and
     switches to Rundown loses that selection and must re-select or re-paste a URL.
- **Recommendation:** this is a small, low-risk, high-value UX fix relative to its cost (S) — the
  mechanism (URL-backed selection) already exists and is well-tested; extending it to survive a
  tab switch does not touch selectors, derivation, or write paths. Recommend accepting the
  amendment. **Architect decides.**

### Gate C — backend `broadcastSlots.ts` inclusive-`lte` day-window fix

- **Status:** OPEN. Verified: `backend/src/routes/broadcastSlots.ts:32` still reads
  `if (dateEnd) plannedStartUtc.lte = dateEnd` — a midnight-UTC slot is returned for **both**
  adjacent days under a `[dateStart, dateEnd]` query. The ops e2e harness deliberately models a
  half-open window and documents the divergence (EPIC B retro); this is a live behavior gap
  between the harness and the real backend, not merely a documentation note.
- **Options:**
  1. **Change to a half-open window** (`plannedStartUtc.gte = dateStart, plannedStartUtc.lt =
     dateEnd`, i.e. exclusive end) matching the e2e harness's existing model. Cost: S — one-line
     backend change + a re-baseline of any consumer that (knowingly or not) relies on the current
     inclusive behavior; needs a check for other callers of this endpoint (the legacy
     `PlannerView`/`ScheduleView` may also hit this route).
  2. **Leave as-is, document the two-day-return behavior as intended** (e.g. if some caller
     actually wants an inclusive day boundary). Cost: 0, but leaves a suspected bug live and the
     e2e/production divergence unresolved.
- **Recommendation:** this reads as a straightforward off-by-one-day bug, not an intentional
  design choice — no caller appears to want the same slot attributed to two calendar days.
  Recommend fixing to half-open, gated on a quick grep for other consumers of
  `GET /broadcast-slots` before the change ships (to catch any accidental reliance on the current
  behavior). **Architect decides.**

---

## 10. Summary

**38 items enumerated** across the four EPIC retros' accrued debt lists, the pre-existing
TD-23..27 register entries, and the E-1/E-2/E-3 verification docs' residual findings.

- **CLOSED (already resolved, no action needed): 13** — TD-26; E4-01, E4-02 (EPIC A); E4-11
  (EPIC B); E4-13, E4-18 (partial — 6 of 7 designer notes deferred, 1 already resolved), E4-19
  (EPIC C); E4-32, E4-33 (E-2); E4-35, E4-36 (E-3); plus TD-24/TD-25's *guards* verified holding
  (the TDs themselves aren't closed, only re-confirmed enforced — counted separately below).
- **FIX-NOW: 4** — E4-20 (`assertPending` extraction, Rule of Three met), E4-37 (registry-create
  actor attribution), E4-38 (competition sport-ownership check) — all cheap, low-risk, close real
  STRIDE/Rule-of-Three findings; recommended as the next small batch of work (before or alongside
  E-6-T1).
- **SCHEDULE (named follow-up, mostly bundled with E-6-T1 or "next touch"): 14** — E4-03, E4-05
  (EPIC A); E4-08, E4-09 (EPIC B); E4-14 (Rule-of-Two watch); E4-21, E4-22, E4-24, E4-25, E4-27
  (EPIC D); E4-30 (perf methodology); E4-34 (a11y polish, newly found); TD-24 removal (folded into
  E-6 scope).
- **ACCEPT-WITH-OWNER / DECIDED-ELSEWHERE: 14** — TD-23, TD-25 (guards accepted, no owner-side
  action); E4-04, E4-06, E4-07 (EPIC A); E4-10, E4-12 (EPIC B); E4-15, E4-16, E4-17 (EPIC C);
  E4-23, E4-26 (EPIC D); E4-28, E4-29, E4-31 (E-1 residuals).
- **THE THREE ARCHITECT GATES (§9)** — TD-27 runtime-flag, ADR-014 tab-param-carry, backend
  `broadcastSlots.ts` `lte` — each framed with options + a recommendation above; none decided here.

**No HIGH-severity item was left without a servicing decision.** The two highest-severity
residuals surfaced by this pass — E4-37 (repudiation gap on registry create) and E4-38
(cross-tenant FK integrity gap on competition create) — both got FIX-NOW, not merely accepted,
consistent with the "bugs get fixed, not accepted" rule the D-2 `9500% match` precedent set.

**New debt found during this enumeration (not previously recorded in any retro):** one item,
E4-34 (`RegistryCreateModal` dialog missing Escape-to-close + focus-trap/return-focus), noted by
the a11y audit itself but never carried to a disposition until now.

---

## 11. Post-fix update (2026-07-10) — E-4 execution + gate decisions

This doc enumerated dispositions; the E-4 execution then **actioned** them. Status now:

- **FIX-NOW — ALL DONE:** E4-20 `assertPending`→`decidedGuardError` extraction (`50096b1`);
  E4-37 registry-create actor attribution via audit-emit (no `createdBy` column existed → the
  4 create routes now `writeAuditLog`, `cfc2c1a`); E4-38 competition sport-ownership check
  (`cfc2c1a`). All backend, TDD, green.
- **THE THREE ARCHITECT GATES — ALL DECIDED:** TD-27 → **accept redeploy-rollback** (no runtime
  override; `docs/runbooks/ops-shell.md` §rollout, `.env.production` flag flip `99520c7`);
  ADR-014 tab-param-carry → **done** (OpsShell NavLinks carry `?day/?event/?record`, `4cea569`);
  backend `broadcastSlots` `lte`→`lt` → **done** (half-open day window, caller verified, `cfc2c1a`).
- **E-4-34** (RegistryCreateModal Escape/focus-trap) → **done** (`4cea569`).
- **Still open (correctly deferred — these are the "leave for evaluation" items):** the SCHEDULE
  bucket (14 items, mostly folded into the follow-on ImportView-reconciliation initiative +
  "next touch" polish), the 7→6 E-2 designer-sign-off notes, the perf methodology hardening
  (E4-30), and F-2's optional per-column provenance MIGRATION (the audit-emit covers "who/when";
  a schema column is a separate story only if per-column provenance is wanted). None block ship.
- **Housekeeping:** merging these entries into `docs/governance/debt-register.md` still waits on
  that file's parallel-session lock to clear.

**Net:** the whole A–E Ops redesign is COMPLETE + merged to `main` + the prod flag flipped ON
(ADR-016 COEXIST). No in-scope debt left un-serviced.
