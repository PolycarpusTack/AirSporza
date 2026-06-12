-- Webhook outbound publishing tables
-- Run with: psql -U sporza -h localhost -p 5433 -d sporza_planner -f add_webhook_tables.sql
-- Or in Docker: docker exec -i sporza-db psql -U sporza -d sporza_planner < add_webhook_tables.sql

-- WebhookEndpoint: stores registered outbound webhook targets
CREATE TABLE IF NOT EXISTS "WebhookEndpoint" (
  "id"          TEXT        NOT NULL,
  "url"         TEXT        NOT NULL,
  "secret"      TEXT        NOT NULL,
  "events"      TEXT[]      NOT NULL DEFAULT '{}',
  "isActive"    BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,

  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebhookEndpoint_isActive_idx"
  ON "WebhookEndpoint"("isActive");

-- Optional FK to User (safe if table doesn't exist yet)
DO $$ BEGIN
  ALTER TABLE "WebhookEndpoint"
    ADD CONSTRAINT "WebhookEndpoint_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN undefined_table THEN null;
END $$;

-- WebhookDelivery: log of every outbound delivery attempt
CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
  "id"          TEXT        NOT NULL,
  "webhookId"   TEXT        NOT NULL,
  "eventType"   TEXT        NOT NULL,
  "payload"     JSONB       NOT NULL DEFAULT '{}',
  "statusCode"  INTEGER,
  "attempts"    INTEGER     NOT NULL DEFAULT 0,
  "deliveredAt" TIMESTAMP(3),
  "error"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_webhookId_fkey"
    FOREIGN KEY ("webhookId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "WebhookDelivery_webhookId_createdAt_idx"
  ON "WebhookDelivery"("webhookId", "createdAt");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_eventType_idx"
  ON "WebhookDelivery"("eventType");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_deliveredAt_idx"
  ON "WebhookDelivery"("deliveredAt");
