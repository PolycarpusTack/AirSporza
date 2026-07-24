-- SV-2-T1 ROLLBACK (manual operator script) — NOT a Prisma down-migration.
--
-- The repo is forward-only (ADR-004/007): Prisma owns history, and data rollback is
-- the verified pg_dump backup. There is no down.sql mechanism, so this file is a
-- documented manual reversal for the ripple-proposal change-unit. To fully revert,
-- an operator also removes the 20260723150000 _prisma_migrations row after running
-- the statements below.
--
-- Behavioral note: the capture path is flag-gated (`SCHEDULE_RIPPLE_ENABLED`,
-- default OFF) — the primary rollback is the flag (redeploy off, TD-27 posture);
-- dropping the table additionally discards any accumulated proposals (they are
-- advisory review items, never applied by SV-2 — no slot data is lost).

-- 1. The table (drops the tenant_isolation policy, indexes, and FKs with it).
DROP TABLE IF EXISTS "RippleProposal";

-- 2. The enums (safe once no column references them).
DROP TYPE IF EXISTS "RippleStatus";
DROP TYPE IF EXISTS "RippleSource";
