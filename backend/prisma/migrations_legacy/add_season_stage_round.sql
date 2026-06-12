-- Migration: add_season_stage_round
-- Adds Season, Stage, Round tables and links Event to them

-- Enums
DO $$ BEGIN
  CREATE TYPE "StageType" AS ENUM ('LEAGUE', 'GROUP', 'KNOCKOUT', 'QUALIFIER', 'TOURNAMENT_MAIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SchedulingMode" AS ENUM ('FIXED', 'FLOATING', 'WINDOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Season table
CREATE TABLE IF NOT EXISTS "Season" (
  "id"            SERIAL       PRIMARY KEY,
  "tenantId"      UUID         NOT NULL REFERENCES "Tenant"("id"),
  "competitionId" INTEGER      NOT NULL REFERENCES "Competition"("id"),
  "name"          TEXT         NOT NULL,
  "startDate"     DATE         NOT NULL,
  "endDate"       DATE         NOT NULL,
  "sportMetadata" JSONB        NOT NULL DEFAULT '{}',
  "createdAt"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "competitionId", "name")
);
CREATE INDEX IF NOT EXISTS "Season_tenantId_idx" ON "Season"("tenantId");

-- Stage table
CREATE TABLE IF NOT EXISTS "Stage" (
  "id"               SERIAL       PRIMARY KEY,
  "tenantId"         UUID         NOT NULL REFERENCES "Tenant"("id"),
  "seasonId"         INTEGER      NOT NULL REFERENCES "Season"("id"),
  "name"             TEXT         NOT NULL,
  "stageType"        "StageType"  NOT NULL,
  "sortOrder"        INTEGER      NOT NULL DEFAULT 0,
  "advancementRules" JSONB        NOT NULL DEFAULT '{}',
  "sportMetadata"    JSONB        NOT NULL DEFAULT '{}',
  "createdAt"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Stage_tenantId_idx" ON "Stage"("tenantId");

-- Round table
CREATE TABLE IF NOT EXISTS "Round" (
  "id"                 SERIAL       PRIMARY KEY,
  "tenantId"           UUID         NOT NULL REFERENCES "Tenant"("id"),
  "stageId"            INTEGER      NOT NULL REFERENCES "Stage"("id"),
  "name"               TEXT         NOT NULL,
  "roundNumber"        INTEGER      NOT NULL,
  "scheduledDateStart" DATE,
  "scheduledDateEnd"   DATE,
  "createdAt"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Round_tenantId_idx" ON "Round"("tenantId");

-- Add new columns to Event
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "seasonId"       INTEGER REFERENCES "Season"("id");
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "stageId"        INTEGER REFERENCES "Stage"("id");
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "roundId"        INTEGER REFERENCES "Round"("id");
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "schedulingMode" "SchedulingMode" NOT NULL DEFAULT 'FIXED';
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "sportMetadata"  JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "externalRefs"   JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "Event_seasonId_idx" ON "Event"("seasonId");
CREATE INDEX IF NOT EXISTS "Event_stageId_idx"  ON "Event"("stageId");
CREATE INDEX IF NOT EXISTS "Event_roundId_idx"  ON "Event"("roundId");

-- Enable RLS on new tables
ALTER TABLE "Season" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stage"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Round"  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON "Season" USING ("tenantId" = current_setting('app.tenant_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON "Stage" USING ("tenantId" = current_setting('app.tenant_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON "Round" USING ("tenantId" = current_setting('app.tenant_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
