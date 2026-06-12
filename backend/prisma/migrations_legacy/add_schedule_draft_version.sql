-- Schedule Draft & Version tables for broadcast middleware
-- Run: docker exec -i sporza-db psql -U sporza -d sporza_planner < backend/prisma/migrations/add_schedule_draft_version.sql

-- DraftStatus enum
DO $$ BEGIN
  CREATE TYPE "DraftStatus" AS ENUM ('EDITING', 'VALIDATING', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ScheduleDraft table
CREATE TABLE IF NOT EXISTS "ScheduleDraft" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"       UUID         NOT NULL,
  "channelId"      INTEGER      NOT NULL,
  "dateRangeStart" DATE         NOT NULL,
  "dateRangeEnd"   DATE         NOT NULL,
  "operations"     JSONB        NOT NULL DEFAULT '[]',
  "version"        INTEGER      NOT NULL DEFAULT 1,
  "status"         "DraftStatus" NOT NULL DEFAULT 'EDITING',
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "ScheduleDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduleDraft_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "ScheduleDraft_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT,
  CONSTRAINT "ScheduleDraft_tenantId_channelId_dateRangeStart_dateRangeEnd_key"
    UNIQUE ("tenantId", "channelId", "dateRangeStart", "dateRangeEnd")
);

CREATE INDEX IF NOT EXISTS "ScheduleDraft_tenantId_idx" ON "ScheduleDraft"("tenantId");

-- ScheduleVersion table
CREATE TABLE IF NOT EXISTS "ScheduleVersion" (
  "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"             UUID         NOT NULL,
  "channelId"            INTEGER      NOT NULL,
  "draftId"              UUID         NOT NULL,
  "versionNumber"        INTEGER      NOT NULL,
  "snapshot"             JSONB        NOT NULL,
  "publishedAt"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "publishedBy"          TEXT         NOT NULL,
  "isEmergency"          BOOLEAN      NOT NULL DEFAULT false,
  "reasonCode"           TEXT,
  "acknowledgedWarnings" JSONB        NOT NULL DEFAULT '[]',

  CONSTRAINT "ScheduleVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduleVersion_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "ScheduleVersion_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT,
  CONSTRAINT "ScheduleVersion_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "ScheduleDraft"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ScheduleVersion_tenantId_idx" ON "ScheduleVersion"("tenantId");

-- Add scheduleVersionId FK on BroadcastSlot (column already exists from previous migration)
DO $$ BEGIN
  ALTER TABLE "BroadcastSlot"
    ADD CONSTRAINT "BroadcastSlot_scheduleVersionId_fkey"
    FOREIGN KEY ("scheduleVersionId") REFERENCES "ScheduleVersion"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
