# ADR-010: Product posture — multi-tenant product, VRT as first tenant

**Status:** Accepted (2026-06-12, stakeholder decision)

## Context

The 2026-06-12 current-state evaluation flagged a "vision fork": the README and seed data say
VRT/Sporza tool, while the architecture (Postgres RLS, `Tenant` aggregate, OrgConfig, the Planza
rename) had been quietly generalized. The fork silently drove cost trade-offs — most concretely
whether TD-22 (partial RLS coverage) is worth servicing, and how generic admin configuration
must stay.

## Decision

**Planza is a multi-tenant product. VRT is the first tenant, not the product.**

Practically:
1. Multi-tenant correctness is **Core Domain**, not speculative generality. Tenant-isolation
   gaps are security defects, not nice-to-haves.
2. VRT-specific behavior lives in tenant configuration (`OrgConfig`, `AppSetting`, seed data) —
   never in code paths. New features must ask "is this VRT's preference or product behavior?"
3. The `sporza-*` legacy naming (package name, DB name/credentials) remains TD-10 cleanup;
   product-facing naming is Planza.

## Consequences

- **TD-22 (RLS coverage) is confirmed and raised**: the policy-less operational tables
  (Team, Player, TeamCompetition, PlayerTeam, …) get `tenant_isolation` policies in the
  hardening bundle (EPIC D). Defense-in-depth is product-required, not optional.
- Field-visibility enforcement, pagination, and per-tenant rate limiting earn their keep as
  product features, not VRT polish.
- A second tenant onboarding (whenever it comes) should need: a `Tenant` row, seed/OrgConfig,
  import-source credentials — and zero code changes. That is the standing fitness test for
  "VRT preference vs product behavior" decisions.
- Single-deployment economics stay fine for now; per-tenant isolation beyond RLS (separate DBs)
  is explicitly out of scope until a customer requires it.

## Alternatives considered

- **VRT tool only:** rejected by stakeholder — forfeits the multi-tenant work already paid for.
- **Product-first, VRT as a fork:** rejected — one codebase, tenancy by configuration.

## Review date

At second-tenant onboarding, or 2027-06-12.
