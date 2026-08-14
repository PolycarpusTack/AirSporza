-- FM1-4-T0 ROLLBACK (manual operator script) — NOT a Prisma down-migration.
--
-- The repo is forward-only (ADR-004/007): Prisma owns history, and data rollback is
-- the verified pg_dump backup. There is no down.sql mechanism, so this file is a
-- documented manual reversal for the action-item-resolution change-unit. To fully
-- revert, an operator also removes the 20260814200000 _prisma_migrations row after
-- running the statement below.
--
-- Behavioral note: dropping the table discards any accumulated resolutions
-- (they are an acknowledgment overlay only, per FM1-4 AC — no derived-item data
-- is lost; on the next load every previously-resolved-but-still-derived item
-- simply reappears undimmed, which is a UX regression, not a data-loss risk).

-- 1. The table (drops the tenant_isolation policy, indexes, and FKs with it).
DROP TABLE IF EXISTS "ActionItemResolution";
