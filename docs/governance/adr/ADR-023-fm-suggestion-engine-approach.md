# ADR-023: FM unplaced-event slot suggestions ship as a rules engine, never an auto-commit

**Status:** **Accepted** (2026-08-14, backlog-builder drafted; ratified by architect 2026-08-14 —
Recommendation as drafted, Option 1, no changes)

## Context

The FM Schedule board's UNPLACED tray (`docs/design_handoff_planza_fm/README.md` §2, EPIC FM-2 /
Phase 2.1 in `IMPLEMENTATION_PLAN.md`) shows per-event "slot suggestion hints" and an
"⚡ AUTO-SUGGEST SLOTS" action; the inspector's "NOT PLACED" card offers "PLACE IN SUGGESTED SLOT".
`IMPLEMENTATION_PLAN.md`'s own Phase 2.1 already proposes an approach — *"suggestion engine v1 =
rules over channel load + rights validity + crew availability (backend endpoint
`GET /api/schedule/suggestions?week=`)"* — and its own Risks section separately flags quality —
*"Suggestion quality — rules v1 will misplace edge cases; keep suggestions as proposals (dashed
style, explicit PLACE) never auto-commits."* This ADR exists to ratify that stated approach as a
committed decision (not just a plan paragraph) before EPIC FM-2 builds the suggestions endpoint,
because "rules v1" vs a scored/ranked model vs deferring suggestions entirely changes the
endpoint's contract shape and its test surface materially.

Does not block EPIC FM-1: the UNPLACED *action-item kind* in Story FM1-3 only detects unplaced
events (a pure predicate over existing event/slot data) — it does not suggest a slot for them.
Suggestion generation is entirely EPIC FM-2 scope.

## Options considered

1. **Rules engine v1** (the plan's own proposal): a deterministic scoring function over channel
   load (existing slot occupancy per channel/day), rights validity (reuse `deriveRightsStatus` —
   never suggest a channel that would put the event in a `MISSING`/`NEGOTIATION` rights state if
   avoidable), and crew availability (reuse `detectCrewConflicts`'s complement — don't suggest a
   slot that immediately produces a new conflict). Returns a ranked top-N candidate list per
   unplaced event, never writes anything.
2. **Defer suggestions; ship the UNPLACED tray with manual PLACE only** (drop AUTO-SUGGEST from
   v1). Rejected: the design's own risk mitigation ("keep suggestions as proposals... never
   auto-commit") already resolves the safety concern that would otherwise justify deferring — the
   remaining objection is pure implementation effort, which Option 1 keeps small (a scoring
   function over data already computed by existing selectors, no new model).
3. **ML/learned ranking** (e.g. a model trained on historical placement decisions). Rejected for
   v1: no training data pipeline exists, no stated business case for it over deterministic rules,
   and it would introduce a genuinely new trust/explainability question (why did the system
   suggest this slot?) that a rules engine avoids by being inspectable.

## Recommendation

**Option 1**, with the "never auto-commit" property enforced structurally, not just by UI
convention: `GET /api/schedule/suggestions?week=` is a **read-only** endpoint (no mutation), and
"PLACE IN SUGGESTED SLOT" / AUTO-SUGGEST both resolve to the exact same existing slot-mutation
call an explicit manual PLACE would use — there is no separate "commit suggestion" code path that
could accidentally skip a check the manual path enforces. Suggestion quality (edge-case
misplacement) is an accepted, named risk per the plan's own words — mitigated by the proposals-not-
commits property, not eliminated.

## Consequences

- EPIC FM-2's suggestions endpoint has a small, testable contract: given a week + the set of
  unplaced events, return ranked candidates; no writes, no side effects — straightforward to unit
  test with fixture permutations (mirrors the rigor already applied to `deriveRightsStatus`/
  `deriveCrewHealth` in the Ops redesign).
- If rules v1 proves too coarse in real use, refining the scoring function is a same-endpoint
  change (tune weights/add a factor), not a rewrite; only a shift to a learned-ranking approach
  (Option 3) would need a new ADR.
- No new external trust boundary (STRIDE-light note): suggestions are computed entirely from data
  already inside the tenant's own database.

## Review date

EPIC FM-2 Story 2.1 DoR gate, or 2026-11-14.
