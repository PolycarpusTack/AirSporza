-- Add hierarchy, multi-type, and platform support to Channel
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "parentId" INT REFERENCES "Channel"(id) ON DELETE SET NULL;
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "types" TEXT[] DEFAULT ARRAY['linear'];
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "platformConfig" JSONB DEFAULT '{}';
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "sortOrder" INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_channel_parent ON "Channel"("parentId");
