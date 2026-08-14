# Planza — Session Status

_Last updated: 2026-08-14_

> Authoritative resume doc: **`docs/sv3-continue-prompt.md`** (2026-07-24, post-#27).
> This file is only a snapshot; the continue prompt + backlog carry the detail.
> (The 2026-03-04 version of this file is preserved in git history — everything in it shipped
> and was superseded by the domain-gaps initiative; see `docs/governance/migration-audit-2026-06.md`.)

## Repo state (verified 2026-08-14)

- `main` at `0d6a3b5` (docs session save on top of #27 `c82a01f`), in sync with origin.
- Baselines re-verified on the new machine: backend **779 pass / 57 skipped** (RLS suites skip
  locally, run in CI DB job) · frontend **838 pass** · `tsc --noEmit` clean both. Matches the
  documented baselines exactly.

## Environment (machine moved Windows → Linux, 2026-08-13)

- Project now lives at `/home/yannick/Claude/Projects/AirSporza` (was `C:\Projects\Planza`).
- **Node ≥ 20.19 required** for the frontend suite (jsdom chain uses `require(esm)`).
  `~/.local` Node upgraded to **v22.14.0** on 2026-08-14 — on 20.18.x the frontend suite fails
  with 33 `require() of ES Module` errors.
- **Dev DB (2026-08-14):** Docker installed; PostgreSQL **17** runs as container `planza-db` on
  **localhost:5433** (db `sporza_planner`, matching the runbook — the baseline `0_init` is a PG17
  dump, and CI pins `postgres:17`). All 13 migrations deployed, `planza_app` NOLOGIN role present,
  demo data seeded (`npm run db:seed`). The compose file's `postgres:16-alpine` on 5432 remains the
  RETIRED path per `docs/governance/runbook-ci-and-migrations.md` — do not use it for the dev DB.
  Note: the old machine's live data did not migrate; this is a fresh seeded DB (restore a
  `backups/*.dump` from the old machine if its data is ever needed).
- **Redis:** container `planza-redis` (`redis:7-alpine`) on **localhost:6379** — required by the
  outbox worker + backend queues (`REDIS_URL` default); was undocumented (the old machine ran a
  local Redis that appears in no setup doc or compose file).
- GitHub CLI installed and authenticated (`gh`); git pushes via gh credential helper.
- Launch: `npm run dev:full` (frontend :5173 + API :3001 + worker); dev-login with the seeded
  accounts (no password in development).

## Where we are

Everything through PR #27 is merged (see the continue prompt's table): RC-5 per-tenant
accessibility config (#26) and SV-2 feed-change capture → RippleProposal (#27, flag
`scheduleRipple` OFF, snapshot `ripple v1`).

## Open lanes (detail in `docs/sv3-continue-prompt.md`)

1. **SV-3** (next code story, EPIC SV) — two people-gates first: (a) FEED=review ops-stakeholder
   taste-test (ADR-019 Open assumption 2); (b) TD-28 servicing named on its pull gate. Flow:
   DoR re-gate → backlog expansion → architect micro-decisions → execution.
2. **RC-0 people-work** (architect): KPI verification via `PUT /api/accessibility/config`,
   ADR-017 enforcement-boundary session, besluit-2004 seed-list legal check.
3. **Standing threads:** RD-6 · RD-7 · RC-3 (HELD) · RC-4 · SV-4 switch-execution build ·
   ops mutation surfaces + ImportView tabs.

## Open debt

- **TD-28** — overrunStrategy zod drift; servicing named on SV-3's pull gate.
- **TD-32** — frontend `ApiError` discards structured 409 bodies; service with first UI consumer
  of `accessibilityApi`.
