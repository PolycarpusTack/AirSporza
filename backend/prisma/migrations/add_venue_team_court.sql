-- Add Venue, Team, Court tables for broadcast middleware
-- Also adds venueId FK to Event table

-- Venue
CREATE TABLE IF NOT EXISTS "Venue" (
  "id"        SERIAL PRIMARY KEY,
  "tenantId"  UUID NOT NULL REFERENCES "Tenant"("id"),
  "name"      TEXT NOT NULL,
  "timezone"  TEXT NOT NULL DEFAULT 'Europe/Brussels',
  "country"   TEXT,
  "address"   TEXT,
  "capacity"  INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Venue_tenantId_name_key" ON "Venue"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "Venue_tenantId_idx" ON "Venue"("tenantId");

-- Team
CREATE TABLE IF NOT EXISTS "Team" (
  "id"           SERIAL PRIMARY KEY,
  "tenantId"     UUID NOT NULL REFERENCES "Tenant"("id"),
  "name"         TEXT NOT NULL,
  "shortName"    TEXT,
  "country"      TEXT,
  "logoUrl"      TEXT,
  "externalRefs" JSONB NOT NULL DEFAULT '{}',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Team_tenantId_name_key" ON "Team"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "Team_tenantId_idx" ON "Team"("tenantId");

-- Court
CREATE TABLE IF NOT EXISTS "Court" (
  "id"                SERIAL PRIMARY KEY,
  "tenantId"          UUID NOT NULL REFERENCES "Tenant"("id"),
  "venueId"           INTEGER NOT NULL REFERENCES "Venue"("id"),
  "name"              TEXT NOT NULL,
  "capacity"          INTEGER,
  "hasRoof"           BOOLEAN NOT NULL DEFAULT false,
  "isShowCourt"       BOOLEAN NOT NULL DEFAULT false,
  "broadcastPriority" INTEGER NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Court_venueId_name_key" ON "Court"("venueId", "name");
CREATE INDEX IF NOT EXISTS "Court_tenantId_idx" ON "Court"("tenantId");

-- Add venueId to Event
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "venueId" INTEGER REFERENCES "Venue"("id");
CREATE INDEX IF NOT EXISTS "Event_venueId_idx" ON "Event"("venueId");
