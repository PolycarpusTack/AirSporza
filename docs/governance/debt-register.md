# Planza — Technical Debt Register

_Seeded: 2026-06-12 (story A-3-T3) from the current-state evaluation (`docs/plans/2026-06-12-development-mitigation-plan.md`) and mitigation backlog · Format: Core Specification v1 §2 P4_
_Counts re-verified against code on 2026-06-12 (ASM-10) — see verification notes at the bottom._
_Linked from [`architecture-memory.md`](./architecture-memory.md). A shortcut without an entry here didn't happen (DoD)._

| Field | Meaning |
|---|---|
| Principal | Cost to fix now (S/M/L) |
| Interest | Recurring cost of leaving it (none/low/med/high + form) |
| Compounding | Does future work build on top of it? |

---

## TD-1 — `ImportJobRunner.ts` god file — ✅ SETTLED (C-1, 2026-06-12)

- **Resolution:** decomposed to a 330-line orchestrator + `stages/` (shared, provision, records, process, progress, failure); pure moves, suite green with zero test edits; `ImportStages` contract snapshot is the EPIC G interface.
- **Residual (carried as TD-21):** the three `process*Record` functions are near-identical copies — collapse into a generic `processRecord(normalizeFn, upsertFn)` when EPIC G adds the player path (do NOT add a fourth copy).
- **Origin:** 2026-06-12 evaluation.

## TD-2 — `routes/import.ts` god file

- **Artifact:** `backend/src/routes/import.ts` (**1352 lines** — verified)
- **Type:** code
- **Cause:** one router accreted sources, jobs, records, merge candidates, dead-letters, and replay endpoints.
- **Principal:** M
- **Interest:** **med** — slow navigation and wide blast radius per route change; pagination work (B-4-T2) must wade through it.
- **Compounding:** yes — new import endpoints keep landing in the same file until split.
- **Servicing decision:** **pay down in EPIC C story C-2** (split into sub-routers); B-4-T2 touches it before then but adds no new structure.
- **Origin:** 2026-06-12 evaluation.

## TD-3 — `PlannerView.tsx` god file

- **Artifact:** `src/pages/PlannerView.tsx` (**1009 lines** — verified)
- **Type:** code
- **Cause:** core scheduling UI (drag-and-drop, undo/redo, layout) grew in place with ~no frontend tests to enable safe extraction.
- **Principal:** L
- **Interest:** **high** — it is the core UI: every planner feature edits it nearly blind (1 test file exists).
- **Compounding:** **yes** — Core Domain code; new planner features stack onto it.
- **Servicing decision:** **pay down in EPIC C story C-3** (extract state/undo-redo hook), gated on the B-3-T3 test safety net.
- **Origin:** 2026-06-12 evaluation.

## TD-4 — `AdminView.tsx` god file

- **Artifact:** `src/pages/AdminView.tsx` (**793 lines** — verified)
- **Type:** code
- **Cause:** all admin domains (fields, dropdowns, users, settings) rendered from one component.
- **Principal:** M
- **Interest:** **low** — admin surface changes less often than the planner.
- **Compounding:** yes (mildly) — each new admin domain widens it.
- **Servicing decision:** **pay down in EPIC C story C-4** (split by admin domain); lowest priority of the four god files.
- **Origin:** 2026-06-12 evaluation.

## TD-5 — Cascade `engine.ts` untested + engine-vs-preview divergence

- **Artifact:** `backend/src/services/cascade/engine.ts` (203 lines, **zero tests**); divergence vs the cascade preview in `routes/schedules.ts`, documented in `backend/tests/cascade.test.ts`
- **Type:** code (test gap with architecture-level consequence: two sources of cascade truth)
- **Cause:** tests were written for the pure parts (`compute.ts`, `estimator.ts`); the orchestrator was left for later; preview logic evolved separately.
- **Principal:** M
- **Interest:** **high** — schedule recomputation is planner-facing; the divergence means the preview can promise what the engine won't do, and no test catches either regressing.
- **Compounding:** **yes** — cascade changes (and EPIC D correlation IDs) build on untested orchestration.
- **Servicing decision:** **pay down in EPIC B story B-2** (B-2-T1 characterization, B-2-T2 reconcile-or-ADR-008).
- **Origin:** 2026-06-12 evaluation critical finding #4; divergence first recorded in `cascade.test.ts`.

## TD-6 — `visibleByRoles` defined but unenforced (security)

- **Artifact:** `FieldDefinition.visibleByRoles` (`backend/src/schemas/fieldConfig.ts:27` + Prisma schema) — referenced by **no** route or service
- **Type:** architecture (authorization design promise without enforcement point)
- **Cause:** schema and admin UI shipped ahead of the response-shaping layer; no choke point existed to hook the filter into.
- **Principal:** M
- **Interest:** **high** — active information-disclosure gap (STRIDE, backlog §1): role-restricted fields are emitted to every authenticated role in a multi-tenant system, and the admin UI implies otherwise.
- **Compounding:** **yes** — every new field-bearing endpoint ships unfiltered.
- **Servicing decision:** **pay down in EPIC B story B-1** (fail-closed `FieldVisibilityFilter` behind `FIELD_VISIBILITY_ENFORCEMENT`); register entry closes when the flag is on.
- **Origin:** 2026-06-12 evaluation critical finding #3.

## TD-7 — Unpaginated list endpoints

- **Artifact:** list endpoints across `backend/src/routes/` (78 `findMany` occurrences in route files — verified; `/api/events`, `/api/teams`, import-record listings are the volume offenders)
- **Type:** architecture (API convention / scalability cliff)
- **Cause:** full-list responses were fine at prototype data volumes; no pagination convention was ever set.
- **Principal:** M (helper + top-3 endpoints) — L if all routes converted at once
- **Interest:** **med, rising with data volume** — response size and frontend memory grow linearly with tenant data; import records already hit 1k+.
- **Compounding:** **yes** — every new list endpoint copies the unpaginated pattern until ADR-009 exists.
- **Servicing decision:** **pay down in EPIC B story B-4** for the top-3 endpoints (+ ADR-009 convention); remaining routes: follow-the-pattern opportunistically whenever touched — re-review at the EPIC B retro.
- **Origin:** 2026-06-12 evaluation (Architecture Health: no pagination).

## TD-8 — `any` usage

- **Artifact:** backend + frontend TypeScript: **53 `: any` annotations** (verified — matches the evaluation's ~53; only 10 of them are catch clauses) **plus 68 `as any` casts** the evaluation did not count (121 total excl. test files)
- **Type:** code
- **Cause:** expedient typing at integration boundaries (external API payloads, Prisma JSON columns, event payloads).
- **Interest:** **low–med** — each `any`/`as any` is a hole in the strict-TS safety net; concentrated at exactly the boundaries where data is least trustworthy.
- **Principal:** M (mechanical: `unknown` + narrowing, Zod at boundaries)
- **Compounding:** no — count grows slowly, but lint doesn't currently stop new ones.
- **Servicing decision:** **pay down in EPIC F story F-2**; scope must cover `as any` casts too (true total is 121, not 53). Interim ratchet candidate: eslint `no-explicit-any` as warn.
- **Origin:** 2026-06-12 evaluation; counts re-verified 2026-06-12 (see notes).

## TD-9 — `TeamCompetition` NULL-season uniqueness route-enforced only

- **Artifact:** `backend/src/routes/teams.ts` membership CRUD + `TeamCompetition` model (`schema.prisma`)
- **Type:** architecture (integrity constraint placed in application instead of DB)
- **Cause:** Postgres `@@unique` treats NULLs as distinct, so the (team, competition, NULL season) duplicate guard could not use the index; the check landed in the route (Teams Phase 2, commit `7b5b4c5`).
- **Principal:** S
- **Interest:** **low** — holds as long as the route is the only writer; any future writer (import auto-derive already writes memberships, bulk ops, seeds) can create duplicates silently.
- **Compounding:** no.
- **Servicing decision:** **accept until story A-2-T3** (the Team/TeamCompetition migration), then fix properly in a follow-up migration: Postgres 15+ `UNIQUE NULLS NOT DISTINCT` (or a partial unique index on `season IS NULL`) once `prisma migrate` owns history. Re-verify the route guard at A-2-T3's quality gate.
- **Origin:** Teams Phase 2 implementation (`docs/teams-players-repository-CHECKPOINT.md`, known caveats).

## TD-10 — Legacy "sporza" naming drift

- **Artifact:** `package.json` (`sporza-planner`), `backend/package.json` (`sporza-planner-backend`), `docker-compose.yml` (containers `sporza-db`/`sporza-backend`/`sporza-frontend`, network, DB/user/password `sporza*`), `README.md` (SporzaPlanner title, paths, example URLs)
- **Type:** infra (identifiers in package/container/database naming)
- **Cause:** product renamed Sporza Planner → Planza; identifiers were never migrated (breaking: volumes, connection strings, lockfiles).
- **Principal:** S–M (the rename is easy; the data-volume/connection-string migration is the cost)
- **Interest:** **low** — cognitive friction and onboarding confusion only; no functional cost.
- **Compounding:** no — the glossary's naming decision forbids new usage, so the principal is frozen.
- **Servicing decision:** **live with** for now — a breaking rename of packages, containers, and the database is not worth the churn; glossary enforces Planza-only in new code/docs. Execute opportunistically the next time docker-compose is restructured (EPIC D observability is the likely window); do **not** mass-rename outside such a window.
- **Origin:** 2026-06-12 evaluation (Domain Model Health: naming drift); decision recorded in [`domain-glossary.md`](./domain-glossary.md).

## TD-11 — No frontend coverage threshold

- **Artifact:** frontend Vitest config (created in A-1-T2) — no `coverage.thresholds`
- **Type:** infra (CI policy gap)
- **Cause:** deliberate: with one pre-existing test file, any threshold would be either meaningless (0%) or an instant red wall; deferred until a real suite exists.
- **Principal:** S
- **Interest:** **none until EPIC B**, then **low** — without a ratchet, coverage gains from B-3 can silently erode.
- **Compounding:** no.
- **Servicing decision:** **pay down after EPIC B story B-3** — record a threshold proposal at the B-3 retro (based on actual achieved coverage), then enforce it in CI.
- **Origin:** backlog A-1 TD consideration (recorded at task A-1 design time, 2026-06-12).

## TD-12 — Cascade engine: midnight anchoring + confidence divergence

- **Artifact:** `backend/src/services/cascade/engine.ts:125` (anchor), `compute.ts:97-98` (decay) — pinned by `tests/cascade-engine.test.ts`
- **Type:** code (behavior defect, Core Domain)
- **Cause:** engine reads `startDateBE` (date-only) and never `startTimeBE` → first event anchored at 00:00 UTC; unconditional confidence decay diverges from the preview's (correct) first-slot-certain convention.
- **Principal:** M
- **Interest:** **high** — every cascade estimate for a chain-first event is wrong by the event's start time; planner trust erodes.
- **Compounding:** yes — alerts/handoffs consume these estimates.
- **Servicing decision:** **dedicated flagged story (`CASCADE_PREVIEW_PARITY`), scheduled with EPIC C cascade work** — fix anchor + confidence together per **ADR-008** (fixing either alone makes things worse). Characterization suite is the contract.
- **Origin:** B-2-T1 findings 1-2 (2026-06-12).

## TD-13 — Cascade outbox idempotency key is not idempotent

- **Artifact:** `backend/src/workers/cascadeWorker.ts:39-45` + `services/outbox.ts:30-32`
- **Type:** code (reliability)
- **Cause:** no explicit idempotency key passed → fresh UUID per call; BullMQ jobId dedup never fires for cascade retries.
- **Principal:** S
- **Interest:** **med** — duplicate `cascade.recomputed` outbox rows + duplicate alert jobs on every worker retry.
- **Compounding:** yes — interacts with TD-14's retry path.
- **Servicing decision:** fix with TD-12's story (key: `cascade.recomputed:<courtId>:<dateStr>:<bucket>`), per ADR-008.
- **Origin:** B-2-T1 finding 4.

## TD-14 — Cascade estimates and outbox write in separate transactions

- **Artifact:** `engine.ts:59-192` (tx 1) vs `cascadeWorker.ts:38-46` (tx 2) vs socket push (no tx)
- **Type:** architecture (violates the project's own ADR-001 outbox-in-tx pattern)
- **Cause:** worker added fan-out after the engine's transaction instead of inside it.
- **Principal:** S
- **Interest:** **med** — failure window = committed estimates with no fan-out; retry double-writes (with TD-13).
- **Compounding:** yes.
- **Servicing decision:** fix with TD-12's story (move outbox write into the engine transaction), per ADR-008.
- **Origin:** B-2-T1 finding 5.

## TD-15 — `crewConflicts` duration unit confusion (hours vs minutes)

- **Artifact:** `src/utils/crewConflicts.ts:30-34` — pinned by `crewConflicts.test.ts`
- **Type:** code (behavior defect)
- **Cause:** `parseFloat(event.duration)` interpreted as **hours** (default 3h) while `dateTime.parseDurationMin` treats the same strings as **minutes**; SMPTE `01:30:00` parses to 1 hour.
- **Principal:** S
- **Interest:** **high** — crew conflict detection windows are wrong for any explicit duration → false negatives/positives in conflict warnings.
- **Compounding:** no.
- **Servicing decision:** **dedicated FEATURE fix early in EPIC C** (desired-semantics test first; unify on `parseDurationMin`); pinned tests updated deliberately.
- **Origin:** B-3-T1 findings 1-3.

## TD-16 — `dateTime`/`calendarLayout` parsing gaps

- **Artifact:** `src/utils/dateTime.ts:50-87`, `src/utils/calendarLayout.ts:25-54` — pinned by B-3-T1 suites
- **Type:** code
- **Cause:** `parseDurationMin` can't parse plain `HH:MM:SS` or `45m` and falls back to 90; zero-duration inexpressible; `getDateKey` mixes UTC/local semantics; layout ignores `durationMin` entirely.
- **Principal:** M
- **Interest:** **med** — calendar rendering correct only by coincidence for common formats (the 90-min fallback masks failures).
- **Compounding:** yes — B-4-T3/EPIC C UI work builds on these utils.
- **Servicing decision:** fix with TD-15's story (same module family, one desired-semantics pass).
- **Origin:** B-3-T1 findings 5-12.

## TD-17 — `eventReadiness` ignores `channelId`

- **Artifact:** `src/utils/eventReadiness.ts:70-74`
- **Type:** code
- **Cause:** channel check reads only deprecated string fields (`linearChannel` etc.); events migrated to `channelId` fail readiness.
- **Principal:** S
- **Interest:** **low now, rises** as events migrate to `channelId` (the legacy fields are already deprecated in schema).
- **Compounding:** no.
- **Servicing decision:** fix with TD-15's story; until then readiness badges under-report for channelId-only events (known limitation).
- **Origin:** B-3-T1 finding 15.

## TD-15 → TD-18 status (C-0 + C-quality pass, 2026-06-12)

- **TD-15 ✅ settled** (crewConflicts on minutes via shared accessor) — except finding 3 (unparseable date/time silently drops assignments), carried here: principal S, interest low, fix when `detectCrewConflicts` return shape next changes.
- **TD-16 ✅ settled** — `parseDurationMin` handles HH:MM:SS/'45m'/'0'; `effectiveDurationMin` is THE app-wide accessor (dateTime.ts), honored by calendarLayout, CalendarGrid height/drag, crewConflicts, resourceConflicts, ResourceTimeline, eventReadiness. `getDateKey`/`timeToMinutes`/`fmtAgo` quirks remain pinned (out of scope, low interest).
- **TD-17 ✅ settled** (readiness accepts channelId/radioChannelId/onDemandChannelId + durationMin).
- **TD-18 ✅ settled + hardened**: fail-visible preflight; quality pass closed a review-found hole — confirmation is now keyed to the exact warning-set signature the user saw (a stale/clean/unavailable confirmation never auto-passes fresh warnings; `useConflictCheck.test.ts`).
- **Quality-pass extras:** resourceConflicts/ResourceTimeline still had the pre-TD-15 HOURS logic (fixed — the split-brain was app-wide, not crew-only); runner success path now uses guarded `writeSyncHistory` (a syncHistory write failure no longer misclassifies a completed import as failed); AppProvider incremental loading got cancellation on user-switch + failure reset (stale-events leak).

## TD-18 — Conflict preflight fails open

- **Artifact:** `src/components/forms/hooks/useConflictCheck.ts:49-54` — pinned by `DynamicEventForm.test.tsx`
- **Type:** code (behavior defect)
- **Cause:** API/network failure during the pre-save conflict check returns `'pass'`; the save proceeds with no warning.
- **Principal:** S
- **Interest:** **med** — exactly when the backend is degraded (the riskiest moment), conflict protection silently disappears.
- **Compounding:** no.
- **Servicing decision:** **dedicated FEATURE fix early in EPIC C** (fail-visible: warn + allow with explicit confirm); pinned test updated deliberately.
- **Origin:** B-3-T2 finding 6.

## TD-19 — Undo gaps: no lock check, slot consumed pre-API, no history

- **Artifact:** `src/pages/PlannerView.tsx:340-370` — pinned by `PlannerView.undoRedo.test.tsx`
- **Type:** code
- **Cause:** single-slot `lastDragRef` design: undo bypasses the freeze/lock confirm flow, the slot is nulled before the API call (failed undo unretryable), 5s auto-dismiss destroys the affordance, no redo exists.
- **Principal:** M
- **Interest:** **low-med** — planner-facing edge cases; worst is moving a locked event via undo.
- **Compounding:** yes — EPIC C's PlannerView decomposition (TD-3) touches this code.
- **Servicing decision:** fix within **EPIC C TD-3 story** via the B-3-T3 extraction note (`usePlannerUndo` hook); the characterization suite is the safety net.
- **Origin:** B-3-T3 findings 1-7 (+ finding 8: `PlannerView.dnd.test.tsx` replicates logic in-test and cannot catch src changes — retire it into the new suite during the same story).

## TD-20 — Import progress stats regression — ✅ SETTLED (EPIC D, 2026-06-12)

> checkCancelled now adopts only externally-written control fields (cancelRequested/cancelledBy) from the DB read; counters never regress (tests/import-progress.test.ts, red-first).

### Original entry: Import progress stats can regress after a swallowed write failure

- **Artifact:** `backend/src/import/stages/progress.ts` (~line 88, `checkCancelled` merge) — pinned by `cascade-engine`-style review, moved code (pre-existing)
- **Type:** code (reliability)
- **Cause:** `queueWrite` swallows statsJson UPDATE failures while `checkCancelled` merges DB stats OVER in-memory stats — one transient write failure regresses counters to stale DB values; subsequent increments build on the regressed numbers.
- **Principal:** S
- **Interest:** **low-med** — final job stats and syncHistory undercount after transient DB hiccups mid-import.
- **Compounding:** no.
- **Servicing decision:** fix when the import pipeline is next touched (EPIC G): merge direction should prefer in-memory counters for monotonic fields.
- **Origin:** C-quality review pass (Angle A finding 5), 2026-06-12.

## TD-21 — `process*Record` triplication — ✅ SETTLED (EPIC G G-3a, 2026-06-12)

- **Resolution:** collapsed into generic `processRecord(job, progress, raw, {entityType, normalize, upsert})` with the merge-review branch as a built-in outcome; the four entity processors (incl. players) are thin bindings. Zero behavior change (suite green pre-player-code).
- **Origin:** C-quality review pass, 2026-06-12.

## Status updates (C-2 / C-3 / EPIC G, 2026-06-12)

- **TD-2 ✅ settled** — `routes/import.ts` (1376 ln) split into `routes/import/` sub-routers (index + 8 modules), pure moves, zero test edits.
- **TD-19 ✅ settled** — `usePlannerUndo` extracted (PREP), then: undo honors the lock/override-confirm flow, failed undo retryable (slot consumed on success only), UndoBar no longer force-dismisses. Remaining single-slot/no-redo/auto-dismiss design is **accepted** (pinned, documented in the hook header).
- **TD-3 ◐ partial** — PlannerView shed the undo machinery (~60 ln) and gained a tested hook; file is still ~950 ln. Further decomposition stays open under TD-3 (interest now LOWER: undo, the riskiest logic, is extracted and tested).
- **TD-9 pattern** reused by `PlayerTeam` NULL-season guard (EPIC G).

## TD-22 — RLS coverage ◐ NARROWED (coverage done 2026-06-12; enforcement story remains)

> **Layer 1 DONE** (61 policies, 0 uncovered, FF-2 ratchet). **Layer 2 scaffolding DONE**
> (2026-06-12, PR #3): `planza_app` non-owner role + grants + `auth_lookup` policy; all 61
> policies NULLIF-hardened (expired context fails empty, not 22P02); worker pins owner role;
> **CI proves enforcement every run** (6-test suite as the bound role). **Remaining: activation
> story** — `set_tenant_context` is transaction-local, so routes need the per-request
> transaction wrapper (or Prisma client extension) before APP_DATABASE_URL can be set in prod.
> Principal: M (route-layer change + regression pass). All details: ADR-011.

### Original entry (for history): RLS coverage is partial

- **Artifact:** live DB `pg_policies` — 48 policies, but `Team`, `Player`, `TeamCompetition`, `PlayerTeam` (and the 0_init precedent set) have **none**; verified 2026-06-12.
- **Type:** architecture (security posture)
- **Cause:** RLS was added per-table in `add_tenant_id_and_rls.sql`; tables created later via `db push` (Team era) never got policies, and EPIC G followed that precedent for consistency.
- **Principal:** M (write policies + FORCE RLS decision + regression-test against route behavior)
- **Interest:** **low while every route filters by `req.tenantId`** (they do — reviewed), but each new query is one missed `where` away from cross-tenant exposure; defense-in-depth gap.
- **Compounding:** yes — every new operational table inherits the precedent.
- **Servicing decision:** dedicated security story in **EPIC D/hardening**: enumerate policy-less tenant tables, add `tenant_isolation` policies + decide owner-bypass posture; until then the ADR-002 claim ("RLS multi-tenancy") must be read as *partial*. **Priority RAISED by ADR-010** (multi-tenant product decision, 2026-06-12): tenant-isolation gaps are now Core Domain security defects.
- **Origin:** EPIC G review pass (deviation #4 verification), 2026-06-12.

## TD-23 — `ui/Btn.tsx` vs `ui/Button.tsx` duplication

- **Artifact:** `src/components/ui/Btn.tsx` and `src/components/ui/Button.tsx` — two shared button components with overlapping variants.
- **Type:** code
- **Cause:** parallel evolution; never consolidated.
- **Principal:** S
- **Interest:** **low** — but rises the moment ops screens need buttons: importing either into `ops/` doubles the blast radius of the eventual consolidation. Note `variant="accent"` renders the legacy amber `--primary`, NOT the ops `--accent-shell` (see ops-tokens contract).
- **Compounding:** yes if imported into new code.
- **Servicing decision:** **do NOT import either into `src/components/ops/` until consolidated**; consolidation slot: EPIC E TD servicing (E-4).
- **Origin:** ops-redesign backlog survey (§6 Architecture Memory), 2026-07-02; formally registered 2026-07-02 (was cited in the backlog as TD-23 but missing here).

## TD-24 — `Event`/`Contract` `@deprecated` fields still present

- **Artifact:** `src/data/types.ts` — `Event.channel`, `Event.duration`, boolean rights flags on `Contract` marked `@deprecated`; successors are `BroadcastSlot`/`Channel` and `Contract.platforms[]`.
- **Type:** code (API surface)
- **Cause:** migration to slot/platform model left legacy fields for old screens.
- **Principal:** M (remove after old screens are cut over)
- **Interest:** **med** — every new consumer must know which field is canonical; a wrong pick silently reads stale data.
- **Compounding:** yes — until removal, each new feature re-decides.
- **Servicing decision:** ops code MUST consume `platforms[]` and `BroadcastSlot`, never the deprecated fields (CLAUDE.md rule); removal decision at EPIC E cutover ADR (E-6).
- **Origin:** ops-redesign backlog survey, 2026-07-02; formally registered 2026-07-02 (was cited as TD-24).

## TD-25 — `Event.participants` is free text

- **Artifact:** `src/data/types.ts` — `Event.participants: string`; the teams/players repository (merged) provides real relations.
- **Type:** data model
- **Cause:** participants predates the repository.
- **Principal:** M (backfill/parse or dual-write)
- **Interest:** **low-med** — Registry LINKED views must use repo relations; participants cannot be joined.
- **Compounding:** yes — new events keep writing free text.
- **Servicing decision:** Registry (EPIC C) uses repo relations only, never parses `participants`; migration decision deferred to EPIC C refinement.
- **Origin:** ops-redesign backlog survey, 2026-07-02; formally registered 2026-07-02 (was cited as TD-25).

## TD-26 — Ops light-theme AA-derived values — ✅ SETTLED (signed off 2026-07-02)

> **Resolution:** architect/designer signed off on all 19 derived values as-is on 2026-07-02
> ("colours are ok"). No value changes → no re-audit or contract bump needed (ops-tokens v2
> guarantee 5 stands for any FUTURE change). The ⚠ flags in `docs/ops-token-map.md` are now
> historical derivation provenance, not open items.

### Original entry (for history)

- **Artifact:** `src/styles/tokens.css` `[data-theme="light"]` block + dark `--text-shell-3`/`--kind-staff` — 19 values derived programmatically (A-1-T4, architect-approved method), not designer-picked. Full old→new table: `docs/ops-token-map.md` §Derived values.
- **Type:** design/process shortcut (shipped ahead of designer approval)
- **Cause:** A-1-T3 audit found 39 AA failures; architect chose programmatic minimal-delta remediation (2026-07-02) to unblock the tracer bullet.
- **Principal:** S (designer review; re-derivation is scripted and cheap)
- **Interest:** **low** — values are AA-clean and hue-faithful; risk is design-intent drift only. Four flagged as materially more muted (light competition/team/warning/draft).
- **Compounding:** mildly — ops screens A-2+ will render on these values; late rejection means visual churn, not rework (contract guarantee 5 forces re-audit + ops-tokens bump on change).
- **Servicing decision:** designer sign-off before EPIC E light-theme QA (E-2); until then treat ⚠-marked values in `ops-token-map.md` as provisional.
- **Origin:** A-1-T4, 2026-07-02.

## TD-27 — `opsRedesign` flag is build-time only (no runtime override)

- **Artifact:** `src/flags.ts` — `isOpsRedesignEnabled()` reads `import.meta.env.VITE_OPS_REDESIGN` (build-time Vite substitution).
- **Type:** ops/process
- **Cause:** A-2-T1 created the codebase's first feature-flag convention; no runtime flag service exists, and building one was out of scope for the tracer bullet.
- **Principal:** M (runtime flag source: settings service, env-served config, or header override)
- **Interest:** **low while flag is OFF in prod** — but "rollback = flag off" in the ops-shell runbook actually means "rollback = redeploy with the env changed", which weakens ADR-012's instant-rollback story.
- **Compounding:** yes — every future flag copies this convention.
- **Servicing decision:** decide at EPIC E (E-5 flag rollout plan) whether a runtime override is needed before turning the flag ON for real users; until then the runbook (A-5) must state rollback = redeploy honestly.
- **Origin:** A-2-T1, 2026-07-02 (flagged in `src/flags.ts` and OpsShell v1 contract).

## TD-28 — zod ↔ Prisma enum drift on rights/broadcast write surfaces

- **Artifact:** three API zod enums narrower/misaligned with their Prisma counterparts:
  1. **Contract/policy `coverageType`** — zod `['LIVE','DELAYED','HIGHLIGHTS']` (`backend/src/schemas/contracts.ts`,
     `backend/src/schemas/rights.ts`) vs Prisma `CoverageType` (`LIVE|HIGHLIGHTS|DELAYED|CLIP|ARCHIVE`): `CLIP` and
     (post-RD-2-T1) `ARCHIVE` are DB-valid but API-rejected on contract/policy writes.
  2. **`OverrunStrategy`** — broadcast-slot zod `['EXTEND','TRUNCATE','SWITCH']`
     (`backend/src/schemas/broadcastSlots.ts`) vs Prisma `OverrunStrategy`
     (`EXTEND|CONDITIONAL_SWITCH|HARD_CUT|SPLIT_SCREEN`): the zod set names values the enum doesn't have and omits the
     real ones.
  3. **Run-ledger `status`** — zod `['PENDING','RUNNING','COMPLETED','CANCELLED']` (`backend/src/schemas/rights.ts`
     `runLedgerCreateSchema`) vs Prisma `RunStatus` (`PENDING|CONFIRMED|RECONCILED|DISPUTED`): the API can only create
     runs in states the rights checkers never count (`CONFIRMED|RECONCILED` are the only tallied states — memo §5.7),
     so run-limit enforcement stays vacuous regardless of the ADR-015 window work.
  Also the **contract `status`** zod (`['valid','expiring','expired','draft','terminated']`) lists `expired`/`terminated`
  that are not in Prisma `ContractStatus` — same drift class.
- **Type:** correctness / API-DB contract drift (Core Domain write surfaces)
- **Cause:** zod enums were hand-authored per-endpoint and never regenerated from the Prisma enums; each drifted
  independently as the schema evolved.
- **Principal:** S–M (regenerate the four zod enums from Prisma as the single source; add a guard/test that fails when
  a zod enum diverges from its Prisma enum).
- **Interest:** **medium** — (1)/(2) silently 400 legitimate values; (3) makes run-limit checks structurally
  un-exercisable (the checker counts states the API cannot produce). Not currently exploited by dev data (all-LIVE,
  no run writers) but blocks RD-3 run-tally correctness.
- **Compounding:** yes — every new rights/broadcast field copies the per-endpoint hand-authored enum pattern.
- **Servicing decision:** **registered only** here (RD-2-T2). RD-2-T2's own NEW window surface already validates
  against the FULL `CoverageType` set (`coverageTypeEnum` in `schemas/common.ts`) + `ExclusivityTier`, so it does not
  add drift. Fixing the three *existing* drifted surfaces is a separate tested story (widening contract/policy
  `coverageType` is a runtime behavior change deferred out of the PREPARATORY RD-2-T1 per Two Hats); the run-ledger
  `status` fix is folded into RD-3 (run-tally rewrite). Do not fix inline.
- **Origin:** ADR-015 §2 (zod-drift note) + RD-1 memo §5.7; formally registered RD-2-T2, 2026-07-10.

## TD-29 — Dual rights model: `RightsPolicy` table + lossy Contract→DTO→pseudo-Contract adapter chain

- **Artifact:** Prisma `RightsPolicy` model (`backend/prisma/schema.prisma:1593`) + its CRUD
  (`backend/src/routes/rights.ts`, `RightsPoliciesPanel.tsx`, `rightsApi` policy methods); the thin DTO *also named*
  `RightsPolicy` (`backend/src/services/validation/types.ts:11` — name-collides with the Prisma model but is
  populated from **Contract**); `loadRightsPolicies` (`backend/src/routes/schedules.ts:15`, lossy mapping incl.
  `maxLiveRuns ?? 0`) + `policyToContractShape` (`backend/src/services/validation/rights.ts:84`, hardcoded legacy
  booleans, `platforms: []`, blackouts dropped, `status: 'valid'`, `id: 0`).
- **Type:** architecture (two rights models + a lossy validation bridge in the Core Domain)
- **Cause:** the enrichment migration copied RightsPolicy's fields onto Contract ("unified from RightsPolicy" —
  schema comment) but the policy table/CRUD was never retired; draft validation kept a DTO bridge instead of
  consuming Contract directly.
- **Principal:** M (freeze policy writes, migrate rows to Contract windows, delete adapter chain + DTO name collision,
  drop table)
- **Interest:** **high** — the bridge silently disables blackout/platform/territory/expiry checks in draft
  validation, emits false blocking `MAX_RUNS_EXCEEDED` for no-limit contracts (can 422-block publish), never
  consults the RunLedger (`existingRuns: []` hardcoded), and every rights feature must first decide which model to
  touch. Verified in the RD-1 spike (`docs/plans/rd-1-rights-model-spike.md` §1).
- **Compounding:** **yes** — Rights Windows (EPIC RD) build directly on the rights model; without a disposition every
  RD story doubles the divergence.
- **Servicing decision:** per **ADR-015 (Proposed)**: windows attach to Contract; stage 3 switches to a
  contract-backed context behind the `rightsWindows` flag (RD-3-T2); RightsPolicy is **deprecated** — write-freeze,
  row migration, adapter/DTO deletion, and table drop are executed in **story RD-6** (scoped at the RD retro).
  RD-2/RD-3 leave RightsPolicy untouched (no third model). The flag-OFF path deliberately preserves today's adapter
  behavior (byte-identical DoD) until RD-6 — including the two defects above, unless the architect schedules a
  separate defect fix before the golden master (memo §5.1).
- **Origin:** domain-gaps backlog survey §6 (candidate), formally registered by RD-1 spike, 2026-07-02.

## TD-30 ✅ settled (RC-2-T3, 2026-07-22) — `checkAccessibilityMissing` reads fields nothing writes (dead stage-4 check)

- **Settlement:** stub removed in RC-2-T3 (same FEATURE Hat per backlog — dead code with zero behavioral consumers,
  re-verified by grep at removal time: only its definition/call in `validation/regulatory.ts` plus the golden-master
  pin). Superseded by the flag-gated `ACCESSIBILITY_UNPLANNED` check (`validation/accessibilityUnplanned.ts`), which
  reads real `AccessibilityDeliverable` rows with a configurable lead time. The RC-1-T3 flag-OFF golden master
  (`tests/regulatory-golden.test.ts`) pinned the stub's output, so it was **deliberately regenerated** (documented in
  its header): flag-OFF stage-4 baseline is now watershed-only. Original entry kept below for the record.

- **Artifact:** `checkAccessibilityMissing` in `backend/src/services/validation/regulatory.ts` — emits
  `ACCESSIBILITY_MISSING` (WARNING) when `slot.sportMetadata.hasSubtitles`/`hasAudioDescription` are both falsy.
- **Type:** correctness / dead check (Core Domain validation stage 4)
- **Cause:** the check reads `sportMetadata.hasSubtitles`/`hasAudioDescription`, but **no writer sets those keys** —
  no route, importer, or UI populates them on `BroadcastSlot.sportMetadata`. So the check fires (WARNING) for
  essentially every slot on a signal that is always absent — it validates nothing real.
- **Principal:** M (model accessibility deliverables as first-class rows + a writer, then a real check).
- **Interest:** **low** — a WARNING (non-blocking), noisy but harmless; it does not gate publish.
- **Compounding:** no — isolated to stage 4.
- **Servicing decision — SUPERSESSION note:** leave the stub in place (it is byte-identical baseline behavior that the
  RC-1-T3 golden master pins) until **RC-2** replaces it with a real `AccessibilityDeliverable` model + writer + a
  check that reads actual deliverables. RC-1-T3 adds the flag-gated `LISTED_EVENT_FTA` check ALONGSIDE it without
  touching it. Registration only here — do NOT fix in RC-1-T3.
- **Origin:** observed while wiring stage 4 for RC-1-T3 (LISTED_EVENT_FTA), 2026-07-13.

## TD-31 — import-path event creation does not seed accessibility deliverables

- **Artifact:** `backend/src/import/stages/provision.ts:813`, `:941` and `backend/src/routes/csvImport.ts:50` —
  three `tx.event.create` sites with NO `accessibilityDeliverable.createMany` seeding hook.
- **Type:** correctness gap (Core Domain — RC-2 accessibility defaulting)
- **Cause:** RC-2-T1's DoR-approved spec scoped the defaulting hook to the two `events.ts` create routes
  (POST `/` + POST `/batch`). Imported events therefore get NO deliverable rows — including no
  T888=REQUIRED — silently bypassing the defaulting mechanism the config header promises
  ("never silently drops the subtitling obligation"). Flagged by the RC-2-T1 review chain (smell G2/G11).
- **Principal:** S — extract `seedDefaultAccessibilityDeliverables(tx, event, tenantId)` into a service
  (placement mirroring `syncEventToSlot`/`writeOutboxEvent`) and call it from all five creation sites.
  Extraction also crosses the Rule-of-Three threshold the moment any import site is added — do both together.
- **Interest:** **med** — every import run creates events invisible to RC-2-T2's KPI aggregation
  (coverage % silently overstated: missing rows aren't counted as missing) and to the RC-2-T3
  `ACCESSIBILITY_UNPLANNED` check (no REQUIRED row → no warning).
- **Compounding:** yes — RC-2-T2 (KPI endpoint) and RC-2-T3 (stage-4 check) both read these rows;
  the longer imports bypass seeding, the more backfill is needed at servicing time.
- **Servicing decision:** service **within EPIC RC, no later than RC-2-T3** (before the KPI endpoint is
  relied on): extract the service, wire the three import sites, backfill missing rows for existing
  imported events in the same migration. Architect may pull it earlier into RC-2-T2 if KPI accuracy
  is demoed.
- **Origin:** RC-2-T1 review chain (code-smell-detector G2/G11), 2026-07-22.

## TD-32 — frontend `ApiError` discards structured error bodies (409 recovery payload unreachable)

- **Artifact:** `src/utils/api.ts` (`api.post`/`ApiError` — status + message string only) vs the RC-2-T2
  transition 409 body `{ error, message, currentStatus, allowedNext }` (`backend/src/routes/accessibility.ts`).
- **Type:** contract gap (frontend infrastructure)
- **Cause:** the shared ApiClient predates structured error bodies; it parses the body only to extract a
  message. The optimistic-guard recovery affordance (409 tells the caller the real `currentStatus` +
  `allowedNext`) therefore cannot be consumed by components — they must re-fetch `list()` after a 409.
- **Principal:** S — add an optional `details?: unknown` (parsed body) to `ApiError`, type it in
  `accessibilityApi.transition`.
- **Interest:** **low now, med once UI lands** — no component consumes `accessibilityApi` yet (mutation
  surfaces are a follow-on initiative); until serviced, every optimistic-guard consumer pays an extra
  round-trip after each 409.
- **Compounding:** yes — any future endpoint with a structured error body (this is the second after
  schedules.ts:278) hits the same wall.
- **Servicing decision:** service with the FIRST UI consumer of `accessibilityApi` (follow-on ops-mutation
  initiative), not in RC-2 — the API comment documents the limitation honestly (TD-32 referenced inline).
- **Origin:** RC-2-T2 review chain (code-smell-detector G22), 2026-07-22.

---

## Verification notes (ASM-10 re-check, 2026-06-12)

| Claim (evaluation/backlog) | Verified against code | Match? |
|---|---|---|
| `ImportJobRunner.ts` 1660 ln | `wc -l` → **1660** | ✅ exact |
| `routes/import.ts` 1352 ln | `wc -l` → **1352** | ✅ exact |
| `PlannerView.tsx` 1009 ln | `wc -l` → **1009** | ✅ exact |
| `AdminView.tsx` 793 ln | `wc -l` → **793** | ✅ exact |
| ~53 `any` instances | `: any` annotations → **53** exact; **but** +68 `as any` casts uncounted (121 total, excl. tests). EPIC F's "mostly catch clauses" is wrong: only 10/53 are catch clauses. | ⚠️ undercount |
| "remaining 28 `findMany` routes" (B-4 note) | **78** `findMany` occurrences across route files (occurrences ≠ endpoints; recount endpoints at B-4) | ⚠️ imprecise |
| `cascade/engine.ts` 203 ln | `wc -l` → **203** | ✅ exact |
| 31 raw SQL migrations + 1 `.ts` seed | directory listing → **31 `.sql` + 1 `.ts`** | ✅ exact |
