# Planza — Domain Glossary

_Source: mitigation backlog §3 (2026-06-12) · Mode: DELIVERY — enforced in all code, prompts, and docs_
_Rule (Core P3): one term per concept, one concept per term._

## Glossary

| Term | Definition |
|---|---|
| **Planza** | The product and system name. Use everywhere going forward. |
| ~~Sporza Planner / SporzaPlanner / sporza-planner~~ | **Deprecated synonyms** of Planza. Survive only in npm package names and legacy identifiers; renaming is TD-10, not in scope. Never introduce in new code or docs. |
| **Tenant** | An isolated customer organisation; enforced via Postgres RLS on `tenantId`. |
| **Canonical Team** | The provider-agnostic deduplicated team record produced by the import pipeline (`CanonicalTeam`); source of truth for cross-provider identity. |
| **Team** | The operational, tenant-owned team row used by planning features; may be bridged from a Canonical Team via `canonicalTeamId` (Option B bridge, Teams Phase 1). |
| **Managed Team** | A Team with `isManaged = true`: manual edits are protected against import overwrites via cross-source field priority. |
| **Team Membership** | A `TeamCompetition` row linking a Team to a Competition (optionally per season). UI verb is "assign to league"; the noun in code is always *membership* — never "assignment". |
| **Squad** | UI label for the `/teams` repository page. UI-only term; code says Team. |
| **Player** | (Phase 3, future) An athlete; `Player` + `PlayerTeam` models. Not "athlete" in code. |
| **Import Source** | A configured external data provider instance (e.g. `the_sports_db`) with credentials and base URL. |
| **Import Job** | One execution of the import pipeline for an Import Source + entity scope, run by `ImportJobRunner` through fetch → normalize → dedupe → merge → provision stages. |
| **Source Link** | The record tying a canonical entity to its identifier at a specific Import Source. |
| **Outbox** | The transactional outbox table + trigger; the only path from API writes to async workers/webhooks. |
| **Cascade** | The schedule-recomputation pipeline (`services/cascade/`: `compute.ts`, `estimator.ts`, `engine.ts`, `alerts.ts`) that propagates event changes. *Cascade preview* = the read-only what-if in `schedules.ts`. |
| **Field Definition** | A tenant-configurable dynamic field (`fieldConfig.ts`); **Field Visibility** = its `visibleByRoles[]` restriction. Empty array = visible to all roles (ASM-5). |
| **Quality Loop** | The CI pipeline: typecheck + lint + tests (both workspaces) + migrations against a disposable Postgres. |
| **Migration Baseline** | The single generated migration representing the current live schema, after which `prisma migrate` owns history. |

## Naming decision (resolved 2026-06-12)

**The canonical product name is Planza.** "Sporza", "SporzaPlanner", and "sporza-planner" are
legacy aliases from the project's origin as a VRT sports-planning tool. They still appear in:

- npm package names: `sporza-planner` (root `package.json`), `sporza-planner-backend` (`backend/package.json`)
- Docker artifacts: container `sporza-db` (also `sporza-backend`, `sporza-frontend`, network `sporza-network`, DB/user/password `sporza*` in `docker-compose.yml`)
- `README.md` (title "SporzaPlanner - VRT Sports Planning Tool", paths, example `DATABASE_URL`)

These are **slated for cleanup as TD-10** (see [`debt-register.md`](./debt-register.md)).
**Do not mass-rename now** — package/container/database renames are breaking and not worth the
churn today. The enforced rule is forward-looking only: never introduce the legacy names in new
code, docs, or prompts.

## Teams vocabulary (extension — verified against `docs/teams-players-repository-CHECKPOINT.md`)

| Term | Definition |
|---|---|
| **Team–Competition Membership** | Full form of *Team Membership* above; the code model is `TeamCompetition` (Teams Phase 2, commit `7b5b4c5`). Caveat carried as TD-9: NULL-season uniqueness is route-enforced, not DB-enforced. |
| **Bridge** (a.k.a. `upsertTeam` projection) | The Option B mechanism (Teams Phase 1, commit `4819ee4`): `upsertTeam()` projects an imported `CanonicalTeam` onto an operational `Team` row, linked via `Team.canonicalTeamId`. "Bridge" in prose; `upsertTeam` in code. |
| **Canonical Team** / **Managed Team** / **Squad** | As in the table above — meanings confirmed against the checkpoint: Canonical Team = import-pipeline dedup record; Managed Team = `isManaged` toggle + cross-source field priority protecting manual edits (notably the protected `notes` remarks); Squad = UI label of the `/teams` page only. |
