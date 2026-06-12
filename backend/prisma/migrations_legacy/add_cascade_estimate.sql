-- CascadeEstimate table
CREATE TABLE "CascadeEstimate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "eventId" INTEGER NOT NULL,
    "estimatedStartUtc" TIMESTAMPTZ,
    "earliestStartUtc" TIMESTAMPTZ,
    "latestStartUtc" TIMESTAMPTZ,
    "estDurationShortMin" INTEGER,
    "estDurationLongMin" INTEGER,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "inputsUsed" JSONB NOT NULL DEFAULT '{}',
    "computedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CascadeEstimate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CascadeEstimate_tenantId_eventId_key" ON "CascadeEstimate"("tenantId", "eventId");
CREATE INDEX "CascadeEstimate_tenantId_idx" ON "CascadeEstimate"("tenantId");

ALTER TABLE "CascadeEstimate" ADD CONSTRAINT "CascadeEstimate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT;
ALTER TABLE "CascadeEstimate" ADD CONSTRAINT "CascadeEstimate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT;

-- RLS
ALTER TABLE "CascadeEstimate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cascade_estimate_tenant_isolation" ON "CascadeEstimate"
    USING ("tenantId"::text = current_setting('app.tenant_id', true));
