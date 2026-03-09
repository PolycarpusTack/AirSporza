# Broadcast Scheduling Middleware — Pickup File

**Last session**: 2026-03-06 (evening)
**Status**: Research complete, ready to create unified design doc

## Context

We reviewed two comprehensive standalone design documents:

1. **`docs/sports/football_standalone_design.docx`** — Football Scheduling System
2. **`docs/sports/tennis_standalone_design.docx`** — Tennis Scheduling System

Plus three interactive HTML prototypes in `docs/sports/` (JPL matchday, multi-competition weekend, tennis Indian Wells).

## Key Conclusions

### Planza today vs what's needed

Planza is currently a **planning calendar** — events with fixed times, crew, resources, encoders. These docs describe a **broadcast scheduling middleware** with significantly deeper domain modelling.

### What both docs agree on (shared ~60% architecture)

| Concept | Current Planza | What's needed |
|---------|---------------|---------------|
| BroadcastSlot | None (channel is a text field on Event) | First-class entity: pre/post/buffer/overrun strategy |
| Rights tracking | Contract model (valid/expiring/none) | RightsPolicy + RunLedger (count broadcasts against limits) |
| Schedule versioning | Live edits, no drafts | Draft -> publish -> immutable ScheduleVersion |
| EPG integration | None | Progressive updates, tape delay, channel switch sync |
| Validation pipeline | None | Staged rules (ERROR/WARNING) before publish |
| Competition structure | Sport -> Competition -> Event (flat) | Sport -> Competition -> Season -> Stage -> Round -> Fixture |
| Audit | Basic audit log | Immutable, before/after state, mandatory reason codes |
| Integration pattern | Direct API calls | Transactional outbox, idempotent adapters |

### What differs by sport (scheduling modes)

| Mode | Sports | Key mechanism |
|------|--------|---------------|
| **Fixed** | Football, athletics finals | Hard kickoff UTC, predictable duration (105-140 min) |
| **Floating** | Tennis, cricket | Order-based on court/venue, CascadeEngine recomputes start times |
| **Window** | Cycling, F1, athletics heats | Known start, variable end, buffer management |

### Football-specific entities
- **CompetitionStage** (league, group, knockout)
- **Group** (standings, head-to-head tiebreakers)
- **Tie** (two-legged knockouts with aggregate scoring)
- **SimultaneousCoverageGroup** (multi-competition nights: CL+EL+UECL)
- **Replay** (domestic cup replays)
- **Fixture Engine** (round-robin generation, cup draw, TBD resolution)

### Tennis-specific entities
- **Tournament** (replaces Competition+Season — single edition)
- **Draw** (per tour: ATP/WTA, per format: singles/doubles)
- **Court** (primary scheduling unit)
- **OrderOfPlay** (daily schedule published each morning)
- **BracketPosition** (seeded draw algorithm, winner propagation)
- **CascadeEstimate** (per-match estimated start/end with confidence score)
- **ChannelSwitchAction** (pre-planned, reactive, emergency switches)
- **CascadeEngine** (background worker recomputing all start times on match completion)

## Proposed Next Steps

### 1. Create unified design doc
Merge the two standalone designs into a single Planza architecture:
- Shared foundation (BroadcastSlot, Rights, Schedule versioning, Validation, EPG)
- Sport-specific modules (Football structure, Tennis cascade, Cycling/F1 window)
- Migration path from current Planza data model

### 2. Suggested build order

**Phase 1 — Shared Foundation:**
- BroadcastSlot entity (pre/post/buffer/overrun)
- Channel overlap detection (extend existing conflict system)
- Schedule draft/publish workflow
- Competition structure deepening (Season, Stage, Round)
- Validation pipeline (pre-publish checks)

**Phase 2 — Football Module:**
- CompetitionStage + Group + standings
- Two-legged Tie model
- SimultaneousCoverageGroup
- Knockout bracket with TBD resolution
- Extra time / penalty overrun planning

**Phase 3 — Tennis/Floating Module:**
- Scheduling mode field (fixed/floating/window)
- CascadeEngine (background worker)
- Order of Play ingest
- Floating broadcast slot model
- Channel switch workflow

**Phase 4 — Integration Layer:**
- Transactional outbox pattern
- EPG adapter (progressive updates)
- Rights/RunLedger (run counting against contracts)
- Live score adapter

## Resume Prompt

> "Let's pick up the broadcast middleware design. I have the pickup file at `docs/plans/broadcast-middleware-pickup.md` and the two standalone design docs in `docs/sports/`. Start by creating the unified design doc that merges football + tennis into a single Planza architecture."
