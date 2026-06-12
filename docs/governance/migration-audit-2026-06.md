# Migration Audit — 2026-06-12

_Task A-2-T1 deliverable. Input contract for A-2-T2 (baseline onto `prisma migrate`)._

## Environments (ASM-3 resolution)

| Instance | Port | Server | Database | Verdict |
|---|---|---|---|---|
| **Live (authoritative)** | `localhost:5433` | PostgreSQL 17.6 (Windows service) | `sporza_planner`, 60 tables, 71 events, 1 tenant, 4 users, 48 RLS policies | The DB `backend/.env` targets. **This is the baseline target.** |
| Abandoned | `localhost:5432` | PostgreSQL 16 (Windows service) | `sporza_planner`, 66 tables, snake_case schema (`federations`, `sports_events`, `canonical_teams`…) | Pre-rewrite dev artifact; matches no current Prisma model set. **Out of scope** — flag for manual deletion when convenient. |

There is **no Docker** on this machine; the `docker exec sporza-db` apply path in STATUS.md refers to a defunct environment. Schema on the live DB was evidently applied via `prisma db push` plus selective manual SQL.

## Backup (ASM-4 resolution — PASS)

- **File:** `C:\Projects\Planza\backups\sporza_planner-2026-06-12.dump` (`pg_dump -Fc`, 291 KB)
- **Restore verified:** restored into scratch DB `sporza_restore_test` → 60 tables, 71 events ✓, scratch dropped.
- **Restore command:** `"C:\Program Files\PostgreSQL\17\bin\pg_restore" -d postgresql://sporza:<pw>@localhost:5433/sporza_planner --clean --no-owner backups\sporza_planner-2026-06-12.dump`
- `backups/` must stay untracked (gitignore entry added in this story).

## Method

1. `prisma migrate diff --from-url <live> --to-schema-datamodel schema.prisma --script` → forward delta (what's missing in DB).
2. Reverse diff → drift check (what's in DB but not schema). Result: **exact mirror of forward delta → zero unexplained drift.**
3. Targeted catalog queries for objects Prisma 5 cannot model: triggers, functions, RLS policies, expression indexes, partial unique indexes.

## Findings matrix

### Applied (29 of 31 `.sql` files) — evidence: zero Prisma-visible drift + targeted checks

All Prisma-modelable objects from these files exist on the live DB. Spot-verified: `WebhookEndpoint`/`WebhookDelivery` tables ✓, `Event.onDemandChannel` ✓, 48 RLS policies on 48 tables ✓ (`add_tenant_id_and_rls.sql`), `WebhookDelivery_webhookId_outboxEventId_key` ✓, helper functions `update_updated_at`, `cleanup_expired_locks`, `set_tenant_context` ✓.

> **STATUS.md correction:** the two migrations STATUS.md (2026-03-04) lists as pending — `add_webhook_tables.sql` and `add_on_demand_channel.sql` — are **both applied**. STATUS.md is stale on this point.

### NOT applied — truly-pending legacy SQL (scope for A-2-T2)

| Item | Source file | Evidence | Impact |
|---|---|---|---|
| `notify_outbox_event()` function + `outbox_event_notify` trigger | `add_outbox_notify_trigger.sql` (entire file) | `pg_trigger`/`pg_proc`: absent | Outbox consumer silently falls back to 1s polling instead of LISTEN/NOTIFY |
| `event_court_day_idx` (expression index on `sportMetadata->>'court_id'`) | `add_performance_indexes.sql` (partial apply — its Prisma-modelable indexes exist) | `pg_indexes`: absent | Cascade court+date queries unindexed — full scans on the engine's hot path |
| `BroadcastSlot_tenant_event_autolinked_key` (partial unique index) | `add_performance_followup_indexes.sql` (partial apply) | `pg_indexes`: absent | The 1:1 Event↔auto-linked-slot invariant is **not DB-enforced** — application code is the only guard |

### Superseded — do NOT apply (archive as-is)

| Item | Reason |
|---|---|
| `import_schema.sql` | Written for the old snake_case schema (`import_records`, `merge_candidates`…). The live DB has the PascalCase equivalents via `db push`. Its three partial indexes reference tables that don't exist on the live DB. |
| `seed_integrations_from_import_sources.ts` | One-off data script, not schema. |

### Pending schema deltas with NO migration file (from forward diff)

| Delta | Origin | Destination |
|---|---|---|
| `Contract.blackoutPeriods JSONB NOT NULL DEFAULT '[]'` | Rights-validation work — schema.prisma changed, migration never written | Include in A-2-T2 baseline handling (see note) |
| `Team.sportId/canonicalTeamId/notes/isManaged` + `TeamCompetition` table + 2 FKs + 3 indexes | Teams Phases 0–2 (branch `feat/teams-repository-phase0`) | **A-2-T3** — the first real `prisma migrate` migration |

> **A-2-T2 note:** the `0_init` baseline must be generated from the live DB state (current schema.prisma **minus** the pending deltas above), or equivalently: apply `blackoutPeriods` + truly-pending legacy SQL first, then baseline from `--from-empty --to-schema-datamodel` will still exclude Team/TeamCompetition only if generated before that migration is created. Decision recorded in A-2-T2.

## Unexplained diff lines

None. Every line of both diffs is accounted for by the two pending-delta groups above.

## Quality-gate checklist

- [x] Backup taken and restore-verified on scratch DB
- [x] Every diff line explained
- [x] Non-Prisma-modelable objects audited (triggers, functions, policies, expression/partial indexes)
- [x] ASM-3 answered: 1 authoritative env (+1 abandoned, out of scope)
- [x] ASM-4 answered: PASS — story A-2 proceeds
