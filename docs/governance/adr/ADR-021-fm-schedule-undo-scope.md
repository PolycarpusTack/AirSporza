# ADR-021: FM schedule-board undo is session-scoped, not server-side

**Status:** **Accepted** (2026-08-14, backlog-builder drafted; ratified by architect 2026-08-14 —
Recommendation as drafted, Option 1, no changes)

## Context

The FM Schedule board (`docs/design_handoff_planza_fm/README.md` §2, EPIC FM-2 / Phase 2.4 in
`IMPLEMENTATION_PLAN.md`) adds a client-visible **History** section — numbered entries of recent
moves (channel reassignment, placement) plus "↶ UNDO LAST" — over the *existing* live mutation
endpoints (channel/slot assignment APIs already used by `PlannerView`/ops). The
`IMPLEMENTATION_PLAN.md` names this as a risk in its own words: *"Undo over live APIs — inverse-
mutation stack can drift from server state under concurrent edits; scope to the session and
invalidate on websocket event updates."* That sentence is a stated mitigation, not a ratified
architectural decision — it has not been through an ADR, and it directly shapes EPIC FM-2's Story
2.4 task design (does undo need a server-side compensating-transaction log, or a purely
client-side inverse-mutation stack?).

This does not block EPIC FM-1 (Phase 0/1 touch no mutation paths at all — Home/inbox/CONTINUE/
create-modal are read-heavy plus single, already-idempotent creates). It is raised now because
EPIC FM-2 is flagged in the plan's own sizing note as "the biggest risk, touches mutation paths"
and should not start implementation with this still informal.

## Options considered

1. **Client-side inverse-mutation stack, session-scoped (the plan's stated approach).** Each
   history entry stores `{label, prevState}`; UNDO re-issues the existing mutation endpoint with
   the previous value. No new backend surface. Stack is held in FM shell state (or `sessionStorage`
   for reload survival within a tab) and is explicitly invalidated — cleared or marked stale — on
   a websocket event update touching an entry's underlying event/slot, so a stale undo can never
   silently clobber a concurrent edit made by someone else.
2. **Server-side compensating-transaction log** (a `ScheduleUndoEntry` table recording the
   inverse of each mutation, expiring after N minutes; UNDO calls a dedicated
   `POST /api/schedule/undo/:entryId` that re-validates before applying). Survives reload/device
   switch, correct under concurrency (server can re-check `updatedAt` before compensating), but is
   materially more backend work — migration, RLS, idempotency, staleness handling — for a UX
   affordance the design frames as a lightweight "oops" convenience, not an audit/compliance
   feature.
3. **No undo in v1; rely on the existing per-field edit flows to "undo" manually.** Rejected —
   drops a named, screenshot-visible design affordance (history section + UNDO LAST + banner UNDO)
   without a stated reason; the design's own UX critique (`Design Notes.dc.html` §03) frames
   reversibility as a core improvement over the current app ("Scheduling becomes reversible and
   consequence-aware").

## Recommendation

**Option 1**, matching the plan's own stated mitigation, with the invalidation rule made concrete
and testable rather than left as prose: an UNDO action against a history entry whose target
event/slot has a `updatedAt` newer than the entry's captured pre-mutation snapshot must be refused
client-side with a visible "this changed since — refresh" state, not silently applied over newer
data. This gives most of Option 2's safety property (never clobber a concurrent edit) without its
backend surface, at the cost of the documented residual risk: an edit landing between the
websocket update and the staleness check is still possible (same class of gap the ops redesign
accepted for AS-8/rights thresholds — visible and stated, not silently absorbed). Scope
explicitly: session/tab-local, no cross-device history, no server persistence, no undo of another
user's concurrent action.

## Consequences

- EPIC FM-2 Story "History + undo" ships with no new migration — smaller, faster, matches the
  plan's own sizing.
- The staleness-refusal rule must be pinned by a test at implementation time (mirrors the ops
  redesign's own precedent of turning a risk-list sentence into a named pinning test — see
  `docs/sv3-continue-prompt.md`'s B2/B5 staleness/resurrect-guard pins for the ripple work).
- If real usage shows undo needs to survive reload/device-switch (a plausible future ask), this ADR
  is revisited — Option 2 becomes the upgrade path, not a rewrite (the inverse-mutation shape is
  the same; only persistence moves server-side).

## Review date

EPIC FM-2 Story "History + undo" DoR gate, or 2026-11-14.
