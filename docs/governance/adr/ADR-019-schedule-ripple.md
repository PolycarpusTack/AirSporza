# ADR-019: Schedule Ripple — review-before-apply for feed-driven slot changes

**Status:** **Proposed** (2026-07-11, SV-1 spike) — acceptance authority is the architect.

> **Numbering note:** the domain-gaps backlog reserved "ADR-016" for this decision, but ADR-016 was
> taken by the ops-redesign cutover (`ADR-016-ops-cutover.md`); 017/018 are reserved for the RC/RL
> ADRs. This ADR takes the next free number, **019**. Backlog references updated SV-1-T2.

## Context

Evidence from the SV-1 spike (`docs/plans/2026-07-11-sv-1-ripple-spike.md`, all code-confirmed):

- **The gap (G8):** feed imports update event timing (`import/stages/provision.ts` → `updateImportedEvent`)
  but **never** call `eventSlotBridge`/`syncEventToSlot`, so a re-imported kickoff change leaves the event's
  linked `BroadcastSlot.plannedStartUtc/EndUtc` **silently stale**. The manual path (`PUT /events/:id`) *does*
  auto-sync via `shouldSync`. Asymmetry: the trusted manual path syncs; the untrusted feed path doesn't.
- **`ChannelSwitchAction` executes nothing:** its state machine dead-ends at `EXECUTING`; confirm records the
  row + emits a socket/webhook notification — no slot/channel mutation. All four `OverrunStrategy` values are
  descriptive/alert/validation-only.
- **Cascade is court-coupled** (selection + trigger require `sportMetadata.court_id`); its model is "sequential
  events sharing a court," not "one event → its own slots." It cannot carry feed ripple.
- `RippleProposal` is **greenfield**; closest precedent for the review UX is the import `MergeCandidate` flow.

The Schedule Ripple concept (glossary) = the general propagation of an event timing/metadata change to dependent
slots, **with review-before-apply**. `cascade/` stays the court-chain engine (one *source* of ripple, unchanged).

## Decision

### 1. Introduce `RippleProposal` — a reviewable, idempotent slot-change-set

A new entity capturing a *proposed* change to an event's linked slots, awaiting accept/reject. Child of the event
(not the contract). Shape (finalized at SV-2-T1 migration):

```prisma
model RippleProposal {
  id             String        @id @default(uuid()) @db.Uuid
  tenantId       String        @db.Uuid
  eventId        Int
  source         RippleSource                       // FEED | CASCADE | MANUAL
  sourceChangeId String                             // idempotency key — see §4
  status         RippleStatus  @default(PENDING)    // PENDING | APPLIED | REJECTED | SUPERSEDED
  beforeSlots    Json                               // snapshot of affected slots pre-change
  afterSlots     Json                               // proposed slot values
  confidence     Int?                               // optional (feed match confidence)
  createdAt      DateTime      @default(now())
  decidedAt      DateTime?
  decidedBy      String?       @db.Uuid
  rationale      String?                            // reject reason / apply note
  // RLS tenant_isolation in the same migration (ADR-011); @@unique([tenantId, sourceChangeId])
}
enum RippleSource { FEED CASCADE MANUAL }
enum RippleStatus { PENDING APPLIED REJECTED SUPERSEDED }
```

### 2. Source → auto-apply vs propose (the semantic call)

| Source | Behavior | Rationale |
|---|---|---|
| **FEED** (import kickoff/date change to an event **with linked slots**) | **PROPOSE** (RippleProposal, review-before-apply) | External/untrusted; changes can be large or wrong; silently overwriting a published schedule is the operational/compliance risk. This is the G8 fix (SV-2/SV-3). |
| **MANUAL** (`PUT /events/:id`) | **AUTO** (keep `eventSlotBridge`, unchanged) | A human deliberately edited; the edit *is* the review. Adding a proposal would add friction to today's working auto-sync. |
| **CASCADE** (court-chain retiming) | **AUTO** to `estimated*` fields only (unchanged) | Cascade writes *advisory* estimated fields, never `planned*` slot times — no schedule commitment to review. Revisit only if cascade ever writes planned times. |

Feed changes to events with **no** linked slots → no proposal (nothing to ripple); the event updates as today.

### 3. Apply mechanics (AS-7 — reuse, don't fork)

Accepting a proposal applies it **atomically** through the existing machinery — `eventSlotBridge` for auto-linked
slots and/or `scheduleOperations` (optimistic-version append) — **not** a new write path. Apply then **re-runs
validation**, including the rights re-check via `slot-rights v1` (RD-4), and records the outcome. Reject records a
rationale. Idempotent by proposal id: applying an already-`APPLIED` proposal is a no-op; a newer proposal for the
same event supersedes older `PENDING` ones (`SUPERSEDED`).

### 4. Idempotency

`sourceChangeId` = the id of the originating change (e.g. the import job id + event id, or the normalized-event
change fingerprint). Unique on `(tenantId, sourceChangeId)`: re-emitting the same feed change returns the same
proposal (idempotent create → 200), never a duplicate. This mirrors the RD-2 RightsWindow idempotent-create
precedent.

### 5. SV-4 (Contingency Schedules) must BUILD switch execution

Because `ChannelSwitchAction` currently executes nothing (record + notify only), SV-4's "one-action switch" is
**not** "wire up existing execution" — it must build the actual slot-swap execution (the alternate slot set applied
in one transaction). Recorded here so SV-4 is sized honestly.

### 6. TD-28 (overrunStrategy zod drift) — servicing decision

The zod `overrunStrategyEnum = ['EXTEND','TRUNCATE','SWITCH']` diverges from the Prisma enum
(`EXTEND|CONDITIONAL_SWITCH|HARD_CUT|SPLIT_SCREEN`). **Decision:** fix it (regenerate the zod enum from Prisma)
**when SV-2/SV-3 first touch slot writes** — folded into TD-28's broader servicing, not a standalone story, and not
in SV-1. Until then, slot writes cannot set `CONDITIONAL_SWITCH` via the API (API-rejected) — acceptable because no
runtime behavior depends on it (§(b)).

### 7. Flag + gate

Flag **`scheduleRipple`** (build-time per TD-27, default OFF; rollback = redeploy). **AS-8 gate reaffirmed:**
SV-2+ carry a blocking pull gate on `CASCADE_PREVIEW_PARITY` (cascade debt TD-5/12/13/14) before building on
cascade outputs; SV-1 (this spike) has no such gate.

## Alternatives considered

1. **Auto-apply feed changes (no review).** Rejected — the silent-overwrite of a published schedule is exactly
   the risk; review-before-apply is the point of the EPIC.
2. **Generalize the cascade engine to carry feed ripple.** Rejected — cascade is court-coupled at the selection +
   trigger layer and models court chains, not event→own-slots; forcing feed ripple in would entangle two concerns
   and inherit the unserviced cascade debt (AS-8).
3. **Reuse the import `MergeCandidate` flow directly.** Rejected as a mechanism (it's entity-dedup review, a
   different domain) — but adopt its review UX shape as the precedent for RippleProposal accept/reject.
4. **Emit proposals for all sources incl. manual.** Rejected — manual edits are already deliberate; proposals add
   friction to a working path.

## Consequences

- Feed-driven changes stop silently staling slots (G8 fixed) — at the cost of a review queue (a `RippleProposal`
  backlog the ops team works). New entity + capture (SV-2) + review/apply service (SV-3).
- SV-4 is larger than "wire up switch" — it builds execution.
- The overrunStrategy zod drift must be serviced before SV writes those values.
- CASCADE remains auto (advisory estimated fields) — no change to the cascade engine in EPIC SV.

## Open assumptions (do not treat as decided)

1. **Feed-change volume** (proposals/day) is unquantified beyond "every import time-update on a linked-slot event";
   SV-2 measures and may add batching/dedup.
2. **Review-vs-auto for feeds** (FEED = review) is the semantic call this ADR proposes; the backlog flagged it for
   **stakeholder taste-testing** — confirm with the ops stakeholder before SV-3 freezes the UX.
3. **`sourceChangeId` composition** (import-job-id+event-id vs change-fingerprint) is finalized at SV-2-T1 against
   the real `provision.ts` change identifiers.

## Review date

SV retro (SV-2..SV-5 scoping), or 2026-10-11 — whichever comes first.
