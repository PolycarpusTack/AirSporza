# Phase Execution Checklist

This file tracks the remaining implementation work as a single execution program.

## Phase 1: Provider Completion

- [x] `football_data` adapter wired
- [x] `api_football` adapter wired
- [x] `api_football` adapter tests
- [x] `the_sports_db` adapter wired
- [x] provider capability enforcement in backend routes
- [x] provider capability payload exposed to frontend
- [x] provider-specific configuration/error messaging tightened
- [x] team import support implemented where provider supports it

Exit criteria:
- at least 3 sources have executable adapters
- unsupported scopes are blocked in backend and UI
- source capability data is not duplicated ad hoc across layers

## Phase 2: Durable Execution

- [x] move import execution out of the web process
- [x] add job lease / heartbeat model
- [x] recover abandoned running jobs safely
- [x] convert daily quota exhaustion into deferred scheduling
- [x] add operator cancel / replay / retry flows

Exit criteria:
- jobs survive restarts without in-memory scheduling assumptions
- multi-instance execution is safe

## Phase 3: Governance and Review

- [x] merge-candidate review actions
- [x] alias management for teams / competitions / venues
- [x] centralized field protection rules
- [x] centralized field source-priority rules
- [x] provenance endpoints and UI
- [x] import quality metrics

Exit criteria:
- ambiguous matches never auto-merge silently
- imported field provenance is visible and auditable

## Phase 4: Multi-User Persistence

- [x] persist event field configuration in backend
- [x] persist crew field configuration in backend
- [x] persist dashboard/widget configuration in backend
- [x] audit log configuration changes
- [x] define global vs role vs user scope rules

Exit criteria:
- configuration survives reloads and multi-user use

## Phase 5: UX and Operational Polish

- [x] quota visibility in integrations source cards
- [ ] top-level quota summaries in integrations metrics
- [ ] live job updates in integrations UI
- [ ] stale-session UX polish
- [ ] remove dead integrations UI paths
- [ ] tighten planner / sports / contracts empty and error states

Exit criteria:
- operators can understand provider health, quota state, and job progress without reading logs

## Phase 6: Hardening

- [ ] backend auth integration tests
- [ ] backend import lifecycle tests
- [ ] adapter normalization tests
- [ ] deduplication rule tests
- [ ] frontend integrations and auth tests
- [ ] bootstrap / seed / smoke test docs

Exit criteria:
- critical flows have automated coverage
- local setup and recovery are documented
