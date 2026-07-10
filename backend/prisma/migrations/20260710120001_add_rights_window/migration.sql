-- RD-2-T1 (ADR-015 §1) — RightsWindow table, part 2 of 2.
-- Depends on 20260710120000_add_rights_enums (ExclusivityTier + CoverageType.ARCHIVE
-- must already be committed — enum values are unusable in the transaction that adds
-- them, hence the split).

-- CreateTable
CREATE TABLE "RightsWindow" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" INTEGER NOT NULL,
    "category" "CoverageType" NOT NULL,
    "exclusivity" "ExclusivityTier" NOT NULL DEFAULT 'NON_EXCLUSIVE',
    "territory" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "windowStartUtc" TIMESTAMPTZ,
    "windowEndUtc" TIMESTAMPTZ,
    "maxRuns" INTEGER,
    "holdbackHoursMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RightsWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RightsWindow_tenantId_idx" ON "RightsWindow"("tenantId");

-- CreateIndex
CREATE INDEX "RightsWindow_contractId_idx" ON "RightsWindow"("contractId");

-- AddForeignKey
ALTER TABLE "RightsWindow" ADD CONSTRAINT "RightsWindow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RightsWindow" ADD CONSTRAINT "RightsWindow_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: tenant_isolation ships in the SAME migration as the table (ADR-011 gate).
-- Shape is byte-identical to the ~48 existing tenant tables
-- (see 20260612170000_add_tenant_rls_coverage). Coverage now; enforcement binds
-- once the app connects as the non-owner planza_app role (ADR-011 layer 2).
ALTER TABLE "RightsWindow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RightsWindow" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

-- Pre-check (fail fast): Contract.coverageType is free-text String, so one
-- off-enum row would abort the whole migrate deploy with an opaque cast error
-- mid-transaction. Raise a clear, actionable exception listing offending ids
-- instead, so an operator can normalize the data before retrying.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(id::text, ', ') INTO bad FROM "Contract"
   WHERE "coverageType" NOT IN ('LIVE','HIGHLIGHTS','DELAYED','CLIP','ARCHIVE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'RD-2-T1 backfill: Contract(s) % have coverageType outside CoverageType; normalize before migrating', bad;
  END IF;
END $$;

-- Backfill (ADR-015 §1): exactly one window per existing contract, mirroring its
-- scalars. NULL maxLiveRuns/tapeDelayHoursMin stay NULL on the window (RD-1F
-- null-semantics — NO COALESCE/?? 0). Empty territory[]/platforms[] copy as-is
-- (= unrestricted, ADR-015 Acceptance record §4). exclusivity defaults
-- NON_EXCLUSIVE (no source data, open assumption 2). coverageType (plain String on
-- Contract) casts to the enum — valid for LIVE/HIGHLIGHTS/DELAYED/CLIP/ARCHIVE.
-- gen_random_uuid() is provided by the pgcrypto extension (created in 0_init).
INSERT INTO "RightsWindow" (id, "tenantId", "contractId", category, exclusivity, territory, platforms, "windowStartUtc", "windowEndUtc", "maxRuns", "holdbackHoursMin", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    c."tenantId",
    c.id,
    c."coverageType"::"CoverageType",
    'NON_EXCLUSIVE'::"ExclusivityTier",
    c.territory,
    c.platforms,
    c."windowStartUtc",
    c."windowEndUtc",
    c."maxLiveRuns",
    c."tapeDelayHoursMin",
    now(),
    now()
FROM "Contract" c;
