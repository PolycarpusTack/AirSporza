-- Performance follow-up migration
-- Adds indexes and constraints identified by the 2026-04-21 perf audit.
--
-- Must be applied once; safe to re-run (uses IF NOT EXISTS everywhere).
-- Apply with: docker exec -i sporza-db psql -U sporza -d sporza_planner < add_performance_followup_indexes.sql

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Cascade engine hot path
--    Expression index lets `sportMetadata.path: ['court_id'], equals: X`
--    (Prisma) skip the sequential scan that currently hits every event for
--    the day whenever event.status_changed / match.score_updated triggers a
--    cascade recompute. Composite with tenantId+startDateBE matches the full
--    WHERE clause at backend/src/services/cascade/engine.ts:38-49.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS event_court_day_idx
  ON "Event" ((("sportMetadata" ->> 'court_id')::int), "tenantId", "startDateBE")
  WHERE "sportMetadata" ? 'court_id';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Webhook delivery idempotency
--    Previously the worker ran a JSONB-equality findFirst over the whole
--    delivery table to dedupe BullMQ retries. Replace with a proper
--    outboxEventId FK + unique constraint; BullMQ's jobId + this unique give
--    us exactly-once semantics without scanning.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "WebhookDelivery"
  ADD COLUMN IF NOT EXISTS "outboxEventId" UUID;

-- Unique on (webhookId, outboxEventId) — NULL outboxEventId rows are still
-- permitted (legacy rows) and Postgres treats NULLs as distinct, so they
-- don't conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookDelivery_webhookId_outboxEventId_key"
  ON "WebhookDelivery" ("webhookId", "outboxEventId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Event → BroadcastSlot auto-bridge
--    Adds autoLinked flag + partial unique so the bridge can do a single
--    INSERT ... ON CONFLICT round-trip instead of findFirst + create/update.
--    Manual slot creation and DUPLICATE_SLOT stay unaffected (they leave
--    autoLinked=false, outside the partial index).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "BroadcastSlot"
  ADD COLUMN IF NOT EXISTS "autoLinked" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark pre-existing slots that look bridge-created so the bridge's
-- next write updates them instead of inserting a duplicate. A slot is
-- assumed bridge-created when it has an event, uses the default FIXED mode,
-- FULL content segment, and is not tied to a published schedule version
-- (published snapshots carry scheduleVersionId). This is a best-effort
-- classification; worst case a non-bridge slot gets adopted on the next
-- sync, which is equivalent to the pre-migration findFirst behaviour.
UPDATE "BroadcastSlot"
SET "autoLinked" = true
WHERE "eventId" IS NOT NULL
  AND "autoLinked" = false
  AND "schedulingMode" = 'FIXED'
  AND "anchorType" = 'FIXED_TIME'
  AND "contentSegment" = 'FULL'
  AND "scheduleVersionId" IS NULL;

-- Deduplicate any (tenantId, eventId) pairs that would otherwise violate
-- the new partial unique. Keep the most recently updated row.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "tenantId", "eventId" ORDER BY "updatedAt" DESC, "createdAt" DESC) AS rn
  FROM "BroadcastSlot"
  WHERE "autoLinked" = true AND "eventId" IS NOT NULL
)
UPDATE "BroadcastSlot" bs
SET "autoLinked" = false
FROM ranked
WHERE bs.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "BroadcastSlot_tenant_event_autolinked_key"
  ON "BroadcastSlot" ("tenantId", "eventId")
  WHERE "autoLinked" = true AND "eventId" IS NOT NULL;

COMMIT;
