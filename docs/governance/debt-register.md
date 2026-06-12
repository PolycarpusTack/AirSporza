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

## TD-1 — `ImportJobRunner.ts` god file

- **Artifact:** `backend/src/import/services/ImportJobRunner.ts` (**1660 lines** — verified)
- **Type:** code
- **Cause:** import pipeline grew stage-by-stage (fetch → normalize → dedupe → merge → provision) inside one class under delivery pressure; no extraction pass.
- **Principal:** L
- **Interest:** **high** — every import feature (new adapters, Players entity scope) navigates 1660 lines; change risk and review cost grow per touch.
- **Compounding:** **yes** — EPIC G (Players) would clone the team path through it; the checkpoint's "clone the team path" advice is explicitly superseded for this reason.
- **Servicing decision:** **pay down in EPIC C story C-1** (characterize, then split into stage modules) — hard prerequisite ordering: before EPIC G builds on it.
- **Origin:** 2026-06-12 evaluation (Code Health: 7 god files).

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
