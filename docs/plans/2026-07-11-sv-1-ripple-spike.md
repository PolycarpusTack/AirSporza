# SV-1 SPIKE — Schedule-ripple semantics + volatility machinery verification

> Findings memo (SV-1-T1). Feeds **ADR-019** (schedule ripple; renumbered from the backlog's
> "ADR-016" — that number was taken by the ops-redesign cutover ADR). Domain-gaps initiative,
> 2026-07-11. All findings are code-confirmed (file:line); investigation was read-only.

## Executive summary

The volatility machinery is **less "wired" than the model names imply**. Three findings shape ADR-019:

1. **The core gap (G8) is confirmed and one-sided.** Feed imports update event timing but **never** sync
   linked BroadcastSlots → the schedule grid silently shows the *old* slot time after a feed moves an event.
   Manual event edits (`PUT /events/:id`) *do* auto-sync via `eventSlotBridge`. So the asymmetry is real:
   trusted manual path syncs; untrusted feed path doesn't.
2. **`ChannelSwitchAction` executes nothing.** Its state machine dead-ends at `EXECUTING`; no code writes
   `COMPLETED`/`FAILED`, and confirm mutates **no** slot/channel — it records the row + emits a socket/webhook
   notification. All four `OverrunStrategy` values are descriptive/alert/validation-only (no runtime slot
   mutation). Consequence: SV-4 (Contingency Schedules) must **build** switch execution, not wire up existing.
3. **Cascade cannot carry feed ripple.** The engine is hard-coupled to court chains (selection + trigger layer
   require `sportMetadata.court_id`/`order_on_court`); its semantic model is "N sequential events sharing a
   court." A football kickoff-shift (one event → *its own* linked slots) has no representation. Feed-driven
   ripple is a **distinct mechanism**, not a cascade generalization.

`RippleProposal` is **greenfield** (no existing reviewable schedule-change-set). The closest precedent is the
import **`MergeCandidate`** review flow — model the proposal's review UX on it, not its domain.

## Verified answers (AC (a)–(d))

### (a) ChannelSwitch execution — alert + record only. CONFIDENCE: confirmed
- Model is `ChannelSwitchAction` (`schema.prisma:1756-1781`); `executionStatus SwitchExecutionStatus @default(PENDING)`;
  `enum SwitchExecutionStatus { PENDING EXECUTING COMPLETED FAILED }` (`:1749-1754`).
- **Only writer past PENDING:** `POST /api/channel-switches/:id/confirm` → `EXECUTING` (`routes/channelSwitches.ts:48-78`, write `:59`). **Nothing writes `COMPLETED`/`FAILED`**; `autoConfirmed` never written. The machine dead-ends at `EXECUTING`.
- Confirm mutates only the row + emits `channel_switch.confirmed` → routes to `['socketio','webhook']` (`workers/outboxConsumer.ts:32`) — notification lanes, **no slot/channel mutation, no worker consumes it to switch**.
- `CONDITIONAL_SWITCH` only reaches runtime as an **alert**: `cascade/alerts.ts:54-67` emits `TRIGGER_THRESHOLD_MET` ("confirm or cancel switch") and copies `overrunStrategy` into the alert payload. Alert, not execution.

### (b) OverrunStrategy runtime effect — descriptive/alert/validation-only. CONFIDENCE: confirmed
`enum OverrunStrategy { EXTEND CONDITIONAL_SWITCH HARD_CUT SPLIT_SCREEN }` (`schema.prisma:1395-1400`); `BroadcastSlot.overrunStrategy @default(EXTEND)`.
- EXTEND — the hardcoded default (`eventSlotBridge.ts:131` hardcodes `'EXTEND'`); no branch keys off it.
- CONDITIONAL_SWITCH — one advisory WARNING (`validation/structural.ts:164`: missing target → `NO_OVERFLOW_AVAILABLE`) + alert payload. No mutation.
- HARD_CUT, SPLIT_SCREEN — descriptive-only; no consumer branches.
- **No value drives a slot mutation / cascade decision / channel switch.**
- ⚠ **Schema drift (TD-28):** zod `overrunStrategyEnum = z.enum(['EXTEND','TRUNCATE','SWITCH'])` (`schemas/broadcastSlots.ts:5`) ≠ Prisma enum. `CONDITIONAL_SWITCH` is API-rejected; `TRUNCATE`/`SWITCH` aren't DB values.

### (c) Cascade generalizability — court-coupled; cannot handle feed ripple as-is. CONFIDENCE: confirmed
- Court-keyed signature `runCascade(tenantId, courtId, date)` (`cascade/engine.ts:48-53`); selection filters `sportMetadata.court_id` (`:63-74`); ordering by `order_on_court` (`:77-81`); the worker hard-skips non-court events (`cascadeWorker.ts:77-81`, `:105-106`, `:113-116`).
- The **pure** `computeCascadeChain` (`cascade/compute.ts:62-137`) is court-agnostic (walks an ordered `CascadeItem[]`), but its model is "sequential events sharing one court, each after the previous ends" — **not** "one event's kickoff moves → its own slots ripple." No event→own-slots concept.

### (d) Import-path event-update flow — updates event, never syncs slots. CONFIDENCE: confirmed
- **Zero** `eventSlotBridge`/`syncEventToSlot` calls in `backend/src/import/*`. Event timing writes: `provision.ts` `updateImportedEvent` (`db.event.update`, `:995`) + create sites (`:812`, `:940`); patch writes `startDateBE`/`startTimeBE` directly (`buildImportedEventData:1108-1109`).
- Emits `event.updated` → `['socketio','webhook']` only (`outboxConsumer.ts:17`) — **not** cascade, **not** slot sync. (Only `event.status_changed` → cascade, and cascade needs `court_id`.)
- **Contrast:** `PUT /events/:id` → `if (shouldSync(existing, updated)) syncEventToSlot(...)` (`routes/events.ts:670-677`); `shouldSync` triggers on `{channelId, startDateBE, startTimeBE, durationMin, status}` (`eventSlotBridge.ts:13-24`).
- **Impact:** a feed re-import changing an event's kickoff on an event with linked slots → event row updates, linked `BroadcastSlot.plannedStartUtc/EndUtc` **untouched → silently stale**; no cascade recompute. **All** import time-writes go through the one `updateImportedEvent` (+2 create sites); **none** invoke the bridge.

## Supporting characterizations
- **`eventSlotBridge`**: `syncEventToSlot` = one upsert on `(tenantId,eventId) WHERE autoLinked=true` (`:116-151`); sets `channelId`, `plannedStartUtc/EndUtc`, `status`; hardcodes `schedulingMode='FIXED'`, `anchorType='FIXED_TIME'`, `overrunStrategy='EXTEND'`. Touches **planned** fields only (never cascade's `estimated*`). No `scheduleOperations` usage. Callers: `routes/events.ts` only (+ a backfill script).
- **Greenfield confirmed**: no `Ripple`/reviewable schedule-change-set in `backend/src`. Precedent = import `MergeCandidate` (`{kind:'review'}`; `routes/import/mergeCandidates.ts`).

## Characterization tests worth pinning (cheap, for SV-2 safety net)
1. Re-import with changed `startsAtUtc` on an event with an `autoLinked` slot → `plannedStartUtc` **unchanged** (pins the gap; becomes the RED for SV-2's fix).
2. `POST /channel-switches/:id/confirm` → **all** `BroadcastSlot` rows unchanged (pins that execution is a no-op; guards SV-4's build).

## Open questions for the ADR (stakeholder taste-test flagged by the backlog)
- Should feed changes to events with **no** linked slots generate proposals? (Proposed: no — nothing to ripple; just update the event as today.)
- Review-vs-auto for feeds is the semantic call ADR-019 makes (proposed: FEED = review). Confirm with the ops stakeholder.
