# EPIC C — Phase Summary (2026-06-12, partial: C-0 + C-1 + quality pass)

## Done

- **C-0 (FEATURE):** all four characterization-defect fixes — TD-15 (crewConflicts minutes), TD-16 (parseDurationMin HH:MM:SS/'45m'/'0' + durationMin honored), TD-17 (readiness channelId), TD-18 (fail-visible conflict preflight). Desired-semantics tests first (14 red), every pinned-test change cites its TD item.
- **C-1 (PREP):** `ImportJobRunner.ts` 1660 → **330-line orchestrator** + 6 stage modules (`stages/shared|provision|records|process|progress|failure`). Pure moves — backend suite 251 green with zero test edits. `ImportStages` contract snapshot (`docs/governance/contracts/import-stages.md`) = **EPIC G is now unblocked**.
- **C-quality (review pass, 4 finder angles → 10 deduped findings):**
  - TD-18 hole closed: confirmation keyed to the exact warning-set signature shown to the user.
  - Duration split-brain was app-wide: `resourceConflicts.ts`/`ResourceTimeline.tsx` still had pre-TD-15 HOURS logic; `CalendarGrid` height ignored `durationMin`. All unified on shared `effectiveDurationMin` (dateTime.ts) — 16 new tests.
  - AppProvider incremental: cancellation on user switch + failure reset (stale-events leak across accounts).
  - Runner success path → guarded `writeSyncHistory` (write failure no longer marks a completed import failed).
  - `buildEventParams` extracted (one filter-serialization rule for list/listPaged).

## Debt movements

Settled: TD-1 (residual → TD-21), TD-15/16/17/18 (TD-15 finding-3 residual noted). Added: TD-20 (progress stats regression on swallowed write failure — pre-existing, moved code), TD-21 (process*Record triplication — collapse as FIRST task of EPIC G G-3).

## Remaining EPIC C stories (next session)

- **C-2:** split `routes/import.ts` (1352 ln) into sub-routers (TD-2).
- **C-3:** PlannerView `usePlannerUndo` extraction + TD-19 fixes (undo lock check, slot-consumed-pre-API); retire the logic-replicating `PlannerView.dnd.test.tsx` into the real-component suite.
- **C-4:** AdminView split (TD-4). Also TD-3 PlannerView size reduction beyond the undo hook.

## Suite state

Frontend: 11 files / 162 tests. Backend: 33 files / 251 tests (+1 DB smoke in CI). CI: both jobs green, ~1–2 min.
