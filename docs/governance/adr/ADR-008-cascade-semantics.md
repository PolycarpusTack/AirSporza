# ADR-008: Cascade semantics — engine vs preview divergence

**Status:** Accepted (2026-06-12) · Decision-only (implementation split to TD-12…14 per B-2-T2 budget rule)

## Context

`cascade/engine.ts` (the recompute pipeline behind the cascade worker) and the `schedules.ts`
cascade preview compute confidence differently, and both sides carry mirror comments documenting
the divergence. B-2-T1's characterization suite (`backend/tests/cascade-engine.test.ts`, 23 tests)
pinned both behaviors and surfaced three deeper defects in the engine. Full findings list in the
B-2-T1 report; the decisive ones:

1. **Confidence divergence (the original question):** engine (`compute.ts:97-98`) decays
   confidence on *every* non-completed/live item — a lone scheduled event gets 0.85; the preview
   (`schedules.ts:349,359-364`) keeps the first anchored slot at 1.0 and decays only items that
   chain off an uncertain predecessor.
2. **Midnight anchoring (HIGH, engine):** `engine.ts:125` anchors the first event at
   `startDateBE` *date-only* (00:00 UTC) — `startTimeBE` is never read. Every downstream
   estimate inherits a wrong anchor.
3. **Non-idempotent retry key (HIGH, worker):** `cascadeWorker.ts:39-45` writes outbox events
   with a fresh-UUID idempotency key — BullMQ retries are never deduped.
4. **Split transactions (HIGH, worker):** estimates commit in the engine's transaction; the
   outbox write is a separate transaction; the socket push is outside any. Failure between them
   = committed estimates with no fan-out, then double outbox rows on retry (via 3).

## Decision

1. **The preview's convention is the correct semantic**: a slot anchored to a fixed scheduled
   start is *certain* (confidence 1.0); decay expresses uncertainty inherited from preceding
   uncertain items. Rationale: confidence is a planner-facing signal about *estimated start
   times*; an anchored start has no inherited uncertainty to express. The engine's unconditional
   decay is hereby the **divergent** side.
2. **Reconciliation is deferred, not abandoned.** Aligning the engine is a behavior change to
   live recompute machinery that should be fixed *together with* the midnight-anchor defect
   (fixing confidence first would put high confidence on estimates anchored at 00:00 — worse
   than today). Both land in one flagged follow-up: **TD-12** (anchor + confidence parity,
   flag `CASCADE_PREVIEW_PARITY`, default off), with TD-13 (idempotency key
   `cascade.recomputed:<courtId>:<dateStr>:<computedAtBucket>`) and TD-14 (move the outbox write
   into the engine transaction — the codebase's own ADR-001 pattern) scheduled with it.
3. Until then the divergence is **accepted and documented**: the preview is authoritative for
   planner-facing confidence display; engine-produced `CascadeEstimate.confidenceScore` is known
   to be conservatively low for chain-first items. The mirror comments in both files stay.
4. The characterization suite is the contract: any TD-12…14 implementation must update its
   expectations deliberately, one assertion at a time, each justified against this ADR.

## Alternatives considered

- **Patch confidence now (small diff):** rejected — couples wrongly with the midnight anchor (see 2).
- **Declare the engine correct:** rejected — no consumer benefits from first-item decay; the
  preview's comment documents intent ("first slot is certain — intentionally differs").
- **Big-bang fix of all four findings here:** rejected — exceeds B-2-T2's ≤12k budget and bundles
  four behavior changes without individual desired-semantics tests (violates P1/P2).

## Rollback trigger (for the future TD-12 implementation)

Planner-visible miscalculation reports after enabling `CASCADE_PREVIEW_PARITY` → flag off
restores characterized behavior exactly (suite re-verifies).

## Review date

When TD-12 is scheduled (target: with EPIC C cascade work) or 2026-09-12, whichever first.

## Implemented (2026-07-23, story CASCADE_PREVIEW_PARITY / AS-8)

- **TD-12** behind build-time flag `CASCADE_PREVIEW_PARITY` (default off; `env.ts` safe
  string parse; read at the cascadeWorker boundary, threaded as an option — pure code
  never reads env): anchor = `startDateBE + startTimeBE` via shared `beClockToUtc`
  (blank/malformed time → documented date-only fallback) + preview confidence convention
  in `cascade/compute.ts` (`computeCascadeChain(items, { previewParity })`).
- **TD-13/TD-14** flag-independent, per Decision 2: deterministic key
  `cascade.recomputed:<tenantId>:<courtId>:<dateStr>:<5-min computedAt bucket>` (tenantId
  added to the key sketch because `idempotencyKey` is a GLOBAL unique column — without it
  a second tenant on the same court+date would be silently deduped away), written INSIDE
  the engine transaction via `writeOutboxEventDeduped` (createMany + skipDuplicates =
  ON CONFLICT DO NOTHING); socket push stays post-commit (non-transactional client nudge).
- **Decision 4 honored:** flag-off characterization suite unchanged except the TD-13/14
  expectations, each updated with an inline justification; desired flag-on semantics in
  `tests/cascade-preview-parity.test.ts` (values derived from the preview code).
- Rollback trigger above stands: flag off restores characterized TD-12 behavior exactly.
