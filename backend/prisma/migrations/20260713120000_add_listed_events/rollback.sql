-- RC-1-T1 ROLLBACK (manual operator script) — NOT a Prisma down-migration.
--
-- The repo is forward-only (ADR-004/007): Prisma owns history, and data rollback
-- is the verified pg_dump backup. There is no down.sql mechanism, so this file is
-- a documented manual reversal for the Listed-Events change-unit. To fully revert,
-- an operator also removes the 20260713120000 _prisma_migrations row after running
-- the statements below.
--
-- ORDER: reverse of forward application — dependent additions first, table last.

-- 1. Channel free-to-air flag — from the AlterTable.
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "isFreeToAir";

-- 2. Event listed-category link (FK + index + column) — from the AlterTable.
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_listedCategoryId_fkey";
DROP INDEX IF EXISTS "Event_listedCategoryId_idx";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "listedCategoryId";

-- 3. The table (drops the tenant_isolation policy, its indexes and FKs with it).
DROP TABLE IF EXISTS "ListedEventCategory";
