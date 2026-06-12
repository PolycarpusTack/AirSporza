-- TD-22 layer 1 (EPIC D, ADR-011): complete tenant_isolation policy COVERAGE.
-- These 13 tenant-scoped tables had no RLS policy (created via db push after the
-- original add_tenant_id_and_rls.sql era). Policy shape matches the existing 48.
--
-- NOTE: this is coverage, not enforcement — no table is FORCE ROW LEVEL SECURITY
-- yet, and the app connects as the table owner, so policies do not bind app
-- queries until the ADR-011 enforcement story (non-owner runtime role) lands.

ALTER TABLE "BroadcastSlot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BroadcastSlot" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "CanonicalPlayer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CanonicalPlayer" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "Channel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Channel" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "Court" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Court" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "Integration" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Integration" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "Player" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Player" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "PlayerAlias" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlayerAlias" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "PlayerTeam" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlayerTeam" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "ScheduleDraft" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScheduleDraft" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "ScheduleVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScheduleVersion" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Team" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "TeamCompetition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TeamCompetition" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

ALTER TABLE "Venue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Venue" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);
