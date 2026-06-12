# EPIC B — Phase Summary (2026-06-12)

_Core §4.3 checkpoint. EPIC B (High-Value Mitigations) complete: 10/10 tasks, same session as EPIC A._

## What was built

- **B-1 Field visibility enforcement (closes TD-6 on flag-on):** `fieldVisibility` service +
  4 choke points (`/api/fields`, `/api/events`(+`/:id`), `/api/tech-plans`(+`/:id`)), flag
  `FIELD_VISIBILITY_ENFORCEMENT` default off, 23 contract/unit tests, fail-closed semantics,
  contract snapshot + runbook procedure. ASM-5 resolved: the frontend never referenced
  `visibleByRoles` — `[] = public` is uncontradicted; admin UI editor noted as follow-up.
- **B-2 Cascade characterization + ADR-008:** 23 golden-master tests pin engine/worker/outbox
  routing; 11 findings (3 HIGH) → preview's first-slot-certain confidence declared correct;
  reconciliation deferred to one flagged story (TD-12) because the midnight-anchor defect must be
  fixed with it; TD-13/14 scheduled alongside.
- **B-3 Frontend test foundation:** suite grew 1 file/9 tests → **9 files/135 tests**
  (utils, DynamicEventForm validation, PlannerView undo — real-component, not replicated logic).
  24 pinned findings across T1–T3 → TD-15…TD-19.
- **B-4 Pagination (services TD-7 for top endpoints):** ADR-009 envelope on `/api/events`,
  `/api/teams`, 4 import listings (offset-keyed there — legacy `limit` consumers untouched);
  `INCREMENTAL_LOADING` frontend flag: first page renders, rest streams, socket inserts win
  (race-tested). Server default limits stay off until the flag is proven on.

## EPIC DoD check

1. ✅ visibleByRoles enforced with per-role contract tests in CI behind a flag — **flag not yet
   turned ON in any environment** (enablement procedure in runbook-api; turning it on is an
   operational step for the user, not a code task).
2. ✅ cascade engine characterized; divergence accepted in ADR-008 with scheduled reconciliation.
3. ✅ events/teams/import listings paginated with tests; frontend incremental loading shipped
   flag-off with E2E smoke; no functional regression (full suites green, CI green).

## What was learned

- Characterization pays immediately: 35 pinned findings across cascade + frontend, including
  four genuine defect clusters (midnight anchor TD-12, hours-vs-minutes TD-15, fail-open
  conflict check TD-18, undo lock-bypass TD-19) — none previously known.
- The CI loop caught a real error (NBSP in a test regex) that partial local linting missed —
  first evidence for EPIC A's "CI catches ≥1 real defect in month one" success metric.
- Agent-written tests need a full-repo lint gate before push (process note for future fan-outs).
- `vi.clearAllMocks()` vs inline `mockResolvedValue` and unstable mock identities in provider
  tests are recurring traps; `test-utils.tsx` + stable module-level mocks are the pattern.

## Flow data (rough, commit-based)

EPIC A: 11 tasks in ~1.5h wall clock. EPIC B: 10 tasks in ~1.5h (3 agent-parallel).
Rework: 2 instances (CI lint red after push; provider test mock bugs) — both <15 min cycles.

## Debt movements

- Closed: TD-6 (pending flag-on), TD-7 (top-3 endpoints; remainder follow-the-pattern).
- Added: TD-12…TD-19 (8 items — all *discovered* pre-existing defects, not new shortcuts).
- TD-11 (coverage threshold): suite now exists (135 tests) — proposal: start ratchet at
  current coverage when B-3 follow-ups land in EPIC C.

## Mode check

Stay in **DELIVERY**. Next per plan: **EPIC C** (god-file decomposition — now with safety nets:
cascade + undo characterization, form tests), with the TD-15/TD-18 defect fixes as its first
FEATURE stories. EPIC G (Players) remains gated on C-1 import-stage extraction.

## Operational follow-ups for the user

1. Enable `FIELD_VISIBILITY_ENFORCEMENT=true` in `backend/.env` (procedure: runbook-api.md) —
   TD-6 closes fully on flag-on.
2. Optionally enable `VITE_INCREMENTAL_LOADING=true` for the frontend once comfortable.
3. The abandoned PG16 database on :5432 still awaits deletion (from EPIC A audit).
