# Planner-Schedule-Cascade Pipeline Optimization

**Date**: 2026-03-09
**Status**: Approved

## What We're Building

A unified pipeline where Event (Planner) → BroadcastSlot (Schedule) → CascadeEstimate (Cascade) flows seamlessly, eliminating redundant data models, dual conflict checks, fragmented event propagation, and disconnected channel references.

## Why This Matters

The current system has 5 core tensions:
1. **Channel identity split** — Event.linearChannel (string) vs Channel table (FK on BroadcastSlot)
2. **Rights checking duplication** — Contract (booleans) vs RightsPolicy (run limits, windows, territory)
3. **Duration triple** — Event.duration (string), BroadcastSlot.expectedDurationMin (int), Cascade estimator (heuristics)
4. **Event propagation fragmentation** — Socket.IO emit + outbox + publishService all firing for same mutation
5. **No Event→BroadcastSlot bridge** — manual duplication of scheduling work

## Key Decisions

### 1. Data Authority: Event Drives Slot
- Event remains the planner's primary object
- Creating/updating an Event auto-syncs a linked BroadcastSlot
- Schedule view becomes a read+refine layer on top of planner data
- Least disruptive to existing planner workflows

### 2. Channel Model: Full Hierarchy
- **Upgrade Channel table** to support:
  - Multi-type (linear, on-demand, radio, fast, pop-up) via `types: String[]`
  - Parent/child hierarchy via `parentId` self-reference
  - Platform metadata per sub-channel (YouTube, Netflix, own streamer, etc.)
  - Location/timezone for automatic time calculations
- **Add `channelId` FK to Event** — replaces `linearChannel` string
- Keep `linearChannel` temporarily as legacy/display field, migrate data via name matching
- **Build full tree UI** — nested channel management in Admin, tree-aware dropdown across app
- Eventually: `radioChannel` → separate `radioChannelId` FK, `onDemandChannel` → `onDemandChannelId` FK

### 3. Rights Model: Merge Contract + RightsPolicy
- Combine Contract and RightsPolicy into a single enriched model
- New unified model has: date ranges, boolean rights per medium, run limits, time windows, territory, platform scoping, coverage type
- Migrate existing Contract data into the new model
- Single validation pipeline used by both Planner conflict checks and Schedule validation
- Remove conflictService.ts rights checking — delegate to unified pipeline

### 4. Event Propagation: Full Outbox Migration
- All event propagation goes through the transactional outbox
- Workers handle both UI Socket.IO emit and downstream processing
- Remove direct `emit()` calls from event routes
- Remove `publishService.dispatch()` — outbox handles webhook delivery
- Accept ~1s latency for planner UI updates (consistent with cascade/alert delivery)

### 5. Event→BroadcastSlot Auto-Bridge
- When Event is created with a channelId + time, auto-create a FIXED BroadcastSlot
- When Event time/channel is updated, sync the linked BroadcastSlot
- When Event is deleted, cascade-delete linked BroadcastSlots
- BroadcastSlot.expectedDurationMin derived from Event.duration (parsed) or cascade estimator

### 6. Cascade Engine Fixes
- Use BroadcastSlot.actualStartUtc for completed events (not Event.startDateBE)
- Batch cascade DB writes in a single $transaction
- Feed Event.duration into estimator as override when available
- Scope alert worker to affected courts, not entire tenant

### 7. Conflict Service Consolidation
- conflictService.ts channel overlap check → delegate to structural validation (uses Channel FK, not string)
- conflictService.ts rights check → delegate to unified rights model
- conflictService.ts keeps: missing_tech_plan check, resource_conflict check
- Schedule validation stubs (TBD_PARTICIPANT_BLOCK, HANDOFF_CHAIN_BROKEN, KNOCKOUT_SLOT_TOO_SHORT, TERRITORY_BLOCKED) → implement or remove

### 8. Outbox Infrastructure Improvements
- Add LISTEN/NOTIFY trigger on OutboxEvent for instant processing (keep polling as fallback)
- BroadcastSlot PUT route: add outbox write (currently missing)
- Add outbox routing for `slot.updated`, `slot.deleted`

## Open Questions

- Sub-channel platform config: what metadata per platform? (API key, endpoint, format?)
- Should the channel tree dropdown support multi-select (event on multiple channels)?
- Regulatory/business validation stubs: implement now or defer?

## Implementation Order

1. Channel model upgrade (schema + migration + Admin UI + dropdown)
2. Event→Channel FK migration (add FK, migrate data, update Planner)
3. Event→BroadcastSlot auto-bridge
4. Rights model merge (Contract + RightsPolicy → unified)
5. Conflict service consolidation
6. Full outbox migration
7. Cascade engine fixes
8. Outbox infrastructure improvements
9. Validation stub cleanup
10. Duration normalization
