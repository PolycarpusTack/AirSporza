# ADR-005 — JWT bearer auth via Passport with role-based authorization

**Status:** Accepted (backfilled 2026-06-12)

## Context

The React SPA and its REST API need stateless authentication that works across the API process and
the worker-driven Socket.IO fan-out, plus an authorization model matching the product's user
kinds: schedule planners, sports editors, contract managers, administrators.

## Decision

Stateless **JWT bearer tokens** validated by `passport-jwt` (`backend/src/middleware/auth.ts`,
`session: false`): the strategy resolves `payload.sub` to a `User` row on every request (a DB hit
that doubles as soft revocation — deleted users fail immediately). Two middlewares compose per
route: `authenticate` (401 on missing/invalid token) and `authorize(...roles)` (403 unless
`user.role` is listed). Roles are a closed Prisma enum of **four**: `planner`, `sports`,
`contracts`, `admin` (`schema.prisma` `enum Role`). Authorization is **route-level**; the
authenticated user also seeds the tenant context (ADR-002). Field-level visibility
(`FieldDefinition.visibleByRoles`) is defined in schema but **not yet enforced** — tracked as
TD-6, closed by story B-1.

## Alternatives considered

- **Server sessions + cookies** — simpler revocation, but sticky state across API/worker/socket processes and CSRF handling for the SPA.
- **External IdP (OAuth/OIDC)** — right answer if the VRT-internal fork of the product vision wins (SSO), premature while that decision is open.
- **Policy engine (CASL/OPA)** — expressive, overkill for four roles and route-level checks today.

## Consequences

- Horizontal scaling is trivial (no session store); tokens remain valid until expiry — compromise response is secret rotation, not per-token revocation.
- Per-request user lookup costs one indexed query and provides the soft-revocation property.
- The coarse 4-role model concentrates risk in route-level `authorize` lists; the unenforced `visibleByRoles` gap is the system's active information-disclosure threat (STRIDE, backlog §1) until B-1 ships its fail-closed filter behind `FIELD_VISIBILITY_ENFORCEMENT`.
- Role names are glossary terms — new roles require schema migration + glossary update.

**Review date:** 2026-12-12 (sooner if the VRT-tool vs multi-tenant-product decision lands an IdP)
