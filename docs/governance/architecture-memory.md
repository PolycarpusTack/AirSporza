ARCHITECTURE MEMORY: Planza
Updated: 2026-06-12

Components:
  API (Express, backend/src/routes): REST + Zod validation; routes→services direction clean — stable
  Services (backend/src/services): transaction scripts; outbox.ts writes side effects in-tx — stable
  Outbox consumer (workers/outboxConsumer.ts): polls OutboxEvent, fans out to 7 BullMQ queues — stable
  Workers (backend/src/worker.ts + 8 modules): cascade/alerts/standings/bracket/socketio/webhook/integration + outbox; separate process — stable
  Cascade (services/cascade): compute+estimator tested; engine.ts orchestrator untested (TD-5) — stable/at-risk
  Import pipeline (import/ImportJobRunner + adapters): fetch→normalize→dedupe→merge→provision; TheSportsDB live; ImportDeadLetter+replay — stable, god file (TD-1)
  Teams repository (/teams UI + teams routes + CanonicalTeam→Team bridge): Phases 0–2 deployed to DB (migration add_team_repository), route smoke green — stable
  Players domain: Phase 3 — planned (EPIC G, gated on A-2)
  Frontend (React/Vite SPA, src/): PlannerView core; ~0% test coverage — stable/untested
  DB (native Postgres 17.6 @ :5433 + Prisma 5): RLS multi-tenancy; prisma-migrate owned (0_init baseline + add_team_repository) — stable
  Quality loop (CI, .github/workflows/ci.yml): typecheck+lint+tests both workspaces per push — stable (A-1)

Key ADRs (current):
  ADR-001: transactional outbox — only path from writes to async effects
  ADR-002: Postgres RLS per-tenant isolation via set_tenant_context
  ADR-003: BullMQ/Redis queues, separate worker process, DLQ + replay
  ADR-004: raw-SQL manual migrations — superseded by ADR-007 (pending, A-2)
  ADR-005: JWT/Passport, 4 roles (planner/sports/contracts/admin), route-level authz
  ADR-006: CI = GitHub Actions; package manager = npm (pnpm field removed)

Fitness Functions (CI-enforced):
  FF-1 dependency direction: services/import never import routes — scripts/check-dependency-direction.mjs
  Pattern for new ones: one zero-dep script under scripts/, one rule per script, own CI step.

Domain Glossary (current):
  See docs/governance/domain-glossary.md (enforced). Hot terms: Planza (never Sporza); Team vs Canonical Team (bridge=upsertTeam); Team Membership (never "assignment"); Squad = UI label only.

Integration Map:
  API → Postgres: sync (Prisma, RLS context per request)
  API → OutboxEvent: sync in-tx → outbox consumer → BullMQ: async
  Workers → Socket.IO/webhooks/integrations: async (at-least-once, jobId idempotency)
  Import adapters → TheSportsDB et al.: sync HTTP, rate-limited, dead-letter on failure

Active Technical Debt:
  Register: docs/governance/debt-register.md (TD-1…TD-11)
  Highest interest: TD-6 visibleByRoles unenforced (security, B-1); migration drift (ADR-004→A-2); TD-1 ImportJobRunner 1660 ln blocks Players reuse (C-1)

Current Mode: DELIVERY (preconditions bootstrapped by EPIC A)
