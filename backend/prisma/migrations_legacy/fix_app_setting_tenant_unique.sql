-- Fix AppSetting unique constraint to include tenantId
-- Without this, settings from different tenants can overwrite each other

-- Drop the old constraint
ALTER TABLE "AppSetting" DROP CONSTRAINT IF EXISTS "AppSetting_key_scopeKind_scopeId_key";

-- Add the new tenant-scoped constraint
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_tenantId_key_scopeKind_scopeId_key"
  UNIQUE ("tenantId", "key", "scopeKind", "scopeId");
