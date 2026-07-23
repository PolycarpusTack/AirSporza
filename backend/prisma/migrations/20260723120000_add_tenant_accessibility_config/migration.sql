-- RC-5-T1 — Per-tenant accessibility configuration (AS-10: client regulatory rules
-- are tenant configuration, never product constants). Idiom mirrors
-- 20260714120000_add_accessibility_deliverables: raw SQL (ADR-004/007), RLS
-- tenant_isolation in the SAME migration, rollback.sql alongside.
--
-- At most ONE row per tenant (unique tenantId). Every config column is NULLABLE:
-- NULL = "fall back to that field's global constant default" (per-field merge —
-- pinned in src/services/accessibility/tenantConfig.ts). "t888ExcludedSportIds" is
-- JSONB (int array), not INTEGER[]: the merge semantics need NULL ("fall back")
-- distinct from '[]' ("explicitly no exclusions"), and Prisma scalar lists cannot
-- be NULL.

-- CreateTable
CREATE TABLE "TenantAccessibilityConfig" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "t888ExcludedSportIds" JSONB,
    "kpiTargetPctByType" JSONB,
    "unplannedLeadTimeDays" INTEGER,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantAccessibilityConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (one config row per tenant — the PUT surface is a per-tenant upsert)
CREATE UNIQUE INDEX "TenantAccessibilityConfig_tenantId_key" ON "TenantAccessibilityConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantAccessibilityConfig" ADD CONSTRAINT "TenantAccessibilityConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: tenant_isolation ships in the SAME migration as the table (ADR-011 gate).
-- Byte-identical idiom to AccessibilityDeliverable / ListedEventCategory / RightsWindow.
ALTER TABLE "TenantAccessibilityConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantAccessibilityConfig" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);
