-- CreateEnum
CREATE TYPE "OutboxPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "priority" "OutboxPriority" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ,
    "failedAt" TIMESTAMPTZ,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "deadLetteredAt" TIMESTAMPTZ,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_idempotencyKey_key" ON "OutboxEvent"("idempotencyKey");
CREATE INDEX "OutboxEvent_tenantId_idx" ON "OutboxEvent"("tenantId");
CREATE INDEX "OutboxEvent_processedAt_deadLetteredAt_priority_createdAt_idx"
    ON "OutboxEvent"("processedAt", "deadLetteredAt", "priority", "createdAt");

-- AddForeignKey
ALTER TABLE "OutboxEvent"
    ADD CONSTRAINT "OutboxEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "OutboxEvent"
    USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
