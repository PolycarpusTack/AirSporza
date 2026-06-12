CREATE TYPE "EventStatus" AS ENUM (
  'draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled'
);

ALTER TABLE "Event"
  ADD COLUMN "status" "EventStatus" NOT NULL DEFAULT 'draft';

CREATE INDEX "Event_status_idx" ON "Event"("status");
