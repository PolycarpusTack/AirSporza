-- RC-2-T1 ROLLBACK (manual operator script) — NOT a Prisma down-migration.
--
-- The repo is forward-only (ADR-004/007): Prisma owns history, and data rollback is
-- the verified pg_dump backup. There is no down.sql mechanism, so this file is a
-- documented manual reversal for the accessibility-deliverables change-unit. To fully
-- revert, an operator also removes the 20260714120000 _prisma_migrations row after
-- running the statements below.
--
-- ORDER: reverse of forward application — table first (drops its policy/indexes/FKs),
-- then the enum types (only droppable once no column references them).

-- 1. The table (drops the tenant_isolation policy, indexes, and both FKs with it).
DROP TABLE IF EXISTS "AccessibilityDeliverable";

-- 2. The enum types (safe once the table above is gone — nothing references them).
DROP TYPE IF EXISTS "AccessibilityStatus";
DROP TYPE IF EXISTS "AccessibilityType";
