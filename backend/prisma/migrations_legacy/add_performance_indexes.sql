-- Performance indexes for hot query paths
-- Apply with: docker exec -i sporza-db psql -U sporza -d sporza_planner < backend/prisma/migrations/add_performance_indexes.sql

-- AuditLog: action field is frequently filtered in admin audit viewer
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog" ("action");

-- Event: composite indexes for tenant-scoped date range queries (the most common list pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Event_tenantId_startDateBE_idx" ON "Event" ("tenantId", "startDateBE");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Event_tenantId_sportId_startDateBE_idx" ON "Event" ("tenantId", "sportId", "startDateBE");

-- WebhookDelivery: composite for the resume-failed-deliveries query (WHERE deliveredAt IS NULL AND attempts < 3)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WebhookDelivery_deliveredAt_attempts_idx" ON "WebhookDelivery" ("deliveredAt", "attempts");
