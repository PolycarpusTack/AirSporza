-- RD-2-T1 ROLLBACK (manual operator script) — NOT a Prisma down-migration.
--
-- The repo is forward-only (ADR-004/007): Prisma owns history, and data rollback
-- is the verified pg_dump backup. There is no down.sql mechanism, so this file is
-- a documented manual reversal for the RightsWindow change-unit. To fully revert,
-- an operator also removes the two _prisma_migrations rows (20260710120001 then
-- 20260710120000) after running the applicable statements below.
--
-- ORDER: reverse of forward application — table first, enums last.

-- 1. Table (drops the tenant_isolation policy with it) — from 20260710120001.
DROP TABLE IF EXISTS "RightsWindow";

-- 2. Enum type — from 20260710120000. Only succeeds if no column still references
--    it (RightsWindow.exclusivity is gone once the table is dropped).
DROP TYPE IF EXISTS "ExclusivityTier";

-- 3. CoverageType.ARCHIVE — NOT auto-droppable.
--    PostgreSQL cannot remove a single value from an enum type. Reverting ARCHIVE
--    requires recreating "CoverageType" without it (ALTER TYPE RENAME + CREATE new
--    + column re-cast + DROP old), which touches every consumer of the enum
--    (Contract.coverageType is plain text and unaffected; RightsPolicy.coverageType
--    and RightsWindow.category are enum-typed). Left in place by design: an unused
--    dormant enum value is inert (ADR-015 open assumption 1). Do this only via the
--    pg_dump restore path if a true schema reversal is required.
