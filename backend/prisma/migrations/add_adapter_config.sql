-- AdapterType enum
DO $$ BEGIN
    CREATE TYPE "AdapterType" AS ENUM ('LIVE_SCORE', 'OOP', 'LIVE_TIMING', 'AS_RUN', 'EPG', 'PLAYOUT', 'NOTIFICATION');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AdapterDirection enum
DO $$ BEGIN
    CREATE TYPE "AdapterDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AdapterConfig table
CREATE TABLE "AdapterConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "adapterType" "AdapterType" NOT NULL,
    "direction" "AdapterDirection" NOT NULL,
    "providerName" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSuccessAt" TIMESTAMPTZ,
    "lastFailureAt" TIMESTAMPTZ,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdapterConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdapterConfig_tenantId_adapterType_providerName_key" ON "AdapterConfig"("tenantId", "adapterType", "providerName");
CREATE INDEX "AdapterConfig_tenantId_idx" ON "AdapterConfig"("tenantId");

ALTER TABLE "AdapterConfig" ADD CONSTRAINT "AdapterConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT;

-- RLS
ALTER TABLE "AdapterConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adapter_config_tenant_isolation" ON "AdapterConfig"
    USING ("tenantId"::text = current_setting('app.tenant_id', true));
