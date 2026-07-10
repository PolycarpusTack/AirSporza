# ADR-016: Ops old-screen deprecation / cutover

**Status:** PROPOSED (architect decision pending)
**Date drafted:** 2026-07-10 · **Author:** E-6-T0 (VERIFICATION hat — this ADR frames the
decision with verified tradeoffs; it does NOT make it). **Deciders:** Architect / Product.
**Supersedes stance in:** ADR-012 (the "legacy untouched, cutover deferred to EPIC E"
position this ADR revisits). **Inputs:** E-1 `docs/ops-perf-verification.md`, E-2
`docs/ops-a11y-audit.md`, E-3 `docs/ops-security-review.md`, E-4 `debt-register.md`,
E-5 `docs/runbooks/ops-shell.md`.

---

## Context

ADR-012 shipped the Ops redesign as a parallel feature-flagged shell at `/ops/*`
(`VITE_OPS_REDESIGN`, build-time, default OFF — `src/flags.ts`), leaving the five legacy
screens untouched. All of EPIC A–D is now merged to `main` (still flag-OFF). ADR-012
explicitly deferred the deprecation/cutover decision to EPIC E, "informed by real usage of
the flagged shell." This is that decision.

The five ops screens each overlap a legacy peer, but ADR-012 was explicit that the ops layer
is a **browsing/monitoring surface, not a full replacement** — "existing editing surfaces
(contract forms, tech-plan editor, crew assignment) remain the system of record for
mutations; ops surfaces link to them." That scoping is the single most important fact for
this decision: **the ops screens were never built to fully replace their legacy peers.** The
overlap is partial by design, and the size of the un-migrated remainder differs enormously
by screen (near-parity for Registry; a small fraction for Sync).

### Verified feature-overlap matrix (ops screen vs legacy peer — the reconciliation scope)

Verified against source (`src/pages/ops/*`, `src/components/ops/*`, and the five legacy
`src/pages/*View.tsx`). The "legacy-only capability" column is the cutover reconciliation
scope — what a REPLACE must migrate, redirect, or consciously drop.

| Ops screen | Legacy peer | Ops covers | **Legacy-only (reconciliation scope)** | Gap size |
|---|---|---|---|---|
| SCHEDULE (`ScheduleScreen`) | `ScheduleView` | read/browse day list of events (BroadcastSlot-derived) | The **entire broadcast-slot editor**: `SlotEditorPanel`, drag-reschedule (`useSlotDrag`), slot context menu, switch-confirm, **CascadeDashboard**, **VersionHistoryPanel**, channel management. All mutation. | **Large** |
| PLANNER / Rundown (`RundownScreen`) | `PlannerView` | read-only day timeline (browse) | Draw-to-create, multi-day create, event-click → `DynamicEventForm` edit. All event mutation. | **Large** |
| RIGHTS (`RightsScreen`) | `ContractsView` | read-only rights matrix (E-2 confirmed: matrix rows are non-interactive) | `ContractForm` create/edit, `RightsMatrixPanel`, role-gated fee visibility. All contract CRUD. | **Large** |
| REGISTRY (`RegistryScreen`) | `TeamsView` | virtualized browse + record inspector + **create modal (C-4, admin-only)** + protected-notes/remarks editor (C-5) + linked-record hops | Full team/player field editing, **roster/membership management**, the `overview/roster/remarks/sources` drawer, logo/crest edit, player detail. (Memory: teams/players still owes "athlete grid + player detail drawer".) | **Medium** (closest to parity) |
| SYNC (`SyncScreen`) | `ImportView` | read-only **job health** cards + **merge review** (approve→`approve-merge`, keep→`create-new`) | **See below — the headline gap.** | **Very large** |

### The ImportView reconciliation — the crux of this ADR

`src/pages/ImportView.tsx` is a **six-tab** operator console. `SyncScreen` (D-1..D-3) surfaced
roughly **1.5 of those six tabs**, and even those partially. Verified tab-by-tab:

| ImportView tab | In SYNC? | What SYNC dropped |
|---|---|---|
| **Sources** | ✗ | Source enable/disable toggle, priority, per-minute/per-day rate-limit config, credentials status, missing-server-config (env var) surfacing. A **write surface** (`updateSource`). |
| **Jobs** | ~ partial | SYNC shows **read-only** job-health cards. ImportView owns **+Run Job** (`createJob`), **Cancel** (`cancelJob`), **Retry** (`retryJob`), and the expandable per-job stats/error-log/cursor detail. |
| **Review** | ~ partial | SYNC has approve-merge + create-new. ImportView's Review tab **also has the `ignore` decision** (`ignoreMergeCandidate`) — **SYNC has no `ignore`** (verified: `SyncScreen` only fires `approveMergeCandidate` / `createMergeCandidateEntity`). |
| **Dead Letters** | ✗ | List of unresolved dead letters + **Replay** (`replayDeadLetter`). Absent from SYNC entirely. |
| **Aliases** | ✗ | team/competition/venue alias **CRUD** (`listAliases`/`createAlias`/`deleteAlias`). Absent from SYNC. |
| **Provenance** | ✗ | Field-provenance inspector ("which source last wrote each field"). Absent from SYNC. |
| Metrics header | ✗ | 6 KPI tiles (active sources, completed 24h, pending review, dead letters, link coverage, dead-letter rate). SYNC has none. |

**Bottom line:** four whole tabs (**sources, dead-letters, aliases, provenance**), two decision
actions inside jobs/review (**job create/cancel/retry**, the **`ignore`** merge decision), and
the metrics header are legacy-ImportView-only. This is a genuine operator-console gap, not a
cosmetic one. **SYNC cannot replace ImportView today**, and this is the fact that most
constrains a "REPLACE everything now" option.

### The ReviewTab scaffold (D-2-T0) — retire regardless of the cutover decision

D-2-T0 needed to characterize the legacy merge-confidence render before extracting the shared
selector, so it made the previously-private review tab a **public export**:
`export function ReviewTab()` at `src/pages/ImportView.tsx:472`, pinned by
`src/pages/ImportView.reviewtab.test.tsx`. That test confirms ImportView already consumes the
**shared** `mergeConfidencePercent` selector (`ImportView.tsx:17`) — it fixed a real latent
bug (legacy inline `* 100` rendered `9500%` for a 95-confidence candidate). The export exists
**only** for the characterization test; it is temporary scaffolding to be removed. Its removal
is in scope for E-6-T1 under **either** option below (it is the debt-closing floor — E-4 pin 4,
E-6 pin 2).

### Readiness evidence (is ops fit to be canonical?)

- **Performance (E-1):** all 9 SLOs measured. Every *derivation* selector is cheap (< 25ms).
  The only two FAILs (registry initial render #5, inspector hop #7 at 2,000 records) were
  **remediated at the root** (row windowing + `React.memo` + stable callback, flag-gated, no
  backend change): #7 ~8× faster, #5 median 2732→1083ms. Residual tail is cold-boot/harness-floor
  artifact, not table DOM. Registry is the only screen with a near-term client ceiling
  (< 2,000 rows at SLO before the fix; virtualized now). Sync/schedule/rights derivations have
  large headroom. **Net: no open perf blocker to ops being canonical** (one marginal cold-boot
  p95 tail on registry, now fetch/boot-bound).
- **Accessibility (E-2):** audited + **remediated**. Registry-row keyboard operability added,
  Rundown focus-visibility bug fixed, shared `getRowActivationProps` extracted, and both
  light-theme contrast FAILs nudged to real AA (`--alert-danger`/`--alert-negotiation`). Seven
  designer-polish notes DEFERRED (none block cutover). **Net: a11y-clear.**
- **Security / RBAC (E-3):** STRIDE re-check passed; the one live over-permission (`sports`
  reaching an irreversible merge) was **closed at the real backend boundary** (`authorize` on
  the merge write routes tightened to `['planner','admin']`, matching legacy `/import`).
  Architect ruling: **the backend `authorize()` is the authoritative boundary; `/ops/*` stays
  authenticated-only**, no UI `RequireRole` added; F-1 cross-tenant merge-target gap fixed as
  defence-in-depth. **Net: RBAC posture is documented and at data-parity.**

---

## Decision drivers

1. **Product direction:** does the org commit to the ops language as the primary UI now, or run
   both indefinitely? (Not an engineering pick — blast radius + user retraining.)
2. **The ImportView gap is real and large.** Four tabs + `ignore` + job actions have no ops
   home. Any REPLACE must migrate them, keep a slimmed ImportView for them, or consciously drop
   them (and accept the operational loss).
3. **Ops was scoped as monitoring, not full replacement (ADR-012).** SCHEDULE/PLANNER/RIGHTS
   deliberately delegate all mutation to the legacy editors. A blanket REPLACE that removes
   those editors would delete the *only* create/edit path for events, contracts, and broadcast
   slots — a non-starter until those editing surfaces are rebuilt in ops (out of this
   initiative's scope).
4. **Rollback is redeploy-only (TD-27).** `VITE_OPS_REDESIGN` is build-time; flipping the
   default ON and rolling back both require a redeploy. There is no runtime kill-switch (unless
   E-4 gate-5 created one). This raises the cost of a bad flip.
5. **Debt hygiene:** the ReviewTab scaffold must be retired regardless; the decision only
   changes whether it is retired *by deletion* (REPLACE removes ImportView) or *by
   de-exporting* (COEXIST keeps ImportView).
6. **Verification is green.** Perf/a11y/security evidence says the ops screens that DO exist are
   fit to be canonical *for what they cover*. The blocker is coverage breadth, not quality.

---

## Option A — REPLACE (flip default ON, deprecate the 5 legacy screens + routes)

Flip `VITE_OPS_REDESIGN` default ON, deprecate and eventually remove `ScheduleView`,
`PlannerView`, `ContractsView`, `TeamsView`, `ImportView` and their routes/guards in `App.tsx`,
retire the `ReviewTab` export, and perform the **full ImportView reconciliation** for the four
dropped tabs + `ignore` + job actions.

**Pros**
- One canonical UI; no dual-maintenance; the ops design language becomes the product.
- Forces the ImportView gap to be closed properly (sources/dead-letters/aliases/provenance/
  `ignore`/job actions migrate into SYNC or a decided home) rather than lingering.
- Retires the most legacy code; the redesign's investment is fully realised.

**Cons / blast radius**
- **The editing surfaces have no ops replacement.** Removing `ScheduleView` (slot editor,
  cascade, version history), `PlannerView` (event create/edit), and `ContractsView`
  (`ContractForm`) deletes the *only* mutation paths for those domains. A REPLACE that removes
  these routes is **not viable** without first rebuilding those editors in ops — explicitly out
  of this initiative's scope (ADR-012). So a true "remove all five" REPLACE is **blocked** on
  large unbuilt work.
- **ImportView reconciliation is a large FEATURE effort** (four tabs + two decision actions +
  metrics), not a cutover tidy-up. Pulling it into E-6-T1 would blow the "one FEATURE task"
  boundary and the anti-scope-creep guardrail.
- Rollback = redeploy (TD-27); a regression after the flip is costly to reverse.
- Removing the legacy `RequireRole` UI gates on cutover removes UI-level role-hiding — E-3
  concluded the backend is authoritative so **no data-security is lost**, but lesser roles would
  now *see* ops surfaces they can only 403 on (a UX-confusion regression E-3-T2 deferred as
  polish).

**Migration steps (if chosen, necessarily staged / per-screen — not a big-bang):**
1. Flip the flag ON in a pilot build; keep legacy routes registered (coexisting) during bake.
2. **Per-screen** deprecation only where ops is at parity *including mutation*. Today that is
   **none of the five** at full parity (Registry is closest but lacks roster/membership edit).
3. Reconcile ImportView as its **own** feature effort before removing `/import` (migrate
   sources/dead-letters/aliases/provenance/`ignore`/job actions into SYNC, or a decided home).
4. Rebuild (or consciously defer) the Schedule/Planner/Contracts editing surfaces before
   removing those routes.
5. Retire the `ReviewTab` export by deletion when ImportView is removed.

## Option B — COEXIST (keep both behind the flag; gradual per-screen cutover)

Keep the flagged shell and the legacy screens both available. Ops is the monitoring/browse
layer; legacy remains the system of record for mutation and for the ImportView operator tabs.
Cut over **per-screen, only when that screen reaches true parity** (including its editing
surface), each cutover its own future decision.

**Pros**
- Matches reality: ops is a monitoring layer over still-essential legacy editors (ADR-012's
  original scoping, now empirically confirmed by the overlap matrix).
- **No forced ImportView rewrite.** `ignore`/dead-letters/sources/aliases/provenance stay in the
  working ImportView; SYNC remains the fast at-a-glance health+merge surface. No operator
  capability is lost.
- Lowest blast radius; rollback pressure minimal; no editing-surface gap.
- The ReviewTab scaffold is still retired (by de-exporting + pointing legacy at the shared
  selector) — debt closed without a migration.
- Per-screen cutover can proceed opportunistically as editing surfaces are ported, each on
  its own evidence.

**Cons**
- Dual UI indefinitely — two navigation models, ongoing (if light) dual-maintenance, potential
  user confusion about "which screen do I use."
- The redesign never becomes the sole product surface unless later work closes the editing gaps.
- Deferred decision: "coexist" can quietly become "forever two UIs" without a trigger.

---

## Recommendation (a PROPOSAL for the architect — not a decision)

**Lean: Option B (COEXIST), with a per-screen cutover roadmap and a hard commitment to retire
the ReviewTab scaffold now.** Reasoning, from the verified evidence:

- The ops screens are verified **fit for what they cover** (E-1/E-2/E-3 all green), but the
  overlap matrix shows they were **scoped as monitoring, not replacement** — and that scoping
  holds in code. Four of five ops screens delegate *all* mutation to legacy editors that have no
  ops equivalent. A REPLACE that removes those routes would delete the only create/edit paths
  for events, contracts, and broadcast slots. That work was never in this initiative.
- The **ImportView gap is decisive**: SYNC covers ~1.5 of six tabs. Removing `/import` today
  would drop source config, dead-letter replay, alias management, provenance inspection, the
  `ignore` decision, and job create/cancel/retry. That is an operator-console regression, not a
  tidy-up. Migrating it is a *feature epic*, not a cutover task.
- COEXIST is exactly ADR-012's stance, now **confirmed** rather than assumed — the flagged shell
  has proven itself as a fast monitoring layer, and the evidence supports **flipping the flag ON
  as the default browse experience** while keeping legacy reachable for mutation and the
  ImportView operator tabs. This gets the redesign in front of users at near-zero blast radius.
- Under COEXIST, **E-6-T1 shrinks to the debt-closing floor**: de-export `ReviewTab`, point the
  legacy review render at the shared `deriveMergeCard`/`mergeConfidencePercent`, delete the
  now-redundant characterization test. Full 13-spec e2e regression stays the gate.

If the architect wants ops to become the sole surface, the honest path is a **follow-on
initiative** that (a) ports the Schedule/Planner/Contracts editing surfaces into ops and (b)
reconciles ImportView into SYNC — then REPLACE per-screen as each reaches parity. That is a
new backlog, not the tail of this one.

---

## Consequences

**If B (recommended):**
- ADR-012's parallel-shell stance is *ratified and extended* (flag default may flip ON for the
  monitoring layer; legacy stays for mutation + ImportView tabs). This ADR becomes the standing
  reference for per-screen cutover criteria.
- E-6-T1 is the minimal scaffold-retirement (AC-alt in the backlog). No legacy behavior dropped;
  the ADR's "deprecation list" is empty/deferred.
- The ImportView reconciliation and the editing-surface ports are **re-parked with an owner** as
  a future initiative — recorded, not invisible (Core §5).
- Rollback story unchanged (redeploy; TD-27 stands unless gate-5 added a runtime override).

**If A (REPLACE):**
- ADR-012's "legacy untouched" stance ends; `App.tsx` legacy routes begin deprecation. But the
  editing-surface and ImportView gaps make a *complete* replace infeasible now — A necessarily
  degrades into "flag ON + a long per-screen migration backlog," which is B with a stated end
  goal. The architect should choose A only if committing to fund that migration.
- E-6-T1 cannot absorb the full ImportView reconciliation without breaking the one-FEATURE-task
  and anti-scope-creep boundaries; it would spawn a follow-on epic regardless.

**Either way:** the `ReviewTab` export (`ImportView.tsx:472`) and its characterization test are
retired in E-6-T1 (debt-closing floor); the E-3 backend RBAC boundary is a cutover precondition
(a cutover must not drop a legacy authorization — already satisfied, `sports` dropped from the
merge write routes).

---

## Open questions the architect must answer

1. **REPLACE vs COEXIST** — the headline. Given four of five ops screens have no editing surface
   and SYNC covers ~1.5 of ImportView's six tabs, is a full REPLACE even on the table now, or is
   the real choice "flip the flag ON for the monitoring layer (COEXIST) + a future migration
   initiative"?
2. **ImportView dropped-tabs reconciliation** (the crux). For **sources config, dead-letters +
   replay, aliases CRUD, provenance inspector, the `ignore` merge decision, and job
   create/cancel/retry** — do we: (a) migrate them into SYNC, (b) keep a slimmed ImportView that
   owns exactly these while SYNC owns health+merge, or (c) consciously drop any (which)? This
   decides whether `/import` can ever be removed.
3. **Flag default flip** — flip `VITE_OPS_REDESIGN` default ON now (ops as default browse layer,
   legacy still reachable), or keep OFF until per-screen parity? Note rollback = redeploy
   (TD-27) unless E-4 gate-5 added a runtime override.
4. **Editing surfaces** — Schedule (slot editor/cascade/version history), Planner (event
   create/edit), Contracts (`ContractForm`) have no ops equivalent. Is porting them in scope for
   any REPLACE, or does mutation stay in legacy indefinitely (permanent COEXIST for those three)?
5. **Registry** is closest to parity but still lacks roster/membership editing + player detail
   (memory: "athlete grid + player detail drawer" outstanding). Is Registry a candidate for
   *first* per-screen cutover, or does it wait on those?
6. **UI role-hiding on cutover** — E-3 kept `/ops/*` authenticated-only (backend authoritative).
   If legacy `RequireRole` gates are removed at cutover, lesser roles will *see* ops surfaces
   they can only 403 on. Accept as UX polish (E-3-T2 disposition 3), or add per-tab UI gating
   before flipping the default?
7. **Deprecation mechanics if REPLACE** — removed legacy routes should redirect (e.g. `/import`
   → `/ops/sync`) rather than 404. Confirm the redirect map and whether deep-links to legacy-only
   capabilities (a provenance query, a dead-letter) get a landing.

---

*This ADR was produced under the VERIFICATION hat: no production code was changed; only this
draft was created. The REPLACE/COEXIST decision, the ImportView reconciliation scope, and the
flag-flip criteria are the architect's to set — E-6-T1 implements exactly the accepted scope.*
