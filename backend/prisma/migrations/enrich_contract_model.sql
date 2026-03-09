-- Enrich Contract model with RightsPolicy fields (unification)
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "seasonId" INT REFERENCES "Season"(id) ON DELETE SET NULL;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "territory" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "coverageType" TEXT DEFAULT 'LIVE';
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "maxLiveRuns" INT;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "maxPickRunsPerRound" INT;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "windowStartUtc" TIMESTAMPTZ;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "windowEndUtc" TIMESTAMPTZ;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "tapeDelayHoursMin" INT;

-- Data migration: populate platforms[] from legacy boolean fields
UPDATE "Contract" SET platforms = ARRAY[]::TEXT[];
UPDATE "Contract" SET platforms = array_append(platforms, 'linear') WHERE "linearRights" = true;
UPDATE "Contract" SET platforms = array_append(platforms, 'on-demand') WHERE "maxRights" = true;
UPDATE "Contract" SET platforms = array_append(platforms, 'radio') WHERE "radioRights" = true;

-- Data migration: parse geoRestriction string into territory[]
UPDATE "Contract" SET territory = ARRAY["geoRestriction"]::TEXT[]
WHERE "geoRestriction" IS NOT NULL AND "geoRestriction" != '';

CREATE INDEX IF NOT EXISTS idx_contract_season ON "Contract"("seasonId");
