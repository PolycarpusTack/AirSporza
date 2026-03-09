-- fix_schema_gaps.sql — Consolidates all missing columns, FKs, indexes, RLS fixes
-- Run: docker exec -i sporza-db psql -U sporza -d sporza_planner < backend/prisma/migrations/fix_schema_gaps.sql

-- =============================================================================
-- 1. RunLedger.contractId — add column + FK + index
-- =============================================================================
ALTER TABLE "RunLedger" ADD COLUMN IF NOT EXISTS "contractId" INTEGER REFERENCES "Contract"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "RunLedger_contractId_idx" ON "RunLedger"("contractId");

-- =============================================================================
-- 2. RightsPolicy.seasonId FK — add constraint + index
-- =============================================================================
DO $$ BEGIN
  ALTER TABLE "RightsPolicy" ADD CONSTRAINT "RightsPolicy_seasonId_fkey"
    FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "RightsPolicy_seasonId_idx" ON "RightsPolicy"("seasonId");

-- =============================================================================
-- 3. Venue/Team/Court RLS — enable RLS and add policies
-- =============================================================================
ALTER TABLE "Venue" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY venue_tenant_isolation ON "Venue"
    USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY team_tenant_isolation ON "Team"
    USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Court" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY court_tenant_isolation ON "Court"
    USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 4. Season/Stage/Round RLS fix — add missing `true` flag to current_setting
-- =============================================================================
DROP POLICY IF EXISTS tenant_isolation ON "Season";
CREATE POLICY season_tenant_isolation ON "Season"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "Stage";
CREATE POLICY stage_tenant_isolation ON "Stage"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON "Round";
CREATE POLICY round_tenant_isolation ON "Round"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- =============================================================================
-- 5. BroadcastSlot FK gaps — conditionalTargetChannelId + fallbackEventId
-- =============================================================================
DO $$ BEGIN
  ALTER TABLE "BroadcastSlot" ADD CONSTRAINT "BroadcastSlot_conditionalTargetChannelId_fkey"
    FOREIGN KEY ("conditionalTargetChannelId") REFERENCES "Channel"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "BroadcastSlot_conditionalTargetChannelId_idx" ON "BroadcastSlot"("conditionalTargetChannelId");

DO $$ BEGIN
  ALTER TABLE "BroadcastSlot" ADD CONSTRAINT "BroadcastSlot_fallbackEventId_fkey"
    FOREIGN KEY ("fallbackEventId") REFERENCES "Event"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "BroadcastSlot_fallbackEventId_idx" ON "BroadcastSlot"("fallbackEventId");

-- =============================================================================
-- 6. RunLedger.channelId FK
-- =============================================================================
DO $$ BEGIN
  ALTER TABLE "RunLedger" ADD CONSTRAINT "RunLedger_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "RunLedger_channelId_idx" ON "RunLedger"("channelId");

-- =============================================================================
-- 7. ChannelSwitchAction.toChannelId FK
-- =============================================================================
DO $$ BEGIN
  ALTER TABLE "ChannelSwitchAction" ADD CONSTRAINT "ChannelSwitchAction_toChannelId_fkey"
    FOREIGN KEY ("toChannelId") REFERENCES "Channel"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "ChannelSwitchAction_toChannelId_idx" ON "ChannelSwitchAction"("toChannelId");

-- =============================================================================
-- 8. Channel deletion — change BroadcastSlot/ScheduleDraft/ScheduleVersion from RESTRICT to SET NULL
-- =============================================================================
ALTER TABLE "BroadcastSlot" DROP CONSTRAINT IF EXISTS "BroadcastSlot_channelId_fkey";
ALTER TABLE "BroadcastSlot" ADD CONSTRAINT "BroadcastSlot_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL;

ALTER TABLE "ScheduleDraft" DROP CONSTRAINT IF EXISTS "ScheduleDraft_channelId_fkey";
ALTER TABLE "ScheduleDraft" ADD CONSTRAINT "ScheduleDraft_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL;

ALTER TABLE "ScheduleVersion" DROP CONSTRAINT IF EXISTS "ScheduleVersion_channelId_fkey";
ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL;

-- =============================================================================
-- 9. ScheduleVersion unique constraint on (draftId, versionNumber)
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleVersion_draftId_versionNumber_key"
  ON "ScheduleVersion"("draftId", "versionNumber");

-- =============================================================================
-- 10. Sport/Encoder/Resource — tenant-scoped unique
-- =============================================================================
ALTER TABLE "Sport" DROP CONSTRAINT IF EXISTS "Sport_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Sport_tenantId_name_key" ON "Sport"("tenantId", "name");

ALTER TABLE "Encoder" DROP CONSTRAINT IF EXISTS "Encoder_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Encoder_tenantId_name_key" ON "Encoder"("tenantId", "name");

ALTER TABLE "Resource" DROP CONSTRAINT IF EXISTS "Resource_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Resource_tenantId_name_key" ON "Resource"("tenantId", "name");

-- =============================================================================
-- 11. updatedAt defaults
-- =============================================================================
ALTER TABLE "RightsPolicy" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ChannelSwitchAction" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AdapterConfig" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- =============================================================================
-- 12. Drop deprecated column index
-- =============================================================================
DROP INDEX IF EXISTS "Event_linearChannel_idx";
