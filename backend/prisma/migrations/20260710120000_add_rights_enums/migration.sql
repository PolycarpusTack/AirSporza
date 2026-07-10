-- RD-2-T1 (ADR-015 §2) — rights enums, part 1 of 2.
--
-- SEQUENCING (ADR-004/007, ADR-015 §2): `ALTER TYPE ... ADD VALUE` cannot run in
-- the same transaction that the value is later used in. Prisma wraps each
-- migration file in one transaction, so the ARCHIVE addition lives in its OWN
-- migration, ahead of 20260710120001 which CREATEs the RightsWindow table + the
-- backfill that casts to the new enum values. Keep these two files separate.

-- CreateEnum
CREATE TYPE "ExclusivityTier" AS ENUM ('EXCLUSIVE', 'NON_EXCLUSIVE', 'OPEN_NET');

-- AlterEnum
ALTER TYPE "CoverageType" ADD VALUE IF NOT EXISTS 'ARCHIVE';
