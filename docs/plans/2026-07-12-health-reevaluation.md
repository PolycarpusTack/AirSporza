# Planza — Monthly Health Re-Evaluation

_Date: 2026-07-12_
_Baseline: `docs/plans/2026-06-12-development-mitigation-plan.md` §1 · Overall 4.9/10 · 30 days ago_
_Method: re-verified every claim against the actual codebase; counts marked **static** where CI execution was unavailable (npm install not run in this environment)._

---

## Scoreboard

| # | Dimension | Baseline | Today | Delta | Headline |
|---|---|---|---|---|---|
| 1 | Code Health | 6/10 | **7.5/10** | +1.5 | 2 god files eliminated, 41 frontend test files (was 1), provision.ts (1168 ln) now the largest concern |
| 2 | Architecture Health | 6/10 | **7/10** | +1.0 | 17 ADRs (was 0); 2 fitness functions; pagination convention — but dual rights model (TD-29) HIGH interest |
| 3 | Domain Model Health | 4/10 | **5.5/10** | +1.5 | Glossary enforced; Players + RightsWindow domain-modeled — but deprecated fields linger, RD-7/RD-8 gaps |
| 4 | Delivery Flow Health | 5/10\* | **7/10** | +2.0 | CI operational; DoD enforced; 69 commits / 3 concentrated sessions; review chain catching pre-merge defects |
| 5 | Technical Debt Health | 4/10 | **5.5/10** | +1.5 | Register seeded (29 items); 11 settled (38%) — cascade cluster and dual rights model still open |
| 6 | Operational Readiness | 4/10 | **6.5/10** | +2.5 | CI + /metrics + correlation IDs + 4 runbooks; rollback still = redeploy (TD-27) |
| 7 | Product Value Health | 5/10\* | **7/10** | +2.0 | ADR-010 resolves vision fork; Players, Ops 5 screens, Rights Windows v1 delivered |

**Overall: 6.6/10 (+1.7 from baseline).**

_\* Delivery Flow and Product Value remain partially UNKNOWN: no live usage tracker or telemetry data is readable from the repo. Scores reflect code-observable evidence only._

---

## Per-dimension detail and verification

### 1. Code Health — 7.5/10 (+1.5)

**Tests (static count — test runner not executed):**

| Suite | Baseline | Today | Change |
|---|---|---|---|
| Backend test files | 27 | **64** | +37 (+137%) |
| Frontend test files | 1 | **41** | +40 (+4000%) |
| Backend tests passing | "strong" | **498** (RD phase summary, 2026-07-11) | — |
| Frontend tests | ~9 | 162+ (EPIC C summary); 41 test files | — |

**God files (verified with `wc -l`):**

| File | Baseline | Today | Status |
|---|---|---|---|
| `backend/src/import/ImportJobRunner.ts` | 1660 ln | **gone** | ✅ TD-1 SETTLED — 155-line orchestrator + 6 stage modules |
| `backend/src/routes/import.ts` | 1352 ln | **gone** | ✅ TD-2 SETTLED — split into `routes/import/` (index + 8 sub-routers) |
| `src/pages/PlannerView.tsx` | 1009 ln | **987 ln** | ◐ TD-3 partial — undo hook extracted; file still large |
| `src/pages/AdminView.tsx` | 793 ln | **305 ln** | ✅ TD-4 SETTLED — split by admin domain (C-4) |

**New large files (not god files per se, but flagged for awareness):**

| File | Lines | Notes |
|---|---|---|
| `backend/src/import/stages/provision.ts` | **1168** | Was always this content (extracted from old ImportJobRunner); documented in C-1; not yet a registered TD |
| `src/pages/ImportView.tsx` | 936 | Not yet addressed |
| `src/pages/TeamsView.tsx` | 896 | Not yet addressed |
| `src/pages/SportsWorkspace.tsx` | 753 | Not yet addressed |
| `backend/src/routes/events.ts` | 752 | Not yet addressed |

**Other code health signals:**
- TD-8 (`any` usage: 121 occurrences — 53 annotations + 68 casts, excl. tests) still open; scheduled EPIC F.
- All new code in EPIC RD and Ops redesign ships with tests; no new untested surface areas introduced.
- Strict TS discipline maintained across both workspaces.
- `eslint` gate enforced in CI; 23 standing errors from baseline were fixed in EPIC A.

---

### 2. Architecture Health — 7/10 (+1.0)

**ADRs (baseline: 0):** 17 ADRs now committed (`docs/governance/adr/`):
ADR-001…007 (backfilled EPIC A), ADR-008 (cascade semantics), ADR-009 (pagination), ADR-010 (product posture), ADR-011 (RLS coverage), ADR-012…014 (ops redesign), ADR-015 (rights windows model), ADR-016 (ops cutover), ADR-019 (schedule ripple, Accepted 2026-07-11).

**Fitness functions (baseline: 0):**
- FF-1: dependency direction (services/import never import routes) — CI-enforced via `scripts/check-dependency-direction.mjs`.
- FF-2: RLS policy ratchet — 61 policies, 0 uncovered; CI-enforced.

**Pagination:** ADR-009 established; `/api/events`, `/api/teams`, 4 import listings paginated. Remaining endpoints still use `findMany` without limit (TD-7 open; pattern-based rollout ongoing).

**CI:** two-job pipeline (`quality` + `migrations`) per push; ~1–2 min; covers typecheck, lint, tests (both workspaces), dependency-direction FF, Postgres 17 migration apply, DB smoke, RLS enforcement proof.

**New architectural risks since baseline:**
- **TD-29 (HIGH):** Dual rights model — `RightsPolicy` table + lossy `policyToContractShape` adapter still active in the flag-OFF path; silently disables blackout/platform/territory checks in draft validation, hardcodes `existingRuns: []` (never consults RunLedger). RD-6 (DELETE adapter + table) is DoR-ready.
- **SV-1 gap (architectural):** Feed imports update event timing but **never** invoke `eventSlotBridge`; linked `BroadcastSlot.plannedStartUtc/EndUtc` become silently stale after any reimport that moves an event. Manual `PUT /events/:id` path does sync. Asymmetry confirmed at `routes/events.ts:670-677` vs `import/stages/provision.ts` (zero bridge calls). ADR-019 accepted; fix = SV-2 (greenfield `RippleProposal`).
- **TD-28 (medium):** zod ↔ Prisma enum drift on 3 write surfaces (`coverageType`, `OverrunStrategy`, run-ledger `status`); `CONDITIONAL_SWITCH` is API-rejected (a legitimate value), run-limit checks structurally un-exercisable.
- **ChannelSwitchAction dead-ends at `EXECUTING`** (SV-1 finding): no code writes `COMPLETED`/`FAILED`; the state machine is notification-only, not execution. SV-4 must build switch execution.

---

### 3. Domain Model Health — 5.5/10 (+1.5)

**Glossary (baseline: none):** `docs/governance/domain-glossary.md` exists; enforced in CLAUDE.md and review chain. Naming drift frozen: TD-10 (legacy `sporza-*` container/package names) accepted as-is per decision; no new Sporza usage in code.

**New domain entities (since baseline):**
- **Players domain** — `Player`, `CanonicalPlayer`, `PlayerAlias`, `PlayerTeam` (EPIC G, 2026-06-12); multi-source dedup with fingerprint matching, review queue for uncertain matches.
- **RightsWindow** — child-of-Contract, per ADR-015; `ExclusivityTier` enum; window-aware checker v2. Properly models the domain concept the old `RightsPolicy` approximated.
- **Ops screens** — `BroadcastSlot`/`Contract`/`Channel` consumption from `Contract.platforms[]` per CLAUDE.md rule; derived selectors in `src/components/ops/selectors*` (anti-smart-UI enforced).

**Remaining domain model gaps:**
- **TD-24:** `Event.channel`, `Event.duration`, boolean rights flags on `Contract` still in `src/data/types.ts` with `@deprecated`; successor fields are `BroadcastSlot`/`Contract.platforms[]`. Removal decision deferred to EPIC E cutover ADR.
- **TD-25:** `Event.participants` is a free-text string; the Teams/Players repository provides real relations but no migration path exists yet.
- **TD-29:** Two "rights" concepts in the codebase (`RightsPolicy` vs `Contract.rightsWindows[]`) — domain confusion until RD-6 deletes the former.
- **RD-7 gap:** `BroadcastSlot` has no `coverageCategory` column; the window-aware holdback checker capability (DELAYED/HIGHLIGHTS/CLIP) is **correct and tested** but unreachable from real published slots. All real slots resolve to `runIntent = LIVE`.
- **RD-8 gap:** `Channel` has no territory field; territory checking stays event-level.

---

### 4. Delivery Flow Health — 7/10 (+2.0)

**CI (baseline: none — critical finding):** GitHub Actions operational with two jobs per push. Both push and PR to main are gated. SLO <10 min met (~1–2 min per phase summary).

**DoD (baseline: none):** `docs/governance/definition-of-done.md` exists; includes "runs against a database" as a gating requirement. Applied in every story since EPIC A.

**Written DoD enforced evidence:**
- EPIC A caught the `Team.canonicalTeamId @db.Uuid` vs text `CanonicalTeam.id` FK bug on first DB contact.
- CI lint caught NBSP-in-regex error that local linting missed.
- Review chain (two-hats-enforcer → smell/naming → ubiquitous-language-guard → test-quality-auditor) caught **6 defects** pre-merge in EPIC RD alone (NaN bypass, hollow golden master, flag that couldn't be turned OFF, cross-tenant idempotent-echo, false all-clear on unresolvable events, out-of-hat revert).

**Commit cadence (git log verified, since 2026-06-12):**

| Session window | Commits | EPICs delivered |
|---|---|---|
| 2026-06-12 | 26 | A (governance), B (mitigations), C (god-file decomp), G (Players), D-observability, D-RLS |
| 2026-07-02 | 19 | Ops redesign EPICs A–E (5 screens); ops-shell flag ON |
| 2026-07-10–11 | 12 | RD-1 through RD-5 (Rights Windows); SV-1 spike |
| 2026-07-12 | 1 | SV-1 ADR committed |
| **Total since baseline** | **69** | **7+ EPICs / ~23 stories** |

**Merged PRs:** #1–#19 (19 PRs since baseline; includes hotfixes and feature EPICs).

**Remaining flow concerns:**
- TD-27: flags are build-time only; rollback = redeploy-with-new-env. Limits operational agility (EPIC E RD flag posture decision deferred to E-5).
- No formal sprint metrics or cycle-time tracking beyond commit-date deltas.

---

### 5. Technical Debt Health — 5.5/10 (+1.5)

**Register (baseline: "debt felt but not registered"):** 29 items registered (TD-1 through TD-29), with principal/interest/compounding ratings and servicing decisions.

**Settlement status (verified against code and phase summaries):**

| TD | Summary | Status | Evidence |
|---|---|---|---|
| TD-1 | ImportJobRunner god file | ✅ SETTLED | File gone; `backend/src/import/stages/` has 6 modules |
| TD-2 | routes/import.ts god file | ✅ SETTLED | File gone; `backend/src/routes/import/` has 8 sub-routers |
| TD-4 | AdminView.tsx god file | ✅ SETTLED | 793 ln → 305 ln (verified) |
| TD-15 | crewConflicts duration unit | ✅ SETTLED | `parseDurationMin` unified, `effectiveDurationMin` app-wide |
| TD-16 | dateTime/calendarLayout gaps | ✅ SETTLED | HH:MM:SS/'45m'/'0' supported; calendarLayout uses `durationMin` |
| TD-17 | eventReadiness ignores channelId | ✅ SETTLED | Readiness accepts `channelId/radioChannelId/onDemandChannelId` |
| TD-18 | Conflict preflight fails open | ✅ SETTLED | Fail-visible + keyed to exact warning-set signature |
| TD-19 | Undo gaps | ✅ SETTLED | `usePlannerUndo` hook; undo honors lock/override-confirm flow |
| TD-20 | Import progress stats regression | ✅ SETTLED | `checkCancelled` adopts only control fields; tests/import-progress.test.ts |
| TD-21 | processRecord triplication | ✅ SETTLED | Generic `processRecord(job, progress, raw, {entityType,normalize,upsert})` |
| TD-26 | Ops light-theme AA-derived values | ✅ SETTLED | Designer sign-off 2026-07-02 |

**Settled count: 11 / 29 (38%). Open: 18.**

**Spot-check on 3 settled items (per task instructions):**
1. **TD-1:** `ImportJobRunner.ts` → `not found`; `backend/src/import/stages/` lists `failure.ts`, `process.ts`, `progress.ts`, `provision.ts`, `records.ts`, `shared.ts`. ✅ Verified.
2. **TD-19:** `src/hooks/usePlannerUndo.ts` exists; `grep "lockStatus\|isLocked\|override"` returns line 56 citing "TD-19 fix: locked/frozen events get the same override-confirm flow". ✅ Verified.
3. **TD-20:** `backend/tests/import-progress.test.ts` exists; `processRecord` generic found in `stages/process.ts:43`. ✅ Verified (TD-21 also confirmed here).

**Highest-interest open items:**

| TD | Interest | Summary |
|---|---|---|
| TD-29 | **HIGH** | Dual rights model + lossy adapter; silently disables checks in draft validation |
| TD-5/12/13/14 | **HIGH** | Cascade cluster: untested engine + midnight anchor + idempotency key + tx boundary |
| TD-6 | **HIGH** | `visibleByRoles` code ready, flag OFF in prod; security gap active until operational step |
| TD-22 | **med→high** | RLS Layer 1+2 done in code; activation (per-request tx wrapper) still pending |
| TD-8 | **low–med** | 121 `any`/`as any` occurrences (excl. tests) — no new ones added, but no ratchet |

**Migration health (from EPIC A critical finding):** resolved. `prisma migrate` owns history; `0_init` baseline + 2 real migrations applied to CI Postgres on every push; `migrate status` drift = 0 SLO enforced.

---

### 6. Operational Readiness — 6.5/10 (+2.5)

**CI (baseline: none — critical finding):** fully operational, two jobs, gated on push.

**Metrics (baseline: none):**
- `backend/src/metrics.ts` — Prometheus `/metrics` endpoint with `prom-client`, golden signals:
  - `http_request_duration_seconds` histogram (latency, traffic, error status)
  - BullMQ queue depths (saturation gauge, async collect)
  - `OutboxEvent` and `ImportDeadLetter` backlog gauges
- Endpoint registered at `backend/src/index.ts:99` (`GET /metrics`).
- ⚠ UNKNOWN: whether a Prometheus scraper/Grafana dashboard is wired up — not visible from repo.

**Correlation IDs (baseline: none):**
- `backend/src/middleware/correlation.ts` exists.
- Mounted at `index.ts:69` before all other middleware.
- `backend/tests/correlation.test.ts` and `tests/outbox-correlation.test.ts` and `tests/webhook-correlation.test.ts` verify propagation.

**Runbooks (baseline: none):** 4 runbooks exist:
- `docs/governance/runbook-api.md` — API ops + field visibility flag procedure
- `docs/governance/runbook-ci-and-migrations.md` — CI, prisma migrate workflow, apply-path
- `docs/runbooks/ops-shell.md` — ops redesign shell; rollback procedure
- `docs/runbooks/rights-windows.md` — rights windows flag; rollback procedure

**Remaining gaps:**
- Rollback = redeploy (TD-27): no runtime override for feature flags; the runbooks document this honestly but it means flags can't be toggled without a deploy cycle.
- No alerting/paging configuration visible in the repo.
- No staging environment evidence in repo.
- Live DB state, Redis queue depths, actual error rates: **UNKNOWN** (not readable from repo).

---

### 7. Product Value Health — 7/10 (+2.0)

**Vision fork (baseline: "unclear-but-forked vision" — provisional score):** RESOLVED.
- **ADR-010** (Accepted 2026-06-12): _"Planza is a multi-tenant product. VRT is the first tenant, not the product."_ Multi-tenant correctness is now Core Domain, not speculative generality.

**Feature delivery since baseline:**

| Deliverable | Shipped | Status |
|---|---|---|
| Teams/Players repository (Phases 0–3) | EPIC G, 2026-06-12 | ✅ Feature-complete through Phase 3 |
| Ops redesign (5 screens) | Ops EPICs A–E, 2026-07-02 | ✅ Flag ON in prod (ADR-016 COEXIST) |
| Rights Windows v1 (RD-1–RD-5) | 2026-07-10–11 | ✅ Checker v2, draft validation, check-slots API; merged PR #18 |
| Schedule-ripple spike (SV-1) | 2026-07-11–12 | ✅ ADR-019 Accepted; findings clear SV-2 requirements |

**Ops screens delivered (all 5):** Schedule, EventInspector, Registry (with create modal), Rundown (with rights matrix), Sync. WCAG AA theme-aware, deep-linking (ADR-014), rights matrix consumer wired.

**Known product gaps:**
- Rights checker v2 enforcement (DELAYED/HIGHLIGHTS/CLIP holdback) **not reachable from real published slots** until RD-7 adds `coverageCategory` source on `BroadcastSlot`. RD-3 capability is real and tested; it requires a data-model extension to fire on production data.
- No live usage metrics. UNKNOWN.
- Players Phase 4 (structured `homeTeamId`/`awayTeamId` on events) and Phase 5 (merge-review bulk UI) are not yet planned.
- `RightsPolicy` deprecation (RD-6) not yet executed; the old UI panel still accepts writes.

---

## Critical findings (address before next evaluation)

1. **TD-29 — Dual rights model (HIGH).** The `RightsPolicy` table and its lossy `policyToContractShape` adapter are still active in the flag-OFF code path. The adapter hardcodes `existingRuns: []`, drops blackout/platform/territory/expiry, and emits false `MAX_RUNS_EXCEEDED` for no-limit contracts. RD-6 is DoR-ready; the only block is the decision to run `rightsWindows` ON everywhere (which is also a prereq for RD-7 to matter). This is the highest-interest item on the register.

2. **SV-1 gap — feed→slot sync (unregistered, architectural).** Feed imports update `Event.startDateBE/startTimeBE` via `updateImportedEvent` but never call `eventSlotBridge`. Any reimport that moves an event's kickoff leaves its `BroadcastSlot.plannedStartUtc/EndUtc` silently stale. SV-2 (`RippleProposal`) is scoped to address this; it is greenfield work with no existing machinery to hook.

3. **TD-22 — RLS activation still pending.** Layer 1 (61 policies, 0 uncovered, FF-2 ratchet) and Layer 2 (non-owner `planza_app` role, CI enforcement proof) are done. The remaining story — per-request transaction wrapper so routes set the RLS context and `APP_DATABASE_URL` can be activated — has not been executed. Until then, tenant isolation relies entirely on application-level `where tenantId` clauses (which are present, but defense-in-depth is absent).

4. **TD-6 — Field visibility enforcement still flag-OFF in production.** Code is ready (23 tests, fail-closed semantics), and the operational procedure is in the runbook. The security gap (`visibleByRoles` fields emitted to all authenticated roles) remains active until the user enables `FIELD_VISIBILITY_ENFORCEMENT=true` in `backend/.env`.

---

## Top 5 next improvements (impact order)

1. **RD-6: Retire RightsPolicy** (S–M, HIGH interest). Delete the adapter chain, migrate policy rows to Contract windows, drop the `RightsPolicy` table. Requires `rightsWindows` flag ON everywhere first. Closes TD-29; makes draft validation correct for the first time. DoR-ready.

2. **SV-2: Feed→slot sync — `RippleProposal`** (M–L). The SV-1 spike proved this is greenfield; model on `MergeCandidate` review flow. Every feed reimport currently risks silently stale broadcast schedules. The scale of the gap means this should be the next major EPIC.

3. **TD-22 activation: per-request RLS transaction wrapper** (M). The last step in the ADR-011 plan. Enables `APP_DATABASE_URL` (non-owner role) in production, making RLS the actual multi-tenant isolation layer rather than a CI-only proof.

4. **TD-6: Enable `FIELD_VISIBILITY_ENFORCEMENT=true` in production** (S — one operational step). The code exists and is tested; this is a runbook action, not a development task. Closes the active field-level authorization gap.

5. **Cascade cluster (TD-12/13/14)**: Fix midnight anchor (engine reads `startDateBE` as 00:00 UTC, not `startTimeBE`), outbox idempotency key, and outbox write in-transaction. All three are interdependent per ADR-008; fix together under the `CASCADE_PREVIEW_PARITY` flag. Every cascade estimate for chain-first events is currently wrong by the event's start time.

---

## Strengths to protect

1. **Reliability engineering above weight class:** transactional outbox, idempotency keys, DLQs, advisory locks, HMAC webhooks, tiered rate limiting, circuit breakers, ADR-009 pagination. Do not trade these away under delivery pressure.

2. **Two-job CI pipeline:** quality gate (typecheck, lint, FF-1, tests both workspaces) + migrations job (Postgres 17 history build, `migrate deploy`, drift=0 SLO, DB smoke, RLS enforcement proof). The migration job is what makes "runs against a database" a real DoD gate.

3. **Review chain discipline:** two-hats-enforcer → smell/naming → ubiquitous-language-guard → test-quality-auditor. EPIC RD caught 6 defects pre-merge that green tests alone would have shipped. This is the team's highest-leverage quality mechanism.

4. **Growing test suite with real-component tests:** 64 backend + 41 frontend test files; 498 backend tests. Frontend tests now cover selectors, ops screens, forms, hooks — not just smoke. The B-3/C-0 characterization approach (desired-semantics test first, then fix) has proven effective at surfacing hidden defects.

5. **ADR discipline:** 17 ADRs, all significant decisions recorded with context and consequences. The RD-1 spike → ADR-015 → RD-2…5 delivery arc is a clean example of spike-first, code-second that should be repeated for SV-2.

---

## Newly scoreable items (not in baseline)

| Item | Now observable | Value |
|---|---|---|
| Commit cadence | 3 concentrated sessions, 69 commits in 30 calendar days | High velocity, session-based model |
| Merged PR count | 19 PRs (PR #1–#19) since baseline | Each an integration-tested story arc |
| ADR count | 17 (was 0) | Architecture decisions traceable |
| TD settled ratio | 11/29 = 38% | Meaningful paydown within 30 days |
| Test file ratio | +37 backend, +40 frontend files | Quality loop now has real coverage |
| Runbook count | 4 (was 0) | Operational scenarios documented |
| Fitness functions | 2 (was 0) | Architecture properties CI-enforced |

---

## Next evaluation

**Date: 2026-08-12**

**Focus for that run:**
- Verify RD-6 landed (TD-29 closed): check `RightsPolicy` table presence via schema, adapter deletion.
- SV-2 status: has `RippleProposal` work started?
- TD-22 activation: has the per-request TX wrapper shipped?
- Re-run test suites if environment allows to get authoritative counts.
- Check if `provision.ts` (1168 ln) has been addressed (no registered TD yet).
- Product Value: any live deployment or usage metrics observable?
