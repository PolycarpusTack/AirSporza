-- Add channel FKs and durationMin to Event
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "channelId" INT REFERENCES "Channel"(id) ON DELETE SET NULL;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "radioChannelId" INT REFERENCES "Channel"(id) ON DELETE SET NULL;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "onDemandChannelId" INT REFERENCES "Channel"(id) ON DELETE SET NULL;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "durationMin" INT;

CREATE INDEX IF NOT EXISTS idx_event_channel ON "Event"("channelId");
