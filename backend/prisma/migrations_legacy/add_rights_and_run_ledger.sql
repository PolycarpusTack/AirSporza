-- Rights & Run Ledger tables for broadcast middleware
-- Run: docker exec -i sporza-db psql -U sporza -d sporza_planner < backend/prisma/migrations/add_rights_and_run_ledger.sql

-- Enums
DO $$ BEGIN
  CREATE TYPE "CoverageType" AS ENUM ('LIVE', 'HIGHLIGHTS', 'DELAYED', 'CLIP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "Platform" AS ENUM ('LINEAR', 'OTT', 'SVOD', 'AVOD', 'PPV', 'STREAMING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RunType" AS ENUM ('LIVE', 'CONTINUATION', 'TAPE_DELAY', 'HIGHLIGHTS', 'CLIP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RECONCILED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RightsPolicy table
CREATE TABLE IF NOT EXISTS "RightsPolicy" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"             UUID NOT NULL,
  "competitionId"        INTEGER NOT NULL,
  "seasonId"             INTEGER,
  "territory"            TEXT[] DEFAULT '{}',
  "platforms"            "Platform"[] DEFAULT '{}',
  "coverageType"         "CoverageType" NOT NULL DEFAULT 'LIVE',
  "maxLiveRuns"          INTEGER,
  "maxPickRunsPerRound"  INTEGER,
  "windowStartUtc"       TIMESTAMPTZ,
  "windowEndUtc"         TIMESTAMPTZ,
  "tapeDelayHoursMin"    INTEGER,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RightsPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RightsPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "RightsPolicy_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "RightsPolicy_tenantId_idx" ON "RightsPolicy"("tenantId");

-- RunLedger table
CREATE TABLE IF NOT EXISTS "RunLedger" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"        UUID NOT NULL,
  "broadcastSlotId" UUID NOT NULL,
  "eventId"         INTEGER NOT NULL,
  "channelId"       INTEGER NOT NULL,
  "runType"         "RunType" NOT NULL DEFAULT 'LIVE',
  "parentRunId"     UUID,
  "startedAtUtc"    TIMESTAMPTZ,
  "endedAtUtc"      TIMESTAMPTZ,
  "durationMin"     INTEGER,
  "status"          "RunStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RunLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RunLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "RunLedger_broadcastSlotId_fkey" FOREIGN KEY ("broadcastSlotId") REFERENCES "BroadcastSlot"("id") ON DELETE RESTRICT,
  CONSTRAINT "RunLedger_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "RunLedger"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "RunLedger_tenantId_broadcastSlotId_runType_key" ON "RunLedger"("tenantId", "broadcastSlotId", "runType");
CREATE INDEX IF NOT EXISTS "RunLedger_tenantId_idx" ON "RunLedger"("tenantId");
CREATE INDEX IF NOT EXISTS "RunLedger_eventId_idx" ON "RunLedger"("eventId");

-- Enable RLS
ALTER TABLE "RightsPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RunLedger" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_rights_policy ON "RightsPolicy"
    USING ("tenantId"::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_run_ledger ON "RunLedger"
    USING ("tenantId"::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
