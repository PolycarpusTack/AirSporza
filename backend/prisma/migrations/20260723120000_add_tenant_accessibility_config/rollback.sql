-- RC-5-T1 ROLLBACK (manual operator script) — NOT a Prisma down-migration.
--
-- The repo is forward-only (ADR-004/007): Prisma owns history, and data rollback is
-- the verified pg_dump backup. There is no down.sql mechanism, so this file is a
-- documented manual reversal for the tenant-accessibility-config change-unit. To
-- fully revert, an operator also removes the 20260723120000 _prisma_migrations row
-- after running the statement below.
--
-- Behavioral note: dropping the table returns EVERY tenant to the global constant
-- defaults in src/config/accessibility.ts (the loader's no-row fallback) — no other
-- surface stores these values, so no further cleanup is needed.

-- 1. The table (drops the tenant_isolation policy, the unique index, and the FK with it).
DROP TABLE IF EXISTS "TenantAccessibilityConfig";
