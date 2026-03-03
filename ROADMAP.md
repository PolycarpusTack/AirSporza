# SporzaPlanner Development Roadmap

## Milestone Overview

| Milestone | Description | Sprints |
|-----------|-------------|---------|
| **A: Data Integrity** | Core event data safety | Sprint 1 |
| **B: Safe One-Provider Imports** | Durable import foundation | Sprint 2 + S3-01 + S4-01 |
| **C: Multi-Source Import Beta** | Full import governance | Sprint 3 + 4 + 5 |
| **D: Multi-User Operational** | Team collaboration | Sprint 6 + 7 |
| **E: Release Hardening** | Production ready | Sprint 8 |

---

## Sprint 1: Stabilization

**Goal:** Remove current data-integrity risks before deepening imports.

### S1-01: Persist custom event fields on create/edit
**Depends on:** none  
**Effort:** Medium  
**Acceptance:**
- Custom fields entered in the event form are saved into `customFields`
- Editing an event rehydrates saved custom values
- No loss of custom data on update

### S1-02: Protect core event identity fields
**Depends on:** none  
**Effort:** Small  
**Acceptance:**
- `sport` and `competition` cannot be hidden or deleted
- Save rejects invalid `sportId`/`competitionId`
- No event is persisted with 0 IDs

### S1-03: Add schema-level event validation in backend
**Depends on:** S1-02  
**Effort:** Small  
**Acceptance:**
- Backend rejects malformed event payloads even if UI misbehaves
- Validation errors are user-readable

### S1-04: Handle stale JWTs cleanly in frontend
**Depends on:** none  
**Effort:** Small  
**Acceptance:**
- 401 from `/auth/me` clears token once
- User is redirected to login/dev login cleanly
- No repeated noisy auth failures after refresh

### S1-05: Harden API client response handling
**Depends on:** none  
**Effort:** Small  
**Acceptance:**
- 204 No Content does not throw
- Common API errors are normalized
- 401 hooks into auth cleanup

### S1-06: Hide unsupported integrations actions
**Depends on:** none  
**Effort:** Small  
**Acceptance:**
- UI clearly marks unsupported providers/scopes
- Manual sync cannot be run for unsupported adapters

### S1-07: Add regression tests for event form and auth bootstrap
**Depends on:** S1-01, S1-04, S1-05  
**Effort:** Medium  
**Acceptance:**
- Tests cover custom field save/load
- Tests cover stale token recovery

---

## Sprint 2: Durable Import Execution

**Goal:** Jobs survive restarts and failures.

### S2-01: Introduce durable import job runner
**Depends on:** S1-06  
**Effort:** Large  
**Acceptance:**
- Jobs are not executed via `setTimeout`
- Jobs survive process restart
- Runner can resume queued work

### S2-02: Add job state machine and leasing
**Depends on:** S2-01  
**Effort:** Medium  
**Acceptance:**
- States: `queued`, `running`, `completed`, `failed`, `partial`
- Running jobs have lease/heartbeat or equivalent recovery marker

### S2-03: Add retry/backoff policy
**Depends on:** S2-01  
**Effort:** Medium  
**Acceptance:**
- Retryable errors are retried
- Fatal/auth errors fail immediately
- Retry counts are visible

### S2-04: Add dead-letter replay endpoint
**Depends on:** S2-03  
**Effort:** Medium  
**Acceptance:**
- Failed records can be retried from stored payloads
- Replay updates job/dead-letter state

### S2-05: Add live job progress API
**Depends on:** S2-01  
**Effort:** Small  
**Acceptance:**
- Job detail returns progress counts
- UI can poll or subscribe to progress

### S2-06: Add integration tests for job lifecycle
**Depends on:** S2-01, S2-03, S2-04  
**Effort:** Medium  
**Acceptance:**
- Tests cover queue, fail, retry, replay

---

## Sprint 3: Import Governance

**Goal:** Controlled, auditable imports.

### S3-01: Implement real rate-limit tracking
**Depends on:** S2-01  
**Effort:** Medium  
**Acceptance:**
- Requests are throttled per source config
- Source quota state is persisted

### S3-02: Persist source capability metadata
**Depends on:** none  
**Effort:** Small  
**Acceptance:**
- Each source declares supported scopes/entities
- UI and runner both respect capability flags

### S3-03: Add protected-field merge policy
**Depends on:** S1-02  
**Effort:** Medium  
**Acceptance:**
- Internal planning fields are never overwritten by imports
- Protected rules are centralized, not ad hoc

### S3-04: Add field-priority matrix execution
**Depends on:** S3-03  
**Effort:** Large  
**Acceptance:**
- Source precedence is applied per field
- Audit/provenance reflects winning source

### S3-05: Add merge-candidate review actions
**Depends on:** S2-05  
**Effort:** Medium  
**Acceptance:**
- Approve merge
- Create new
- Ignore
- Force-link existing

### S3-06: Add provenance panel endpoints
**Depends on:** S3-04  
**Effort:** Small  
**Acceptance:**
- Current value, source, and timestamp are queryable per field

---

## Sprint 4: Provider Expansion

**Goal:** Multiple real data sources.

### S4-01: Implement api_football adapter
**Depends on:** S2-01, S3-01, S3-02  
**Effort:** Large  
**Acceptance:**
- Fixtures and live updates import successfully
- Source-specific config is validated

### S4-02: Implement the_sports_db adapter
**Depends on:** S2-01, S3-02  
**Effort:** Large  
**Acceptance:**
- Sports/leagues/events import successfully
- Adapter marks weaker-confidence fields appropriately

### S4-03: Add adapter health/config validation
**Depends on:** S4-01, S4-02  
**Effort:** Small  
**Acceptance:**
- Missing API keys are surfaced clearly
- Provider health shows config validity and last successful sync

### S4-04: Restrict per-source scope options in UI
**Depends on:** S3-02, S4-01, S4-02  
**Effort:** Small  
**Acceptance:**
- User can only choose scopes the provider supports

### S4-05: Add provider integration tests
**Depends on:** S4-01, S4-02  
**Effort:** Medium  
**Acceptance:**
- Mocked adapter tests cover fetch, normalize, and failure classification

---

## Sprint 5: Deduplication and Canonicalization

**Goal:** Accurate entity matching across sources.

### S5-01: Improve canonical team resolution
**Depends on:** S3-05  
**Effort:** Medium  
**Acceptance:**
- Team alias resolution is deterministic
- Team matching is source-aware

### S5-02: Improve canonical competition resolution
**Depends on:** S3-05  
**Effort:** Medium  
**Acceptance:**
- Competition aliases and season handling work across providers

### S5-03: Add venue canonicalization
**Depends on:** S3-05  
**Effort:** Small  
**Acceptance:**
- Venue aliases are resolved and stored consistently

### S5-04: Add non-home/away sport matching strategy
**Depends on:** S5-01, S5-02  
**Effort:** Medium  
**Acceptance:**
- Tennis/cycling/athletics use participant-set/stage/date logic

### S5-05: Tune confidence scoring by source pair
**Depends on:** S4-01, S4-02, S5-04  
**Effort:** Medium  
**Acceptance:**
- Thresholds differ for same-source vs cross-source
- Review rate is measurable

### S5-06: Add replay-after-rules-change flow
**Depends on:** S2-04, S5-05  
**Effort:** Small  
**Acceptance:**
- Historic raw records can be reprocessed after matcher updates

---

## Sprint 6: Multi-User Persistence

**Goal:** Settings survive sessions.

### S6-01: Persist event field config in backend
**Depends on:** S1-01, S1-02  
**Effort:** Medium  
**Acceptance:**
- Event field definitions survive reload and are shared as intended

### S6-02: Persist crew field config in backend
**Depends on:** S6-01  
**Effort:** Small  
**Acceptance:**
- Crew field settings are not local-only anymore

### S6-03: Persist dashboard layout in backend
**Depends on:** none  
**Effort:** Small  
**Acceptance:**
- Widget layout survives reload and user switch

### S6-04: Decide config scope model
**Depends on:** S6-01, S6-02, S6-03  
**Effort:** Small  
**Acceptance:**
- Clear rules for global vs role vs user settings

### S6-05: Add audit logs for settings changes
**Depends on:** S6-04  
**Effort:** Small  
**Acceptance:**
- Config changes are traceable by user/time

---

## Sprint 7: Realtime and UX Hardening

**Goal:** Polish user experience.

### S7-01: Introduce a single socket provider
**Depends on:** none  
**Effort:** Small  
**Acceptance:**
- One socket connection per app session
- Views subscribe through shared context

### S7-02: Sync import jobs to UI in realtime
**Depends on:** S2-05, S7-01  
**Effort:** Small  
**Acceptance:**
- Integrations panel updates without refresh

### S7-03: Normalize frontend data refresh strategy
**Depends on:** S7-01  
**Effort:** Medium  
**Acceptance:**
- API fetch and socket events do not duplicate or fight each other

### S7-04: Improve empty/error/loading states
**Depends on:** none  
**Effort:** Medium  
**Acceptance:**
- Integrations, planner, sports, and contracts show meaningful failure states

### S7-05: Add session-expired UX
**Depends on:** S1-04  
**Effort:** Small  
**Acceptance:**
- User sees a clear message and next action instead of silent redirect/log spam

---

## Sprint 8: Test and Release Hardening

**Goal:** Production confidence.

### S8-01: Add backend auth integration tests
**Depends on:** S1-04, S1-05  
**Effort:** Medium

### S8-02: Add backend event CRUD integration tests
**Depends on:** S1-01, S1-02, S1-03  
**Effort:** Medium

### S8-03: Add import runner integration tests
**Depends on:** S2-01, S3-04, S4-01  
**Effort:** Large

### S8-04: Add deduplication test matrix
**Depends on:** S5-05  
**Effort:** Medium

### S8-05: Add frontend integration tests for Integrations tab
**Depends on:** S4-04, S7-04  
**Effort:** Medium

### S8-06: Add environment/bootstrap documentation
**Depends on:** none  
**Effort:** Small  
**Acceptance:**
- Clear setup for DB port, seeding, auth reset, provider keys

---

## Priority Order (Fastest Path to Value)

1. **S1-01** - Persist custom event fields
2. **S1-02** - Protect core event identity fields
3. **S1-04** - Handle stale JWTs cleanly
4. **S2-01** - Introduce durable import job runner
5. **S2-03** - Add retry/backoff policy
6. **S3-01** - Implement real rate-limit tracking
7. **S4-01** - Implement api_football adapter
8. **S5-05** - Tune confidence scoring by source pair
