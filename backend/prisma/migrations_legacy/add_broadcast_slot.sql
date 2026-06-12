-- Add Channel and BroadcastSlot tables for broadcast middleware
-- Also adds enums: OverrunStrategy, AnchorType, BroadcastSlotStatus, ContentSegment

-- Enums
DO $$ BEGIN
  CREATE TYPE "OverrunStrategy" AS ENUM ('EXTEND', 'CONDITIONAL_SWITCH', 'HARD_CUT', 'SPLIT_SCREEN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AnchorType" AS ENUM ('FIXED_TIME', 'COURT_POSITION', 'FOLLOWS_MATCH', 'HANDOFF', 'NOT_BEFORE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BroadcastSlotStatus" AS ENUM ('PLANNED', 'LIVE', 'OVERRUN', 'SWITCHED_OUT', 'COMPLETED', 'VOIDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContentSegment" AS ENUM ('FULL', 'CONTINUATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Channel
CREATE TABLE IF NOT EXISTS "Channel" (
  "id"                     SERIAL PRIMARY KEY,
  "tenantId"               UUID NOT NULL REFERENCES "Tenant"("id"),
  "name"                   TEXT NOT NULL,
  "timezone"               TEXT NOT NULL DEFAULT 'Europe/Brussels',
  "broadcastDayStartLocal" TEXT NOT NULL DEFAULT '06:00',
  "epgConfig"              JSONB NOT NULL DEFAULT '{}',
  "color"                  TEXT NOT NULL DEFAULT '#3B82F6',
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Channel_tenantId_name_key" ON "Channel"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "Channel_tenantId_idx" ON "Channel"("tenantId");

-- BroadcastSlot
CREATE TABLE IF NOT EXISTS "BroadcastSlot" (
  "id"                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                   UUID NOT NULL REFERENCES "Tenant"("id"),
  "channelId"                  INTEGER NOT NULL REFERENCES "Channel"("id"),
  "eventId"                    INTEGER REFERENCES "Event"("id"),
  "schedulingMode"             "SchedulingMode" NOT NULL DEFAULT 'FIXED',
  "plannedStartUtc"            TIMESTAMPTZ,
  "plannedEndUtc"              TIMESTAMPTZ,
  "estimatedStartUtc"          TIMESTAMPTZ,
  "estimatedEndUtc"            TIMESTAMPTZ,
  "earliestStartUtc"           TIMESTAMPTZ,
  "latestStartUtc"             TIMESTAMPTZ,
  "actualStartUtc"             TIMESTAMPTZ,
  "actualEndUtc"               TIMESTAMPTZ,
  "bufferBeforeMin"            INTEGER NOT NULL DEFAULT 15,
  "bufferAfterMin"             INTEGER NOT NULL DEFAULT 25,
  "expectedDurationMin"        INTEGER,
  "overrunStrategy"            "OverrunStrategy" NOT NULL DEFAULT 'EXTEND',
  "conditionalTriggerUtc"      TIMESTAMPTZ,
  "conditionalTargetChannelId" INTEGER,
  "anchorType"                 "AnchorType" NOT NULL DEFAULT 'FIXED_TIME',
  "coveragePriority"           INTEGER NOT NULL DEFAULT 1,
  "fallbackEventId"            INTEGER,
  "status"                     "BroadcastSlotStatus" NOT NULL DEFAULT 'PLANNED',
  "contentSegment"             "ContentSegment" NOT NULL DEFAULT 'FULL',
  "scheduleVersionId"          UUID,
  "sportMetadata"              JSONB NOT NULL DEFAULT '{}',
  "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "BroadcastSlot_tenantId_idx" ON "BroadcastSlot"("tenantId");
CREATE INDEX IF NOT EXISTS "BroadcastSlot_channelId_plannedStartUtc_idx" ON "BroadcastSlot"("channelId", "plannedStartUtc");
CREATE INDEX IF NOT EXISTS "BroadcastSlot_eventId_idx" ON "BroadcastSlot"("eventId");
