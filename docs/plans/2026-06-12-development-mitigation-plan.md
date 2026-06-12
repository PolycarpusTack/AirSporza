# Planza — Development & Mitigation Plan

_Date: 2026-06-12_
_Method: AI-Native Software Delivery framework (`C:\Projects\ClaudeExtras\core`) — Current State Evaluator → Core Specification v1 mode declaration → Backlog Builder v5.1_
_Detailed backlog: [`2026-06-12-mitigation-backlog.md`](./2026-06-12-mitigation-backlog.md)_

---

## 1. Current State Evaluation (summary)

Full seven-dimension diagnostic run by the `current-state-evaluator` agent against the repo.

| # | Dimension | Score | Headline |
|---|---|---|---|
| 1 | Code Health | 6/10 | Strict TS, 0 TODOs, strong backend tests — but 7 god files and ~0% frontend coverage |
| 2 | Architecture Health | 6/10 | Deliberate reliability patterns (outbox, RLS, DLQ) — but 0 fitness functions, no ADRs, no pagination |
| 3 | Domain Model Health | 4/10 | No glossary; Planza/Sporza/SporzaPlanner naming drift; anemic transaction-script style (by design) |
| 4 | Delivery Flow Health | 5/10* | Phased and disciplined, but no written DoD — "done" has meant "typechecks", producing code never run against a DB |
| 5 | Technical Debt Health | 4/10 | Debt felt but not registered; migration strategy approaching its tipping point |
| 6 | Operational Readiness | 4/10 | Structured logging exists; no CI, no metrics, no correlation IDs, no runbooks, no rollback path |
| 7 | Product Value Health | 5/10* | Clear-but-forked vision (VRT tool vs multi-tenant product); Teams Phases 0–2 committed but undeployed |

_\* provisional — flow/usage metrics UNKNOWN (no tracker or telemetry data in repo)._ **Overall: 4.9/10.**

### Critical findings (address immediately)

1. **Schema/database drift** — ~30 raw SQL migrations applied manually via `docker exec`, no migration ledger, STATUS.md lists possibly-unapplied migrations, and the current branch's `Team`/`TeamCompetition` schema has been applied to **no database**. Phase 3 would add more schema on top.
2. **No CI** — 27 backend test suites, strict tsc, and ESLint exist but nothing runs automatically.
3. **`visibleByRoles` unenforced** — defined in `backend/src/schemas/fieldConfig.ts` + Prisma schema, referenced by no route/service: a silent field-level authorization gap in a multi-tenant system.
4. **Cascade orchestrator untested** — `backend/src/services/cascade/engine.ts` (203 ln) has zero tests; `cascade.test.ts` covers only `compute.ts`/`estimator.ts` and documents a known semantic divergence with the `schedules.ts` cascade preview.
5. **Frontend test gap** — 1 test file against ~12K LOC; `PlannerView.tsx` (1,009 ln) carries the core scheduling UI.

### Strengths (protect these)

- Reliability engineering above weight class: transactional outbox, idempotency keys, DLQs, advisory locks, HMAC webhooks, tiered rate limiting, RLS tenant isolation, circuit breakers.
- Strict TypeScript discipline both sides; clean route→service dependency direction (verified — zero reverse imports).
- Backend test quality is a strong template for closing the frontend gap.
- Exceptional documentation culture (30+ paired plan/design docs, session checkpoints).

---

## 2. Execution Mode: DELIVERY

Per Core Specification §1: the PROTOTYPE exit criteria are met (tracer bullet works end-to-end, architecture confirmed and deliberately patterned), and ongoing work is feature development on that validated architecture. **Not HARDENING** — the product is not feature-complete and no release/compliance event is pending.

**The central diagnosis:** the project is doing DELIVERY-grade work under DISCOVERY-grade governance. No CI, no fitness functions, no written DoD, no glossary, no debt register — all DELIVERY-mode requirements. Therefore **EPIC A bootstraps the mode's own preconditions** before/alongside further feature work.

---

## 3. The Plan

Two fully decomposed EPICs now (BB v5.1 rule: ≤ 2 initially); five outlined EPICs expand after the EPIC A/B retrospective. 18 tasks across 7 stories, all validated (DAG, token budgets, Hat declarations, TDD order, pull gates — validator PASS at full DELIVERY level).

### EPIC A — Quality Loop Tracer Bullet & Governance Baseline

The tracer bullet is the thinnest end-to-end slice of the *new quality infrastructure*: CI that typechecks, lints, and tests both workspaces, runs one new frontend smoke test, and applies migrations to a disposable Postgres — proving the whole quality loop.

- **A-1 CI quality loop** — baseline local loop (resolve npm-vs-pnpm ambiguity) → frontend Vitest+RTL harness + `eventReadiness` smoke test → GitHub Actions workflow → dependency-direction fitness function.
- **A-2 Migration consolidation** — audit applied-vs-pending + **verified backup (HOLD trigger: no baseline without restorable backup)** → baseline `0_init` + `migrate resolve` → Team/TeamCompetition migration (branch schema finally hits a DB) → migration step in CI + apply-path runbook. _Tracer bullet completes here._
- **A-3 Governance artifacts** — written DoD (incl. "runs against a database") + Domain Glossary (resolves naming drift, captures Teams vocabulary) → ADR-001…005 backfill (outbox, RLS, BullMQ, raw-SQL history, JWT/RBAC) + Architecture Memory → debt register seeded (TD-1…TD-11).

### EPIC B — High-Value Mitigations (gated on A-2-T4: DB-in-CI)

- **B-1 Enforce `visibleByRoles`** — inventory + filter contract, then enforcement behind flag `FIELD_VISIBILITY_ENFORCEMENT` (default off, fail-closed), contract tests first.
- **B-2 Cascade engine** — characterization tests (golden master, zero src diffs), then reconcile or document the engine-vs-preview divergence (ADR-008).
- **B-3 Frontend test foundation** — pure utils (`eventReadiness`, `crewConflicts`, `calendarLayout`, `dateTime`) → `DynamicEventForm` validation → PlannerView undo/redo.
- **B-4 API pagination** — contract + `/api/events` (ADR-009) → `/api/teams` + import records → `AppProvider` incremental loading behind flag `INCREMENTAL_LOADING`.

### Future EPICs (outline — expand after retro)

| EPIC | Objective | Gate |
|---|---|---|
| **C** | Decompose god files (`ImportJobRunner` along fetch/normalize/dedupe/merge/provision stages first) — characterization tests then PREP-hat extraction | After B |
| **D** | Observability: correlation IDs across request→outbox→worker→webhook, `/metrics` golden signals, runbooks per subsystem | After A |
| **E** | Dependency upgrades, risk-ordered: Vitest 3→4, Vite 6→8, then Prisma 5→7 | Prisma gated on A-2 |
| **F** | OpenAPI from Zod schemas + `any` cleanup (~53 instances) | Any time post-A |
| **G** | **Teams Phase 3 — Players domain** (~6–9 days per checkpoint) | **Hard-gated on A-2**; reuses C's extracted import stages — the checkpoint's "clone the team path" advice is superseded |

### Sequencing rationale

```
A-1 (CI) ─┬─► A-2 (migrations) ─► tracer complete ─► B (mitigations) ─► C/D/E/F
A-3 (governance, parallel)                                └─► G (Players, feature work resumes)
```

CI first because it makes every later change verifiable. Migrations second because they are the highest-interest debt item and Phase 3 schema work would compound them. Feature work (G) deliberately resumes only after the safety net exists.

---

## 4. Key assumptions (high-impact, from the Assumptions Ledger)

- **ASM-1:** Repo is on GitHub with Actions available.
- **ASM-2:** npm is authoritative (only `package-lock.json` exists; the `"packageManager": "pnpm"` field is stale) — decided at A-1-T1's pull gate.
- **ASM-3:** Exactly one live database environment; if more, the A-2-T1 audit repeats per environment.
- **ASM-4:** A restorable `pg_dump` backup is possible — **A-2 is HOLD if not**.

---

## 5. Governance going forward

- **DoD** (from A-3-T1) applies to every task: tests first, runs against a database, lint/tsc clean in CI, no undocumented shortcuts (TD item or it didn't happen).
- **Two Hats:** every task declares FEATURE / REFACTORING / PREPARATORY; characterization work is PREPARATORY with "no src diffs" guards.
- **Flow metrics:** start lightweight cycle-time capture (commit-date deltas per story) to convert the UNKNOWN flow scores into data.
- **Retrospective** after EPIC A: rework rate, budget breaches, assumption failures, mode check → refine EPICs B–G.
- **Next evaluation:** 2026-07-12 (monthly while active); re-score Delivery Flow and Product Value once tracker/telemetry data exists.
- **Open product decision to schedule with stakeholder:** VRT tool vs multi-tenant product — the vision fork silently drives architecture cost (RLS, OrgConfig) and should become an explicit ADR.
