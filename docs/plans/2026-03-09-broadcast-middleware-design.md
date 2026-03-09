# Broadcast Scheduling Middleware — Unified Design

**Date**: 2026-03-09
**Status**: Approved
**Approach**: Extend Planza (Express + Prisma + React) with new modules

## Design Decisions

| Decision | Choice |
|----------|--------|
| Stack approach | Extend Planza — new modules in existing Express + Prisma |
| Scheduling modes | All three from day one (Fixed, Floating, Window) |
| Competition structure | Shared skeleton + JSONB extensions |
| Rights tracking | Full RightsPolicy + RunLedger — multi-broadcaster ready |
| Duration estimation | Pluggable model — simple heuristics first, swappable interface |
| Real-time | Socket.IO on existing Express stack |
| Multi-tenancy | Full tenant-aware with PostgreSQL RLS from day one |
| EPG integration | EPG-ready hooks — outbox events designed, adapter deferred |
| Integration pattern | Full transactional outbox with BullMQ workers |

## Reference Documents

- `docs/sports/football_standalone_design.docx` — Football scheduling system spec
- `docs/sports/tennis_standalone_design.docx` — Tennis scheduling system spec
- `docs/sports/jpl-matchday27.html` — JPL data model explorer
- `docs/sports/multi-competition-weekend.html` — Multi-competition timeline prototype
- `docs/sports/tennis-scheduling-indian-wells.html` — Tennis scheduling prototype

---

## Section 1: Core Data Model

### Existing entities (kept as-is)

Sport, Competition, Contract, Encoder, CrewMember, CrewTemplate, TechPlan, User.

### Existing entities (extended)

**Event** gains:
- `tenant_id` (FK → Tenant, RLS)
- `season_id` (FK → Season)
- `stage_id` (FK → Stage)
- `round_id` (FK → Round)
- `venue_id` (FK → Venue)
- `scheduling_mode` (enum: FIXED / FLOATING / WINDOW)
- `status` extended: CONFIRMED → LIVE → LIVE_ET → PENALTIES → COMPLETED / POSTPONED / CANCELLED
- `sport_metadata` (JSONB — sport-specific: tie info, bracket position, court assignment, etc.)
- `external_refs` (JSONB — provider IDs for data feeds)

### New entities

#### Tenant

```
Tenant
├── id (uuid PK)
├── name, slug (unique)
├── config (JSONB — org-level settings)
└── RLS enforced on all tenant-scoped tables
```

#### Venue

```
Venue
├── id, tenant_id
├── name, timezone (IANA), country, address, capacity
└── Referenced by Event for kickoff local-time derivation
```

#### Season

```
Season
├── id, tenant_id, competition_id (FK)
├── name (e.g. "2025-26", "Indian Wells 2026")
├── start_date, end_date
├── sport_metadata (JSONB — tournament config, draw info, surface, etc.)
└── Groups Events into a single edition of a Competition
```

#### Stage

```
Stage
├── id, tenant_id, season_id (FK)
├── name, stage_type (LEAGUE / GROUP / KNOCKOUT / QUALIFIER / TOURNAMENT_MAIN)
├── sort_order
├── advancement_rules (JSONB — how teams/players progress)
├── sport_metadata (JSONB — groups, standings_config, knockout_config, bracket_positions)
└── E.g. "League Phase", "Round of 16", "Group A"
```

#### Round

```
Round
├── id, tenant_id, stage_id (FK)
├── name, round_number
├── scheduled_date_range (start/end)
└── E.g. "Matchday 4", "Quarterfinals", "R32"
```

#### Team

```
Team
├── id, tenant_id
├── name, short_name, country, logo_url
├── external_refs (JSONB — provider IDs)
└── Evergreen — persists across seasons
```

#### Court

```
Court
├── id, tenant_id, venue_id (FK)
├── name, capacity, has_roof, is_show_court
├── broadcast_priority (int)
└── CascadeEngine chains matches per court
```

#### Channel

```
Channel
├── id, tenant_id
├── name, timezone, broadcast_day_start_local (default 06:00)
├── epg_config (JSONB), color (hex)
└── First-class entity — replaces text field on Event
```

#### BroadcastSlot

```
BroadcastSlot
├── id, tenant_id
├── channel_id (FK), event_id (FK, nullable)
├── scheduling_mode (FIXED / FLOATING / WINDOW)
├── planned_start_utc, planned_end_utc
├── estimated_start_utc, estimated_end_utc       (CascadeEngine sets these)
├── earliest_start_utc, latest_start_utc          (floating/window only)
├── actual_start_utc, actual_end_utc              (set by playout)
├── buffer_before_min (default 15), buffer_after_min (default 25)
├── expected_duration_min
├── overrun_strategy (EXTEND / CONDITIONAL_SWITCH / HARD_CUT / SPLIT_SCREEN)
├── conditional_trigger_utc, conditional_target_channel_id (FK)
├── anchor_type (FIXED_TIME / COURT_POSITION / FOLLOWS_MATCH / HANDOFF / NOT_BEFORE)
├── coverage_priority (int), fallback_event_id (FK)
├── status (PLANNED / LIVE / OVERRUN / SWITCHED_OUT / COMPLETED / VOIDED)
├── schedule_version_id (FK, set on publish)
├── sport_metadata (JSONB — simultaneous_group_id, handoff links, content_segment)
└── content_segment (FULL / CONTINUATION — continuation doesn't count as new rights run)
```

#### ScheduleDraft

```
ScheduleDraft
├── id, tenant_id
├── channel_id (FK), date_range_start, date_range_end
├── operations (JSONB[] — append-only: INSERT/MOVE/DELETE/RESIZE)
├── version (int — optimistic locking)
├── status (EDITING / VALIDATING / PUBLISHED)
└── One draft per channel per date range
```

#### ScheduleVersion

```
ScheduleVersion
├── id, tenant_id
├── channel_id (FK), draft_id (FK), version_number
├── snapshot (JSONB — immutable copy of all slots)
├── published_at, published_by
├── is_emergency (boolean), reason_code (text)
├── acknowledged_warnings (JSONB[])
└── Immutable once created — new version supersedes
```

#### RightsPolicy

```
RightsPolicy
├── id, tenant_id
├── competition_id (FK), season_id (FK, nullable)
├── stage_ids (uuid[]), territory (text[] — ISO 3166-1)
├── platforms (enum[]: LINEAR / OTT / SVOD / AVOD / PPV / STREAMING)
├── coverage_type (LIVE / HIGHLIGHTS / DELAYED / CLIP)
├── max_live_runs, max_pick_runs_per_round
├── window_start_utc, window_end_utc
├── tape_delay_hours_min
└── Links Contract to broadcast permissions
```

#### RunLedger (append-only)

```
RunLedger
├── id, tenant_id
├── broadcast_slot_id (FK), event_id (FK), channel_id (FK)
├── run_type (LIVE / CONTINUATION / TAPE_DELAY / HIGHLIGHTS / CLIP)
├── parent_run_id (FK — links continuation to primary)
├── started_at_utc, ended_at_utc, duration_min
├── status (PENDING / CONFIRMED / RECONCILED / DISPUTED)
└── Counts broadcasts against RightsPolicy limits
```

#### ChannelSwitchAction

```
ChannelSwitchAction
├── id, tenant_id
├── from_slot_id (FK), to_channel_id (FK), to_slot_id (FK)
├── trigger_type (CONDITIONAL / REACTIVE / EMERGENCY / HARD_CUT / COURT_SWITCH)
├── switch_at_utc, reason_code, reason_text
├── confirmed_by, confirmed_at
├── execution_status (PENDING / EXECUTING / COMPLETED / FAILED)
├── auto_confirmed (boolean)
└── Full audit trail of every switch decision
```

#### CascadeEstimate

```
CascadeEstimate (upsert per event)
├── id, tenant_id, event_id (FK, unique per tenant)
├── estimated_start_utc, earliest_start_utc, latest_start_utc
├── est_duration_short_min, est_duration_long_min
├── confidence_score (0.0–1.0)
├── inputs_used (JSONB), computed_at
└── CascadeEngine writes, BroadcastSlot reads
```

#### OutboxEvent

```
OutboxEvent
├── id, tenant_id
├── event_type (text), aggregate_type (text), aggregate_id (uuid)
├── payload (JSONB — self-contained event data)
├── idempotency_key (unique)
├── priority (LOW / NORMAL / HIGH / URGENT)
├── created_at, processed_at, failed_at
├── retry_count (default 0), max_retries (default 5)
├── dead_lettered_at
└── Written in same transaction as business mutation
```

#### AdapterConfig

```
AdapterConfig
├── id, tenant_id
├── adapter_type (LIVE_SCORE / OOP / LIVE_TIMING / AS_RUN / EPG / PLAYOUT / NOTIFICATION)
├── direction (INBOUND / OUTBOUND)
├── provider_name, config (JSONB — endpoints, auth, format, intervals)
├── is_active (boolean)
├── last_success_at, last_failure_at, consecutive_failures
└── Adding a new provider is a config change, not a code change
```

### Relationship overview

```
Tenant ──┬── Sport ── Competition ── Season ── Stage ── Round ── Event
         ├── Team                                                  │
         ├── Venue ── Court                                        │
         ├── Channel ── BroadcastSlot ─────────────────────────────┘
         ├── ScheduleDraft ── ScheduleVersion
         ├── RightsPolicy ── RunLedger
         ├── ChannelSwitchAction
         ├── CascadeEstimate
         ├── OutboxEvent
         └── AdapterConfig
```

---

## Section 2: Scheduling Modes & BroadcastSlot Behavior

### Mode comparison

| | FIXED | FLOATING | WINDOW |
|---|---|---|---|
| Sports | Football, athletics finals | Tennis, cricket | Cycling, F1, athletics heats |
| Start time | Known precisely (UTC kickoff) | Estimated, cascade-dependent | Known start, variable end |
| Duration | Predictable (90min + overrun) | Unpredictable (1h–5h) | Predictable start, variable end |
| Key challenge | Multi-match coordination, overrun | Cascade chain, channel switching | Buffer management, overrun into next slot |
| Time fields | `planned_start/end_utc` | `estimated_start/end_utc` + `earliest/latest` | `planned_start_utc` + `estimated_end_utc` + `latest_end_utc` |
| CascadeEngine | Not needed | Core dependency | Light — recomputes end time only |

### FIXED mode

```
planned_start_utc = kickoff - buffer_before_min
planned_end_utc   = kickoff + expected_duration_min + buffer_after_min

Timeline (football):
|--15min--|--------105min--------|--25min--|
  studio     match (90+stoppage)   analysis

Overrun (knockout with ET + penalties):
|--15min--|--------105min--------|--30min ET--|--20min PEN--|--25min--|
                                 ↑ overrun_strategy kicks in here
```

**Overrun strategies:**
- **EXTEND**: Slot grows, following slots shift. Works when nothing follows.
- **CONDITIONAL_SWITCH**: At `conditional_trigger_utc`, if match still live → switch to overflow channel.
- **HARD_CUT**: Slot ends at planned time regardless. Rare, contractually required only.

**SimultaneousCoverageGroup** (stored in `sport_metadata`):
- Groups BroadcastSlots sharing same kickoff window across channels
- E.g. CL Tuesday 21:00 CET: Match A on Sports 1, Match B on Sports 2
- EPG published atomically across all channels in the group
- Validation: `SIMULTANEOUS_OVERRUN_RISK` if multiple knockouts in same group

### FLOATING mode

```
Court 1 schedule:
Match 1: 11:00 (COURT_OPEN — guaranteed start)
Match 2: ~13:15 (FOLLOWS_MATCH — depends on Match 1 duration)
Match 3: ~15:30 (FOLLOWS_MATCH — depends on Match 2)
Match 4: NB 19:00 (NOT_BEFORE — evening session, hard floor)

BroadcastSlot for Match 2:
  anchor_type        = FOLLOWS_MATCH
  earliest_start_utc = Match1.start + duration_short + changeover
  estimated_start_utc = Match1.start + duration_mid + changeover
  latest_start_utc   = Match1.start + duration_long + changeover
  confidence_score   = 0.7 (drops as chain lengthens)
```

**Anchor types:**

| Anchor | Meaning | Time guarantee |
|--------|---------|----------------|
| COURT_OPEN | First match of day on court | Near-fixed |
| NOT_BEFORE | Hard floor (session start) | Cannot start earlier, may start later |
| FOLLOWS_MATCH | Pure cascade dependency | No guarantee |
| HANDOFF | Continuation on overflow channel | Starts at switch time |

**Fallback mechanism**: `fallback_event_id` on BroadcastSlot points to alternate match if primary results in walkover/retirement.

### WINDOW mode

```
Cycling stage:
  planned_start_utc  = 12:00 (peloton departs)
  estimated_end_utc  = 17:00 (stage profile + avg speed)
  latest_end_utc     = 18:30 (worst case)
  buffer_after_min   = 30 (podium, analysis)

F1 race:
  planned_start_utc  = 15:00 (lights out)
  estimated_end_utc  = 16:45 (laps x avg lap time)
  latest_end_utc     = 17:30 (red flags, safety cars)
```

CascadeEngine recomputes `estimated_end_utc` from live timing data. Overrun strategies same as FIXED.

### Mixed-mode channel schedule

A channel's daily schedule can mix modes:

```
Sports 1 — Saturday:
08:00-11:00  [FIXED]    Morning studio show
11:00-~17:30 [WINDOW]   Cycling stage (variable end)
~18:00       [FIXED]    Football pre-match
18:45-21:00  [FIXED]    Football match
21:00-~23:30 [FLOATING] Tennis QF
```

Fixed slots are immovable anchors. Window and floating slots flex around them. Validation ensures floating/window slots have conditional switches armed when they risk bleeding into the next fixed anchor.

### Validation rules by mode

| Rule | FIXED | FLOATING | WINDOW |
|------|-------|----------|--------|
| OVERLAP_FIXED_SLOTS | ERROR | n/a | ERROR |
| SLOT_OVERLAP_PROBABLE | n/a | WARNING | WARNING |
| KNOCKOUT_ET_STRATEGY_MISSING | ERROR | n/a | n/a |
| FLOATING_NO_TRIGGER | n/a | WARNING | n/a |
| WIDE_DURATION_RANGE | n/a | WARNING (>150min) | WARNING (>120min) |
| SIMULTANEOUS_OVERRUN_RISK | WARNING | n/a | n/a |

---

## Section 3: Competition Structure

### Shared backbone: Season → Stage → Round

```
Competition (existing)
  └── Season
        ├── name: "2025-26" or "Indian Wells 2026"
        └── Stage (1..N, ordered)
              ├── stage_type: LEAGUE | GROUP | KNOCKOUT | QUALIFIER | TOURNAMENT_MAIN
              ├── advancement_rules (JSONB)
              └── Round (1..N, ordered)
                    ├── round_number, name
                    └── Event (1..N)
```

Enables structured queries:
- "All Round of 16 events across competitions this week"
- "Group stage final matchday — validate simultaneous kickoffs"
- "All events in Stage 17 of Tour de France"

### Football metadata

**On Stage** (`sport_metadata`):
```json
{
  "groups": [
    { "name": "Group A", "team_ids": [1, 4, 7, 12] }
  ],
  "standings_config": {
    "points_win": 3, "points_draw": 1,
    "tiebreakers": ["h2h_points", "h2h_gd", "overall_gd", "goals_scored"]
  },
  "knockout_config": {
    "two_legged": true,
    "away_goals_rule": false,
    "extra_time": true,
    "penalties": true
  },
  "ties": [
    {
      "id": "uuid",
      "leg1_event_id": 100, "leg2_event_id": 101,
      "home_first_team_id": 4,
      "aggregate": null, "outcome": null
    }
  ],
  "standings": []
}
```

**On Event** (`sport_metadata`):
```json
{
  "home_team_id": 4, "away_team_id": 7,
  "venue_id": 23,
  "tie_id": "uuid", "tie_leg": 2,
  "aggregate_score": "3-2",
  "group_name": "Group A",
  "matchday_group_id": "uuid",
  "simultaneous_coverage_group_id": "uuid"
}
```

### Tennis metadata

**On Season** (`sport_metadata`):
```json
{
  "surface": "HARD", "category": "MASTERS_1000",
  "tours": ["ATP", "WTA"],
  "draws": [
    {
      "id": "uuid", "tour": "ATP", "format": "SINGLES",
      "draw_size": 96, "match_format": "BEST_OF_3",
      "seedings": [{ "position": 1, "player_id": 42 }]
    }
  ]
}
```

**On Stage** (`sport_metadata`):
```json
{
  "draw_id": "uuid",
  "bracket_positions": [
    { "position": 1, "player_id": 42, "seeded_as": 1, "source_event_id": null },
    { "position": 2, "player_id": null, "qualifier_slot": true }
  ]
}
```

**On Event** (`sport_metadata`):
```json
{
  "court_id": "uuid", "court_name": "Stadium 1",
  "order_on_court": 3, "not_before_utc": "2026-03-15T18:00:00Z",
  "draw_id": "uuid",
  "player1_id": 42, "player2_id": 17,
  "set_scores": [[6,3],[4,6],[7,5]],
  "match_format": "BEST_OF_3"
}
```

### Cycling / F1 / Window sports metadata

**On Event** (`sport_metadata`):
```json
{
  "stage_profile": "mountain", "distance_km": 187,
  "elevation_gain_m": 4200, "avg_speed_estimate_kmh": 38,
  "circuit_laps": null, "live_timing_feed_id": "ext-123"
}
```

No bracket/draw/group structures needed. The Round entity (Stage 17, Race 5) is sufficient.

### When to promote JSONB to a real table

If you need to query across it, enforce uniqueness, or join to it, make it a table.

| Concept | Why it's a table |
|---------|-----------------|
| Team | Referenced by multiple events, needs search/autocomplete, persists across seasons |
| Venue | Referenced by events + channels, carries timezone (critical for UTC derivation) |
| Court | CascadeEngine queries "matches on court X today" — needs indexing |

Everything else (groups, ties, bracket positions, draw seedings, set scores) stays JSONB until query patterns demand otherwise.

### Background workers for progression

**League/group standings worker:**
1. Event completes → outbox `fixture.completed`
2. Worker reads all events in Stage + group
3. Recomputes standings (points, GD, tiebreakers from `standings_config`)
4. Writes to `Stage.sport_metadata.standings[]`
5. If final matchday → evaluates advancement rules → creates/updates next-stage Events

**Bracket progression worker:**
1. Event completes → outbox `fixture.completed`
2. Finds next-round bracket position where `source_event_id` = this event
3. Sets winner's player/team ID
4. If both sides of next-round match resolved → updates Event participants
5. Two-legged ties: updates aggregate, only progresses after leg 2

Both workers are idempotent.

---

## Section 4: Schedule Versioning & Validation Pipeline

### Draft → Validate → Publish lifecycle

```
  EDITING ──→ VALIDATING ──→ PUBLISHED
     ↑            │
     └────────────┘
       (errors found)
```

**ScheduleDraft** stores an append-only operation log:

```json
[
  { "op": "INSERT_ITEM", "slot": { "event_id": 42, "channel_id": 1, "planned_start_utc": "..." }, "at": "...", "by": "user-1" },
  { "op": "MOVE_ITEM", "slot_id": "uuid", "new_start_utc": "...", "at": "...", "by": "user-1" },
  { "op": "RESIZE_ITEM", "slot_id": "uuid", "new_end_utc": "...", "at": "...", "by": "user-2" },
  { "op": "DELETE_ITEM", "slot_id": "uuid", "at": "...", "by": "user-1" }
]
```

**Optimistic concurrency**: `version` integer on draft. Every PATCH increments it. Concurrent edits get a conflict response with server state + conflicting ops. UI shows merge diff.

**Compaction**: Operation log periodically compacted into materialized snapshot.

### Publish flow

1. Planner clicks "Publish"
2. Draft status → VALIDATING
3. Validation pipeline runs all 5 stages
4. **All pass** → ScheduleVersion created (immutable), outbox events fired
5. **ERROR-level failure** → Draft status → EDITING, validation report returned

Warnings don't block publish — shown with "acknowledge and proceed". Acknowledged warnings recorded in ScheduleVersion.

**Post-publish immutability**: To change a published schedule, create a new draft (pre-populated from current version), edit, publish new version. All historical versions retained.

### Emergency re-publish

For live operations (channel switch, overrun extension):
- Skips full validation — only runs Stage 1 (structural)
- Marked `is_emergency: true` on ScheduleVersion
- Requires `reason_code` and `confirmed_by`
- Outbox events fire with `priority: HIGH`
- Full audit trail

### Validation pipeline — 5 stages

Each rule returns: severity (ERROR/WARNING/INFO), code, scope, message, remediation.

#### Stage 1 — Structural

| Code | Severity | Condition |
|------|----------|-----------|
| OVERLAP_FIXED_SLOTS | ERROR | Two fixed-time slots on same channel overlap |
| TBD_PARTICIPANT_BLOCK | ERROR | Unresolved participant within publish deadline |
| HANDOFF_CHAIN_BROKEN | ERROR | Handoff slot references non-existent target |
| DUPLICATE_BROADCAST | ERROR | Same event on two channels without CONTINUATION marking |
| MISSING_CHANNEL | ERROR | BroadcastSlot has no channel |
| FLOATING_NO_TRIGGER | WARNING | Floating slot overlaps next fixed item, no conditional switch |
| NO_OVERFLOW_AVAILABLE | WARNING | Conditional switch armed but target channel has no interruptible slot |

#### Stage 2 — Duration

| Code | Severity | Condition |
|------|----------|-----------|
| SLOT_OVERLAP_CERTAIN | ERROR | Floating slot earliest_start overlaps next fixed item |
| KNOCKOUT_SLOT_TOO_SHORT | ERROR | Knockout slot < start + 140min |
| HARD_BLOCK_IN_ET_WINDOW | ERROR | Immovable item within 140min of knockout, no overrun strategy |
| SLOT_OVERLAP_PROBABLE | WARNING | Floating slot estimated_end overlaps next item (>50%) |
| WIDE_DURATION_RANGE | WARNING | Latest minus earliest > 150min |
| WINDOW_OVERRUN_RISK | WARNING | Window-mode latest_end exceeds next fixed slot start |
| SUSPENSION_ESTIMATES_INVALID | WARNING | Active suspension — downstream estimates unreliable |

#### Stage 3 — Rights

| Code | Severity | Condition |
|------|----------|-----------|
| RIGHTS_WINDOW_EXPIRED | ERROR | Broadcast outside rights time window |
| RIGHTS_RUN_EXCEEDED | ERROR | Would exceed max_live_runs |
| TERRITORY_BLOCKED | ERROR | Channel territory not covered by RightsPolicy |
| PICK_NOT_EXERCISED | WARNING | Pick option available, deadline approaching |
| TAPE_DELAY_RIGHTS_NEEDED | WARNING | Live event as tape delay — verify rights |

#### Stage 4 — Regulatory

| Code | Severity | Condition |
|------|----------|-----------|
| WATERSHED_VIOLATION | ERROR | Content conflicts with watershed rules |
| ACCESSIBILITY_MISSING | WARNING | Missing subtitle/accessibility provision |

#### Stage 5 — Business

| Code | Severity | Condition |
|------|----------|-----------|
| SIMULTANEOUS_OVERRUN_RISK | WARNING | Multiple knockouts in same SimultaneousCoverageGroup |
| PRIME_MATCH_LATE | WARNING | Marquee match estimated after 23:30 local |
| DST_KICKOFF_AMBIGUOUS | WARNING | Event within 2h of DST transition |
| NO_FALLBACK_ON_WALKOVER_RISK | INFO | Unresolved participant, no fallback_event_id |
| FINAL_MATCHDAY_SYNC | INFO | Group stage final round — verify identical kickoffs |

### Event status vs schedule status

Event `status` (draft → ready → approved → published → live → completed) = **event lifecycle**.
ScheduleDraft/Version = **broadcast schedule lifecycle**. Separate concerns — an event can be "approved" while its BroadcastSlot is still in a draft schedule.

---

## Section 5: CascadeEngine & Real-Time

### Overview

Background worker maintaining live start-time estimates for all floating and window-mode BroadcastSlots.

```
Triggers (outbox)               CascadeEngine              Outputs
──────────────────        ──────────────────────     ────────────────
match.status_changed  →   │ Per-court advisory  │ → CascadeEstimate upserts
match.score_updated   →   │ lock, then walk     │ → BroadcastSlot.estimated_* updated
oop.amendment         →   │ the chain           │ → Alert events → Socket.IO → planner
suspension.started    →   │                     │ → Outbox events → EPG adapter
suspension.resumed    →   │                     │
match.completed       →   │                     │
```

### Per-court cascade chain

```
1. Acquire advisory lock: (tenant_id, court_id, date)
2. Load all events on this court today, ordered by order_on_court
3. For each event in sequence:

   IF completed:
     Use actuals. confidence = 1.0.

   IF in_progress:
     start = actual_start_utc
     end = start + estimator.remainingDuration(live_score, format, ...)
     confidence = 0.8–0.95

   IF scheduled:
     prev_end = previous match estimated end
     changeover = 15min (configurable per venue)
     floor = event.not_before_utc (if NOT_BEFORE anchor)

     earliest_start = MAX(prev.earliest_end + changeover, floor)
     estimated_start = MAX(prev.estimated_end + changeover, floor)
     latest_start = MAX(prev.latest_end + changeover, floor)

     duration_short = estimator.shortDuration(event)
     duration_long = estimator.longDuration(event)

     earliest_end = earliest_start + duration_short
     estimated_end = estimated_start + (duration_short + duration_long) / 2
     latest_end = latest_start + duration_long

     confidence = prev.confidence * 0.85  (degrades down chain)

4. Upsert CascadeEstimate per event
5. Update linked BroadcastSlot.estimated_* fields
6. Evaluate alert conditions
7. Release advisory lock
```

### Duration Estimator interface

```typescript
interface DurationEstimator {
  shortDuration(event: Event): number   // minutes, optimistic
  longDuration(event: Event): number    // minutes, pessimistic
  remainingDuration(event: Event, liveScore: LiveScore): number
}
```

**V1 heuristics:**

| Sport/Format | Short | Long |
|--------------|-------|------|
| Tennis BO3 | 65 min | 210 min |
| Tennis BO5 | 105 min | 330 min |
| Cycling flat | distance_km / 45 kmh | distance_km / 36 kmh |
| Cycling mountain | distance_km / 40 kmh | distance_km / 32 kmh |
| F1 race | laps x 85s | laps x 105s |

Pluggable — swap in richer models (ranking, H2H, surface, weather) without changing CascadeEngine.

### WINDOW mode — end-time recomputation only

No chaining. Single event per slot. CascadeEngine recomputes `estimated_end_utc` from live timing data (avg speed, km remaining, laps remaining).

### Alert system

| Code | Severity | Condition | Action |
|------|----------|-----------|--------|
| OVERRUN_WARNING | INFO | Est. end 20–30min past slot end | Monitor |
| OVERRUN_ELEVATED | WARNING | Est. end 30–60min past, match live | Review conditional switch |
| TRIGGER_THRESHOLD_MET | ACTION | Match live at conditional_trigger_utc | Confirm/cancel switch within 10min |
| CASCADE_DELAY | WARNING | Match N pushes Match N+1 past not_before | Review downstream |
| SUSPENSION_ALL_COURTS | URGENT | Tournament-wide suspension | Prepare filler, update EPG |
| SUSPENSION_SINGLE | WARNING | One match suspended | Short filler, monitor |
| WALKOVER_SLOT_FREED | OPPORTUNITY | Walkover — court freed early | Evaluate court switch |
| RETIREMENT_EARLY_END | INFO | Match ended early | Extend buffer, prepare filler |
| SCORE_FEED_DEGRADED | WARNING | Live score delayed >60s | Manual verification |
| WINDOW_OVERRUN | WARNING | Window event approaching next fixed slot | Review buffer / switch |

### Socket.IO architecture

```
Express Server
  ├── REST API (existing)
  ├── Socket.IO server (new)
  │     ├── /cascade   → rooms: tenant:{id}:court:{id}
  │     ├── /alerts    → rooms: tenant:{id}
  │     ├── /schedule  → rooms: tenant:{id}:channel:{id}
  │     └── /switches  → rooms: tenant:{id}
  └── BullMQ workers
        ├── cascade-worker   (concurrency: 3, per-court lock)
        ├── outbox-worker    (concurrency: 5)
        ├── alert-worker     (concurrency: 2)
        ├── standings-worker (concurrency: 1)
        └── bracket-worker   (concurrency: 1)
```

### Channel switch confirmation flow

1. CascadeEngine fires `TRIGGER_THRESHOLD_MET`
2. Socket.IO `/switches` room receives:
   ```json
   {
     "type": "switch_confirmation_required",
     "switch_action_id": "uuid",
     "from_slot": { "channel": "Sports 1", "event": "Djokovic vs Alcaraz", "score": "6-4 4-6 5-5" },
     "to_channel": "Sports 2",
     "trigger_utc": "2026-03-15T21:15:00Z",
     "deadline_utc": "2026-03-15T21:25:00Z",
     "estimated_remaining_min": 25
   }
   ```
3. Planner confirms → `POST /channel-switch-actions/:id/confirm`
4. Dual-channel emergency ScheduleVersion publish (single transaction)
5. EPG + playout adapters process immediately (URGENT priority)
6. If no response within 10min and auto_confirm policy → system auto-confirms

### Match completion flow

```
1. Live score adapter → Event.status = COMPLETED, actual_end_utc set
2. OutboxEvent: fixture.completed
3. Outbox worker dispatches to:
   a. cascade-worker → recomputes chain for that court
   b. standings-worker → updates group/league standings
   c. bracket-worker → resolves next-round TBD
4. Cascade worker:
   a. Upserts CascadeEstimates for downstream matches
   b. Updates BroadcastSlot.estimated_* fields
   c. Evaluates alerts → new OutboxEvents if thresholds crossed
5. Alert worker → Socket.IO to tenant room
6. EPG adapter → progressive update if delta > 15min
```

---

## Section 6: Outbox, Adapters & Integration

### Outbox consumer

```
1. Poll: SELECT * FROM outbox_events
         WHERE processed_at IS NULL AND dead_lettered_at IS NULL
         ORDER BY priority DESC, created_at ASC
         LIMIT 50
         FOR UPDATE SKIP LOCKED

2. Route to BullMQ queue(s) based on event_type (fan-out)
3. Mark processed_at on successful dispatch

4. Queue workers process independently:
   - Success → job complete
   - Failure → retry (1s, 5s, 30s, 2min, 10min)
   - After max_retries → dead_lettered_at set, alert fired
```

### Event catalogue

| Event Type | Trigger | Consumers |
|------------|---------|-----------|
| fixture.created | Event created/imported | — |
| fixture.updated | Event fields changed | cascade-worker (if floating/window) |
| fixture.status_changed | Status transition | cascade-worker, standings-worker, bracket-worker |
| fixture.completed | Final result recorded | standings-worker, bracket-worker, run-ledger-worker |
| match.score_updated | Live score feed | cascade-worker |
| schedule.draft_updated | Draft ops appended | Socket.IO /schedule |
| schedule.published | ScheduleVersion created | epg-adapter, playout-adapter |
| schedule.emergency_published | Emergency re-publish | epg-adapter (HIGH), playout-adapter |
| broadcast_slot.created | Slot in published version | epg-adapter |
| broadcast_slot.overrun | Slot entered OVERRUN | epg-adapter, alert-worker |
| broadcast_slot.completed | Broadcast finished | run-ledger-worker |
| channel_switch.confirmed | Planner confirmed | epg-adapter (URGENT), playout-adapter, notification-adapter |
| channel_switch.executed | Switch on air | run-ledger-worker |
| cascade.recomputed | Estimates updated | epg-adapter (if delta > threshold), Socket.IO |
| suspension.started | Suspension began | cascade-worker, epg-adapter, alert-worker |
| suspension.resumed | Play resumes | cascade-worker, epg-adapter |
| oop.received | OOP ingested | cascade-worker |
| oop.amended | OOP changed | cascade-worker, alert-worker |
| rights.run_recorded | RunLedger entry | rights-enforcement |

### Inbound adapters

**Live Score Adapter:**
- Source: External provider webhook or poll (30s fallback)
- Endpoint: `POST /api/adapters/live-score/webhook`
- Maps external IDs → internal Event IDs via `external_refs`
- Updates Event status, scores, actual times
- Writes outbox: `match.score_updated` or `fixture.status_changed`
- Idempotent: same payload = same result

**OOP Adapter (tennis):**
- Source: Tournament API or file drop, poll every 60min + webhook for amendments
- Updates Event.sport_metadata: court_id, order_on_court, not_before_utc
- Writes outbox: `oop.received` or `oop.amended`
- Idempotency key: (tenant_id, tournament_id, date, court_id, order_on_court)

**Live Timing Adapter (cycling/F1):**
- Source: Timing provider feed
- Updates Event.sport_metadata with live timing fields
- Writes outbox: `fixture.updated`
- CascadeEngine recomputes estimated_end_utc for WINDOW slots

**As-Run Ingest:**
- Source: Playout system callback or file drop
- Creates RunLedger entry (actual start/end, duration, channel)
- Writes outbox: `rights.run_recorded`
- Idempotency key: (tenant_id, broadcast_slot_id, run_type)

### Outbound adapters

**EPG Adapter:**
- Triggers: schedule.published, broadcast_slot.overrun, channel_switch.confirmed, cascade.recomputed (delta > 15min)
- Full push on publish, delta push on overrun/switch
- Batch push for SimultaneousCoverageGroup (atomic across channels)
- Format configured per tenant (XMLTV, DVB-SI, proprietary)

**Playout Adapter:**
- Triggers: schedule.published, channel_switch.confirmed
- Builds rundown from ScheduleVersion
- For switches: cues notification graphic at T-2min, switch at T
- Receives confirmation callbacks → updates BroadcastSlot.actual_start/end

**Notification Adapter:**
- Trigger: channel_switch.executed
- Pushes to configured channels: HbbTV overlay, mobile push, streaming metadata
- Deduplicated by (event_id, switch_action_id)

### Adapter configuration

Adapters configured per tenant via AdapterConfig table. Adding a new EPG provider or switching live score vendors is a config change, not a code change.

### Observability

| Metric | Tracks |
|--------|--------|
| outbox_queue_depth | Unprocessed events by type and priority |
| outbox_processing_latency_ms | created_at to processed_at |
| outbox_retry_count | Events requiring retries, by adapter |
| outbox_dead_letters | Exhausted retries — needs attention |
| adapter_success_rate | Per adapter, per tenant |
| adapter_latency_ms | Per adapter round-trip |
| cascade_recompute_ms | CascadeEngine per court |

Dead-lettered events trigger alerts. Dashboard shows outbox health per tenant.

---

## Time Model

All times stored as UTC instants (`timestamptz`). Local wall-clock times are presentation only.

- Venue timezone (IANA) stored on every entity requiring local display
- Channel has `broadcast_day_start_local` (default 06:00) defining day boundaries
- DST: reject schedule items in spring-forward gaps; require disambiguation for fall-back overlaps
- Store: start_utc, end_utc, timezone, optional local_intent + dst_disambiguation flag

---

## Migration Path from Current Planza

1. Add `tenant_id` to all existing tables (single default tenant initially)
2. Enable RLS with default tenant policy
3. Add Season, Stage, Round — backfill from existing Competition + Event data
4. Add Channel as real table — migrate from text fields on Event
5. Add BroadcastSlot, ScheduleDraft, ScheduleVersion — new workflow alongside existing
6. Add RightsPolicy, RunLedger — extend existing Contract model
7. Add CascadeEstimate, OutboxEvent, ChannelSwitchAction, AdapterConfig
8. Add Team, Venue, Court as needed per sport

Existing Planza planning workflow continues working throughout. New broadcast middleware features layer on top progressively.
