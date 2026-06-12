-- TD-22 layer 2 scaffolding (ADR-011): non-owner application role.
-- The app's RLS policies only bind non-owner roles; `planza_app` is created
-- NOLOGIN here (inert) and activated per environment via the runbook
-- (ALTER ROLE planza_app LOGIN PASSWORD ...; set APP_DATABASE_URL).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'planza_app') THEN
    CREATE ROLE planza_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO planza_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO planza_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO planza_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO planza_app;

-- Future objects created by the migration-running owner inherit the grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO planza_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO planza_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO planza_app;

-- Authentication identifies the user BEFORE any tenant context exists
-- (middleware/auth.ts user lookup). User reads are therefore global for the
-- app role; all writes remain tenant-bound by the existing tenant_isolation
-- policy (FOR ALL policies are restrictive per-command only when permissive
-- policies exist for the command — auth_lookup is SELECT-only and permissive,
-- so SELECT passes via it, INSERT/UPDATE/DELETE still require tenant_isolation).
CREATE POLICY auth_lookup ON "User" FOR SELECT USING (true);
