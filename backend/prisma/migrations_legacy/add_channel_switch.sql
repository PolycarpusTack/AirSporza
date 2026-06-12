-- SwitchTriggerType enum
DO $$ BEGIN
    CREATE TYPE "SwitchTriggerType" AS ENUM ('CONDITIONAL', 'REACTIVE', 'EMERGENCY', 'HARD_CUT', 'COURT_SWITCH');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- SwitchExecutionStatus enum
DO $$ BEGIN
    CREATE TYPE "SwitchExecutionStatus" AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ChannelSwitchAction table
CREATE TABLE "ChannelSwitchAction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "fromSlotId" UUID NOT NULL,
    "toChannelId" INTEGER NOT NULL,
    "toSlotId" UUID,
    "triggerType" "SwitchTriggerType" NOT NULL,
    "switchAtUtc" TIMESTAMPTZ,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMPTZ,
    "executionStatus" "SwitchExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "autoConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelSwitchAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChannelSwitchAction_tenantId_idx" ON "ChannelSwitchAction"("tenantId");
CREATE INDEX "ChannelSwitchAction_fromSlotId_idx" ON "ChannelSwitchAction"("fromSlotId");

ALTER TABLE "ChannelSwitchAction" ADD CONSTRAINT "ChannelSwitchAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT;
ALTER TABLE "ChannelSwitchAction" ADD CONSTRAINT "ChannelSwitchAction_fromSlotId_fkey" FOREIGN KEY ("fromSlotId") REFERENCES "BroadcastSlot"("id") ON DELETE RESTRICT;
ALTER TABLE "ChannelSwitchAction" ADD CONSTRAINT "ChannelSwitchAction_toSlotId_fkey" FOREIGN KEY ("toSlotId") REFERENCES "BroadcastSlot"("id") ON DELETE SET NULL;

-- RLS
ALTER TABLE "ChannelSwitchAction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channel_switch_tenant_isolation" ON "ChannelSwitchAction"
    USING ("tenantId"::text = current_setting('app.tenant_id', true));
