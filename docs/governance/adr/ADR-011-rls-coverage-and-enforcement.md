# ADR-011: RLS — complete coverage now, enforcement via non-owner role later

**Status:** Accepted (2026-06-12) · Amends ADR-002

## Context (discovered posture, verified on the live DB)

The TD-22 investigation found the RLS situation worse than "13 tables lack policies":

1. **Zero tables have `FORCE ROW LEVEL SECURITY`**, and the application connects as `sporza`,
   which **owns all 66 tables**. PostgreSQL exempts table owners from RLS unless forced —
   so all 48 existing `tenant_isolation` policies have never applied to a single application
   query. ADR-002's isolation has, in practice, been provided entirely by application-level
   `where tenantId` clauses (which the routes do consistently — reviewed).
2. 13 tenant-scoped tables (incl. `BroadcastSlot`, `Channel`, `ScheduleDraft`, `Team`,
   `Player` families) had no policy at all — tables created in the `db push` era after the
   original RLS migration.

## Decision

**Layer 1 — coverage (this change):** migration `20260612170000_add_tenant_rls_coverage` adds
`ENABLE ROW LEVEL SECURITY` + the standard `tenant_isolation` policy to all 13 uncovered tables
(now 61 policies, 0 uncovered). Zero behavioral risk: nothing is forced, so app behavior is
byte-identical. A new fitness assertion (**FF-2**, in `verify-migrations.sh`, runs every CI
migrations job) fails the build if any tenant-scoped table ever lacks a policy again.

**Layer 2 — enforcement scaffolding (BUILT 2026-06-12, activation = operator step):**
the policies bind by running the API as the **non-owner role `planza_app`** (not `FORCE`, which
would break paths legitimately running without tenant context). Shipped:
- Migration `20260612180000_add_app_role_and_auth_policy`: `planza_app` (NOLOGIN until
  activated), full table/sequence/function grants + default privileges, and the `auth_lookup`
  SELECT policy on `User` (login identifies the user before tenant context can exist; writes
  stay tenant-bound).
- Migration `20260612190000_harden_tenant_policy_null_context`: all 61 policies re-stated with
  `NULLIF(current_setting('app.tenant_id', true), '')::uuid` — an expired/unset context now
  fails EMPTY instead of erroring 22P02 (empty string is what an expired transaction-local
  setting returns).
- `db/prisma.ts`: request-serving processes use `APP_DATABASE_URL` when set; the worker process
  pins `PLANZA_DB_ROLE=owner` (first-import `workerEnv.ts`) — outbox consumer, schedulers and
  contract expiry legitimately span tenants.
- **Proof in CI**: `tests/rls-enforcement.test.ts` runs as `planza_app` in the migrations job —
  tenant A context sees only A; no context sees nothing; cross-tenant INSERT rejected; auth
  lookup works pre-context; owner bypass intact.

**Critical discovery for activation:** `set_tenant_context` uses `set_config(.., true)` =
**transaction-local**. Under the bound role, the app's current per-request `setTenantRLS()`
call does NOT carry to subsequent pooled queries — the working pattern (proven in the test) is
setting context **inside an interactive transaction** with the query. Activation therefore
requires the per-request transaction wrapper (or a Prisma client extension injecting
`set_config` per query batch) — **that route-layer change is the remaining activation story**;
until it lands, `APP_DATABASE_URL` must stay unset in production (routes would fail-empty).

## Consequences

- Defense-in-depth scaffolding is complete and ratcheted (FF-2); the register's TD-22 narrows to
  the enforcement story.
- Until Layer 2, the honest security statement is: tenant isolation = application-level scoping
  (consistently applied + review-guarded), with RLS staged but not yet binding.
- Per ADR-010 (multi-tenant product), Layer 2 is scheduled work, not optional.

## Review date

When the Layer-2 enforcement story is scheduled, or 2026-09-12.
