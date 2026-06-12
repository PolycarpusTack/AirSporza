# ADR-004 — Raw-SQL migration files applied manually

**Status:** Accepted (backfilled 2026-06-12) · **Superseded by: ADR-007 (pending, story A-2)**

## Context

The schema needed constructs Prisma's declarative layer does not express: RLS policies and the
`set_tenant_context` function (ADR-002), the outbox NOTIFY trigger (ADR-001), partial/performance
indexes, and data backfills. `prisma migrate` was never initialized; under delivery pressure the
path of least resistance was hand-written SQL.

## Decision (as made historically — recorded, not endorsed)

Schema changes are written as flat `.sql` files in `backend/prisma/migrations/` (now **31 files**
plus one `.ts` seed script, e.g. `add_tenant_id_and_rls.sql`, `add_outbox.sql`,
`import_schema.sql`) and applied **manually via `docker exec`** against the compose Postgres
(`sporza-db`). `schema.prisma` remains the source of truth for the generated client; applied-state
is tracked by hand in `STATUS.md`. Local prototyping may use `prisma db push`.

## Alternatives considered

- **`prisma migrate dev` from the start** — auditable `_prisma_migrations` ledger; rejected at the time as friction for RLS/trigger SQL (custom SQL *can* be embedded in generated migrations, which ADR-007 will exploit).
- **External migration tool (Flyway/sqitch)** — solves the ledger, adds a second schema toolchain beside Prisma.
- **`db push` only** — no history at all; acceptable for prototypes, not for a live DB.

## Consequences

- **No machine-readable ledger:** "is this migration applied?" is archaeology; `STATUS.md` lists possibly-unapplied files, and the Teams Phases 0–2 schema (`Team` columns, `TeamCompetition`) is applied to **no** database — the 2026-06-12 evaluation's #1 critical finding.
- Manual `docker exec` applies are untracked and unrepeatable (tampering/repudiation surface).
- Blocks DB-in-CI (nothing can build a database from history alone) and the Prisma 5→7 upgrade (EPIC E).
- Paydown path: story A-2 — audit + verified backup → `0_init` baseline + `migrate resolve` → legacy files retired to `migrations_legacy/` → `prisma migrate` owns history (ADR-007).

**Review date:** at story A-2 completion (ADR-007 supersedes this record)
