# ADR-007: Migration strategy — `prisma migrate` ownership with a pg_dump baseline

**Status:** Accepted (2026-06-12) · Supersedes ADR-004

## Context

Schema history was 31 hand-applied raw SQL files (ADR-004) plus `prisma db push`, tracked by memory and a stale STATUS.md. The A-2-T1 audit (docs/governance/migration-audit-2026-06.md) found: one entire file never applied (outbox LISTEN/NOTIFY trigger), one file partially applied (missing cascade expression index + autoLinked partial unique), one schema change with no migration file at all (`Contract.blackoutPeriods`), and a STATUS.md that wrongly listed two applied migrations as pending. No `_prisma_migrations` ledger existed.

## Decision

1. **`prisma migrate` owns schema history.** The baseline `0_init` is a `pg_dump --schema-only --no-owner --no-privileges` of the live DB taken **after** applying the truly-pending legacy SQL — so it includes everything Prisma cannot model (48 RLS policies, `outbox_event_notify` trigger, helper functions, `event_court_day_idx` expression index, `BroadcastSlot_tenant_event_autolinked_key` partial unique).
2. `0_init` was marked applied on the live DB via `prisma migrate resolve --applied 0_init` (metadata-only).
3. Legacy files are archived verbatim in `backend/prisma/migrations_legacy/` for forensics — never apply them again.
4. **`db push` is local-prototyping-only.** Shared/live databases change exclusively via `prisma migrate dev` (create) / `prisma migrate deploy` (apply). Root `setup` scripts now run `migrate deploy`.
5. Every history change is verified by `scripts/verify-migrations.sh` (disposable DB → `migrate deploy` → `migrate status` → object assertions); wired into CI in A-2-T4.

### MigrationWorkflow (contract snapshot)

```
Create:  cd backend && npx prisma migrate dev --name <slug>     # against local dev DB
Apply:   cd backend && npx prisma migrate deploy                # any environment
Verify:  DATABASE_URL=<url> bash scripts/verify-migrations.sh   # from repo root
Status:  cd backend && npx prisma migrate status                # drift check
```

## pg_dump baseline gotchas (encountered and fixed)

- PG 17.6 `pg_dump` emits `\restrict`/`\unrestrict` psql meta-commands — must be stripped (`migrate deploy` is not psql).
- The dump's `SELECT pg_catalog.set_config('search_path', '', false);` empties the session search path and breaks Prisma's `_prisma_migrations` bookkeeping (P1014) — must be removed (all dumped objects are schema-qualified anyway).
- The dump contains `SET transaction_timeout` (PG17+ syntax): **CI and any fresh environment must use postgres:17**, matching the live server (17.6).

## Alternatives considered

- **`migrate diff --from-empty --to-schema-datamodel` baseline:** rejected — loses every non-Prisma-modelable object (RLS policies above all); a CI database built from it would silently lack tenant isolation.
- **Keep raw SQL + discipline:** rejected — the audit is direct evidence that discipline didn't hold.
- **Squash legacy files into ordered Prisma migrations:** rejected — archaeology cost with no benefit over a verified baseline.

## Consequences

- "Is this applied?" is now answered by `prisma migrate status` (drift = 0 is a CI-checked SLO from A-2-T4).
- Rollback of the baseline itself = delete `_prisma_migrations` rows + restore file layout (metadata-only); data rollback = the verified 2026-06-12 `pg_dump` backup.
- The abandoned PG16 instance on port 5432 (old snake_case schema) is out of scope — flagged for manual deletion.

## Review date

After EPIC G (first feature-driven migrations beyond Teams) or 2026-12-12, whichever first.
