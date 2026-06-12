# ADR-002 — Postgres Row-Level Security for multi-tenancy

**Status:** Accepted (backfilled 2026-06-12)

## Context

Planza serves multiple Tenants from one database. Relying on every Prisma query to remember a
`where: { tenantId }` clause means one forgotten filter leaks another tenant's data — unacceptable
for the highest-blast-radius property in the system. Isolation must hold even when application
code is wrong.

## Decision

Defense at the database layer: every tenant-scoped table carries a `tenantId UUID NOT NULL` FK
and a `tenant_isolation` RLS policy
(`USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)`), created in
`backend/prisma/migrations/add_tenant_id_and_rls.sql` (30+ tables). Context is set via the SQL
helper `set_tenant_context(uuid)` (a `set_config('app.tenant_id', …, true)` wrapper), called from
`backend/src/utils/setTenantRLS.ts` — note the mandatory `::uuid` cast, since Prisma binds params
as `text`. Express middleware `backend/src/middleware/tenantContext.ts` resolves the tenant from
the authenticated user (fallback: cached `default` tenant for public routes) per request; workers
call `setTenantRLS` before processing tenant-scoped jobs.

## Alternatives considered

- **Application-level filtering only** — zero DB ceremony, but a single missed `where` = cross-tenant leak; no safety net.
- **Schema-per-tenant** — strong isolation, but migrations × N tenants and no cross-tenant canonical dedup.
- **Database-per-tenant** — maximum isolation, maximum operational cost; wrong trade for current scale.

## Consequences

- Isolation survives buggy queries — the DB returns nothing rather than the wrong tenant's rows.
- Every new table needs `tenantId` + policy; currently raw SQL (Prisma has no native RLS DSL) — coupling to the migration strategy (ADR-004 → ADR-007).
- The context is connection/transaction-scoped: a pooled connection without `set_tenant_context` silently yields **empty results** (the `true` missing_ok flag), a subtle failure mode — every new worker/entry point must call `setTenantRLS`. A CI fitness check is a candidate fitness function.
- `current_setting` lookup per row is cheap but not free; acceptable at current volumes.

**Review date:** 2026-12-12
