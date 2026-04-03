-- Integration Hub tables
-- Apply with: docker exec -i sporza-db psql -U sporza -d sporza_planner < backend/prisma/migrations/add_integration_tables.sql

CREATE TYPE "IntegrationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'BIDIRECTIONAL');
CREATE TYPE "IntegrationLogStatus" AS ENUM ('success', 'failed', 'partial');

CREATE TABLE "Integration" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "name" TEXT NOT NULL,
  "direction" "IntegrationDirection" NOT NULL,
  "templateCode" TEXT NOT NULL,
  "credentials" TEXT,
  "fieldOverrides" JSONB NOT NULL DEFAULT '[]',
  "config" JSONB NOT NULL DEFAULT '{}',
  "triggerConfig" JSONB NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "rateLimitPerMinute" INTEGER,
  "rateLimitPerDay" INTEGER,
  "lastSuccessAt" TIMESTAMPTZ,
  "lastFailureAt" TIMESTAMPTZ,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("tenantId", "name")
);

CREATE INDEX "Integration_tenantId_idx" ON "Integration"("tenantId");
CREATE INDEX "Integration_tenantId_direction_idx" ON "Integration"("tenantId", "direction");

CREATE TABLE "IntegrationSchedule" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "integrationId" UUID NOT NULL REFERENCES "Integration"("id") ON DELETE CASCADE,
  "cronExpression" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "jobConfig" JSONB NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMPTZ,
  "nextRunAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "IntegrationSchedule_integrationId_idx" ON "IntegrationSchedule"("integrationId");
CREATE INDEX "IntegrationSchedule_active_next_idx" ON "IntegrationSchedule"("isActive", "nextRunAt");

CREATE TABLE "IntegrationLog" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "integrationId" UUID NOT NULL REFERENCES "Integration"("id") ON DELETE CASCADE,
  "direction" "IntegrationDirection" NOT NULL,
  "status" "IntegrationLogStatus" NOT NULL,
  "requestMeta" JSONB NOT NULL DEFAULT '{}',
  "responseMeta" JSONB NOT NULL DEFAULT '{}',
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "IntegrationLog_integration_created_idx"
  ON "IntegrationLog"("integrationId", "createdAt" DESC);
CREATE INDEX "IntegrationLog_integration_status_idx"
  ON "IntegrationLog"("integrationId", "status");
