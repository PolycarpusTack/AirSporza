# EPIC A — Phase Summary (2026-06-12)

_Core §4.3 checkpoint. EPIC A (Quality Loop Tracer Bullet & Governance Baseline) complete: 11/11 tasks, single session._

## What was built

- **CI quality loop** (`.github/workflows/ci.yml`): two jobs per push — typecheck/lint/fitness/tests (both workspaces) + postgres:17 migrations job (history verification, `migrate deploy`, drift check, DB-backed smoke through the RLS context path). Pipeline ~1–2 min (SLO < 10).
- **Frontend test harness**: Vitest 3 + RTL + jsdom (`vitest.config.ts`, `npm run test`); `computeReadiness` smoke tests; pre-existing dnd test adopted (2 files / 14 tests).
- **Fitness function FF-1** (`scripts/check-dependency-direction.mjs`): services/import must not import routes; proven red→green.
- **Migration baseline**: live DB owned by `prisma migrate` (`0_init` from PG17.6 pg_dump incl. RLS/triggers/special indexes); legacy SQL archived; `scripts/verify-migrations.sh` (7 assertion points); first real migration `add_team_repository` deployed — **Teams Phases 0–2 now live in the DB** (route smoke passed).
- **Governance**: DoD, Domain Glossary, ADR-001…007, Architecture Memory, debt register TD-1…11, migration audit, local-quality-loop doc, CI/migrations runbook — all under `docs/governance/`.

## What was learned (assumptions validated/invalidated)

- **ASM-2 ✓ npm** (stale pnpm field removed). **ASM-1 ✓** GitHub Actions. **ASM-4 ✓** backup taken + restore-verified.
- **ASM-3 ✗ partially**: TWO local Postgres instances found — live = native PG 17.6 on **:5433** (not Docker; docker-compose path was already dead); an abandoned snake_case PG16 DB on :5432 (flagged for deletion).
- **"Lint clean" was false**: 23 standing ESLint errors (fixed). "0 errors" claims had never been machine-checked.
- **STATUS.md was wrong in both directions**: its two "pending" migrations were applied; meanwhile the outbox LISTEN/NOTIFY trigger, the cascade expression index, and the autoLinked partial unique index were silently missing from the live DB (now applied — outbox latency restored to near-instant, cascade hot path indexed, 1:1 slot invariant DB-enforced).
- **First DB contact found a real schema bug**: `Team.canonicalTeamId @db.Uuid` vs text `CanonicalTeam.id` — FK impossible. Exactly the defect class the "runs against a database" DoD item exists for.
- PG 17.6 pg_dump baselines need surgery: strip `\restrict`/`\unrestrict` + the `search_path` reset (P1014); CI must use postgres:17.

## What changed from the plan

- `prisma migrate dev` is interactive-only → runbook documents the `migrate diff` + `deploy` non-interactive path.
- Baseline strategy: pg_dump (not `migrate diff --from-empty`) to preserve RLS policies — recorded in ADR-007.
- A-1-T4 used a zero-dep script instead of eslint `no-restricted-imports` (relative-path fragility).

## Debt movements

- Settled: migration drift (was "closest to tipping point"). New: none (TD-12 candidate: deprecated Node20 actions warning — upgrade actions when v5 lands; noted in register at next touch).
- Register unchanged otherwise: TD-1…11 active, next paydowns in EPIC B (TD-5, TD-6, TD-7).

## Mode check

DELIVERY preconditions now actually exist (CI, fitness function, DoD, glossary, ADRs, debt register). **Stay in DELIVERY.** Next: EPIC B (B-1 visibleByRoles is the security-priority story); EPIC G (Players) is now unblocked on its DB precondition but should still wait for C-1's import-stage extraction.
