-- ADR-011: an expired/unset tenant context makes current_setting('app.tenant_id', true)
-- return '' (empty string), and ''::uuid raises 22P02 — so a bound role would ERROR
-- instead of seeing zero rows. NULLIF makes the policies fail-empty deterministically.
-- Re-states every tenant-scoping policy uniformly (the legacy set had mixed names).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND qual LIKE '%app.tenant_id%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I USING ("tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      r.policyname, r.tablename
    );
  END LOOP;
END
$$;
