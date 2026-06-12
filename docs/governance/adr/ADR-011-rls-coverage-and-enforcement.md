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

**Layer 2 — enforcement (dedicated follow-up story, scheduled in EPIC D):** make the policies
actually bind by running the app as a **non-owner role** (`planza_app`) with table privileges but
no ownership, instead of `FORCE` (forcing the owner would break paths that legitimately run
without tenant context). Prerequisites that story must solve, discovered now:
- **Login**: the `/auth` user lookup runs before any tenant context exists → the `User` policy
  must allow lookup by the auth path (e.g. a `SECURITY DEFINER` function or a permissive
  policy keyed on the auth flow).
- **Cross-tenant workers**: outbox consumer, contract-expiry check, import/integration
  schedulers iterate ALL tenants → they keep an elevated role or iterate per-tenant setting
  context (per-event context already exists in the outbox consumer).
- A regression pass asserting every route still returns data with context set, and returns
  NOTHING without it (the actual point).

## Consequences

- Defense-in-depth scaffolding is complete and ratcheted (FF-2); the register's TD-22 narrows to
  the enforcement story.
- Until Layer 2, the honest security statement is: tenant isolation = application-level scoping
  (consistently applied + review-guarded), with RLS staged but not yet binding.
- Per ADR-010 (multi-tenant product), Layer 2 is scheduled work, not optional.

## Review date

When the Layer-2 enforcement story is scheduled, or 2026-09-12.
