# Runbook — CI & Migrations

_A-2-T4 deliverable. Audience: the developer (or agent) responding to a red pipeline or schema drift._

## System summary

- **CI:** `.github/workflows/ci.yml`, two jobs per push — `quality` (typecheck/lint/fitness/tests, both workspaces) and `migrations` (postgres:17 service container → `verify-migrations.sh` → `migrate deploy` + `status` → DB-backed smoke test).
- **Schema ownership:** `prisma migrate` (ADR-007). History = `backend/prisma/migrations/` (`0_init` baseline + real migrations). Legacy raw SQL in `migrations_legacy/` is forensic only.
- **The `docker exec … psql < file.sql` apply path is RETIRED.** There is no Docker on the dev machine; the live DB is native PostgreSQL 17.6 on `localhost:5433` (see migration-audit-2026-06.md).

## How to change the schema

```bash
# 1. Edit backend/prisma/schema.prisma
# 2. Author the migration (interactive shells can use: npx prisma migrate dev --name <slug>)
#    Non-interactive equivalent:
mkdir backend/prisma/migrations/<timestamp>_<slug>
cd backend && npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_<slug>/migration.sql
# 3. Apply + record:
npx prisma migrate deploy
# 4. Verify:
npx prisma migrate status                                  # must say "up to date"
cd .. && DATABASE_URL=<url> bash scripts/verify-migrations.sh
```

`db:push` is for throwaway local prototyping only — never against the live/shared DB.

## Symptom → action

| Symptom | Checks | Action |
|---|---|---|
| `migrations` job red at **verify step** | Job log: which of the 7 assertion points failed? | A migration is missing an object Prisma can't model (policy/trigger/special index) — add it to the migration SQL by hand. |
| `migrations` job red at **migrate deploy** | Error code; usually a type/constraint conflict (e.g. the `@db.Uuid` vs text FK caught at A-2-T3) | Fix schema/migration; if the failed migration is recorded: `npx prisma migrate resolve --rolled-back <name>`, regenerate, redeploy. |
| `migrate status` reports **drift** on live | `npx prisma migrate diff --from-url <live> --to-schema-datamodel prisma/schema.prisma --script` | Someone changed the DB outside migrate. Encode the change as a migration (preferred) or revert the manual change. Never `resolve --applied` to silence drift you don't understand. |
| `quality` job red at **fitness function** | Log lists `file -> import` pairs | A service/import file imports from routes. Invert the dependency (move shared logic into a service). |
| Quality red at lint/typecheck/tests | Standard | Fix locally with the loop in `local-quality-loop.md`; all commands mirror CI exactly. |
| Outbox events not processing instantly (1s lag) | `SELECT count(*) FROM pg_trigger WHERE tgname='outbox_event_notify'` | Trigger missing → re-apply that portion of `0_init` (it is part of the baseline now). |

## Rollback

- **A bad migration on live:** restore from backup (`backups/sporza_planner-<date>.dump`, verified restorable):
  `pg_restore -d <live-url> --clean --no-owner <dump>` — then `migrate resolve` to re-sync the ledger.
- **The Teams migration specifically** (additive, documented down-path):
  `DROP TABLE "TeamCompetition"; ALTER TABLE "Team" DROP COLUMN "sportId", DROP COLUMN "canonicalTeamId", DROP COLUMN "notes", DROP COLUMN "isManaged";` then `DELETE FROM _prisma_migrations WHERE migration_name='20260612100000_add_team_repository';`
- **Baseline metadata only:** `DELETE FROM _prisma_migrations WHERE migration_name='0_init';` (does not touch schema).

## Environment facts (verified 2026-06-12)

- Live DB: `localhost:5433`, PostgreSQL **17.6**, db `sporza_planner` (`backend/.env`). CI must use `postgres:17` (the baseline dump uses PG17 syntax).
- A second, **abandoned** PG16 instance on `localhost:5432` holds an obsolete snake_case `sporza_planner` — do not use; delete when convenient.
- Backups: `backups/` (gitignored). Take one before any risky schema operation: `pg_dump -Fc -f backups/sporza_planner-$(date +%F).dump <live-url>`.

## SLOs

- CI pipeline < 10 min over last 20 runs (currently ~1–3 min).
- CI pass rate on main ≥ 95% / 30 days.
- Schema drift between `schema.prisma` and live DB = 0 (checked every `migrations` job run).
