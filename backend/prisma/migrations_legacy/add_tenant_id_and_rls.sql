-- =============================================================================
-- Migration: Add tenantId to all existing tables + Row Level Security
-- =============================================================================

DO $$
DECLARE
  default_tid UUID;
BEGIN
  SELECT id INTO default_tid FROM "Tenant" WHERE slug = 'default';

  IF default_tid IS NULL THEN
    RAISE EXCEPTION 'Default tenant not found. Run add_tenant.sql first.';
  END IF;

  -- =========================================================================
  -- Add tenantId column to each table, backfill, make NOT NULL, add FK
  -- =========================================================================

  -- User
  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "User" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");

  -- Sport
  ALTER TABLE "Sport" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "Sport" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "Sport" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "Sport" ADD CONSTRAINT "Sport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "Sport_tenantId_idx" ON "Sport"("tenantId");

  -- Competition
  ALTER TABLE "Competition" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "Competition" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "Competition" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "Competition" ADD CONSTRAINT "Competition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "Competition_tenantId_idx" ON "Competition"("tenantId");

  -- Event
  ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "Event" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "Event" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "Event_tenantId_idx" ON "Event"("tenantId");

  -- TechPlan
  ALTER TABLE "TechPlan" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "TechPlan" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "TechPlan" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "TechPlan" ADD CONSTRAINT "TechPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "TechPlan_tenantId_idx" ON "TechPlan"("tenantId");

  -- Contract
  ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "Contract" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "Contract" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "Contract_tenantId_idx" ON "Contract"("tenantId");

  -- Encoder
  ALTER TABLE "Encoder" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "Encoder" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "Encoder" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "Encoder" ADD CONSTRAINT "Encoder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "Encoder_tenantId_idx" ON "Encoder"("tenantId");

  -- EncoderLock
  ALTER TABLE "EncoderLock" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "EncoderLock" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "EncoderLock" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "EncoderLock" ADD CONSTRAINT "EncoderLock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "EncoderLock_tenantId_idx" ON "EncoderLock"("tenantId");

  -- Notification
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "Notification" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "Notification_tenantId_idx" ON "Notification"("tenantId");

  -- SavedView
  ALTER TABLE "SavedView" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "SavedView" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "SavedView" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "SavedView_tenantId_idx" ON "SavedView"("tenantId");

  -- Resource
  ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "Resource" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "Resource" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "Resource" ADD CONSTRAINT "Resource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "Resource_tenantId_idx" ON "Resource"("tenantId");

  -- ResourceAssignment
  ALTER TABLE "ResourceAssignment" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "ResourceAssignment" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "ResourceAssignment" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "ResourceAssignment_tenantId_idx" ON "ResourceAssignment"("tenantId");

  -- CrewMember (mapped to crew_members)
  ALTER TABLE "crew_members" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "crew_members" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "crew_members" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "crew_members_tenantId_idx" ON "crew_members"("tenantId");

  -- CrewTemplate (mapped to crew_templates)
  ALTER TABLE "crew_templates" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "crew_templates" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "crew_templates" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "crew_templates" ADD CONSTRAINT "crew_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "crew_templates_tenantId_idx" ON "crew_templates"("tenantId");

  -- AuditLog
  ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "AuditLog" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

  -- AppSetting
  ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "AppSetting" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "AppSetting" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "AppSetting_tenantId_idx" ON "AppSetting"("tenantId");

  -- WebhookEndpoint
  ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "WebhookEndpoint" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "WebhookEndpoint" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "WebhookEndpoint_tenantId_idx" ON "WebhookEndpoint"("tenantId");

  -- WebhookDelivery
  ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "WebhookDelivery" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "WebhookDelivery" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "WebhookDelivery_tenantId_idx" ON "WebhookDelivery"("tenantId");

  -- FieldDefinition
  ALTER TABLE "FieldDefinition" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "FieldDefinition" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "FieldDefinition" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "FieldDefinition" ADD CONSTRAINT "FieldDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "FieldDefinition_tenantId_idx" ON "FieldDefinition"("tenantId");

  -- DropdownList
  ALTER TABLE "DropdownList" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "DropdownList" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "DropdownList" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "DropdownList" ADD CONSTRAINT "DropdownList_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "DropdownList_tenantId_idx" ON "DropdownList"("tenantId");

  -- DropdownOption
  ALTER TABLE "DropdownOption" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "DropdownOption" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "DropdownOption" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "DropdownOption" ADD CONSTRAINT "DropdownOption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "DropdownOption_tenantId_idx" ON "DropdownOption"("tenantId");

  -- CustomFieldValue
  ALTER TABLE "CustomFieldValue" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "CustomFieldValue" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "CustomFieldValue" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "CustomFieldValue_tenantId_idx" ON "CustomFieldValue"("tenantId");

  -- MandatoryFieldConfig
  ALTER TABLE "MandatoryFieldConfig" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "MandatoryFieldConfig" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "MandatoryFieldConfig" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "MandatoryFieldConfig" ADD CONSTRAINT "MandatoryFieldConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "MandatoryFieldConfig_tenantId_idx" ON "MandatoryFieldConfig"("tenantId");

  -- ImportSource
  ALTER TABLE "ImportSource" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "ImportSource" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "ImportSource" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "ImportSource" ADD CONSTRAINT "ImportSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "ImportSource_tenantId_idx" ON "ImportSource"("tenantId");

  -- ImportJob
  ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "ImportJob" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "ImportJob" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "ImportJob_tenantId_idx" ON "ImportJob"("tenantId");

  -- ImportRecord
  ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "ImportRecord" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "ImportRecord" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "ImportRecord_tenantId_idx" ON "ImportRecord"("tenantId");

  -- ImportSourceLink
  ALTER TABLE "ImportSourceLink" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "ImportSourceLink" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "ImportSourceLink" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "ImportSourceLink" ADD CONSTRAINT "ImportSourceLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "ImportSourceLink_tenantId_idx" ON "ImportSourceLink"("tenantId");

  -- MergeCandidate
  ALTER TABLE "MergeCandidate" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "MergeCandidate" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "MergeCandidate" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "MergeCandidate" ADD CONSTRAINT "MergeCandidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "MergeCandidate_tenantId_idx" ON "MergeCandidate"("tenantId");

  -- ImportDeadLetter
  ALTER TABLE "ImportDeadLetter" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "ImportDeadLetter" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "ImportDeadLetter" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "ImportDeadLetter" ADD CONSTRAINT "ImportDeadLetter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "ImportDeadLetter_tenantId_idx" ON "ImportDeadLetter"("tenantId");

  -- ImportRateLimit
  ALTER TABLE "ImportRateLimit" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "ImportRateLimit" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "ImportRateLimit" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "ImportRateLimit" ADD CONSTRAINT "ImportRateLimit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "ImportRateLimit_tenantId_idx" ON "ImportRateLimit"("tenantId");

  -- FieldProvenance
  ALTER TABLE "FieldProvenance" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "FieldProvenance" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "FieldProvenance" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "FieldProvenance" ADD CONSTRAINT "FieldProvenance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "FieldProvenance_tenantId_idx" ON "FieldProvenance"("tenantId");

  -- CanonicalTeam
  ALTER TABLE "CanonicalTeam" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "CanonicalTeam" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "CanonicalTeam" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "CanonicalTeam" ADD CONSTRAINT "CanonicalTeam_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "CanonicalTeam_tenantId_idx" ON "CanonicalTeam"("tenantId");

  -- CanonicalCompetition
  ALTER TABLE "CanonicalCompetition" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "CanonicalCompetition" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "CanonicalCompetition" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "CanonicalCompetition" ADD CONSTRAINT "CanonicalCompetition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "CanonicalCompetition_tenantId_idx" ON "CanonicalCompetition"("tenantId");

  -- CanonicalVenue
  ALTER TABLE "CanonicalVenue" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "CanonicalVenue" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "CanonicalVenue" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "CanonicalVenue" ADD CONSTRAINT "CanonicalVenue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "CanonicalVenue_tenantId_idx" ON "CanonicalVenue"("tenantId");

  -- TeamAlias
  ALTER TABLE "TeamAlias" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "TeamAlias" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "TeamAlias" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "TeamAlias" ADD CONSTRAINT "TeamAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "TeamAlias_tenantId_idx" ON "TeamAlias"("tenantId");

  -- CompetitionAlias
  ALTER TABLE "CompetitionAlias" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "CompetitionAlias" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "CompetitionAlias" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "CompetitionAlias" ADD CONSTRAINT "CompetitionAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "CompetitionAlias_tenantId_idx" ON "CompetitionAlias"("tenantId");

  -- VenueAlias
  ALTER TABLE "VenueAlias" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "VenueAlias" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "VenueAlias" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "VenueAlias" ADD CONSTRAINT "VenueAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "VenueAlias_tenantId_idx" ON "VenueAlias"("tenantId");

  -- SyncHistory
  ALTER TABLE "SyncHistory" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "SyncHistory" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "SyncHistory" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "SyncHistory" ADD CONSTRAINT "SyncHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "SyncHistory_tenantId_idx" ON "SyncHistory"("tenantId");

  -- ImportSchedule
  ALTER TABLE "ImportSchedule" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
  UPDATE "ImportSchedule" SET "tenantId" = default_tid WHERE "tenantId" IS NULL;
  ALTER TABLE "ImportSchedule" ALTER COLUMN "tenantId" SET NOT NULL;
  ALTER TABLE "ImportSchedule" ADD CONSTRAINT "ImportSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  CREATE INDEX IF NOT EXISTS "ImportSchedule_tenantId_idx" ON "ImportSchedule"("tenantId");

END $$;

-- =============================================================================
-- Enable Row Level Security on all tables
-- =============================================================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Competition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TechPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Encoder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EncoderLock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Resource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResourceAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crew_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crew_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEndpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FieldDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DropdownList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DropdownOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomFieldValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MandatoryFieldConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportSourceLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MergeCandidate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportDeadLetter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportRateLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FieldProvenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CanonicalTeam" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CanonicalCompetition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CanonicalVenue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamAlias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompetitionAlias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VenueAlias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportSchedule" ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS helper function: sets tenant context for the current transaction
-- =============================================================================

CREATE OR REPLACE FUNCTION set_tenant_context(tid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('app.tenant_id', tid::text, true);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Create RLS policies for tenant isolation
-- =============================================================================

CREATE POLICY tenant_isolation ON "User" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "Sport" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "Competition" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "Event" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "TechPlan" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "Contract" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "Encoder" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "EncoderLock" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "Notification" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "SavedView" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "Resource" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "ResourceAssignment" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "crew_members" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "crew_templates" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "AuditLog" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "AppSetting" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "WebhookEndpoint" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "WebhookDelivery" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "FieldDefinition" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "DropdownList" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "DropdownOption" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "CustomFieldValue" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "MandatoryFieldConfig" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "ImportSource" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "ImportJob" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "ImportRecord" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "ImportSourceLink" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "MergeCandidate" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "ImportDeadLetter" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "ImportRateLimit" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "FieldProvenance" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "CanonicalTeam" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "CanonicalCompetition" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "CanonicalVenue" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "TeamAlias" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "CompetitionAlias" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "VenueAlias" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "SyncHistory" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON "ImportSchedule" USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
