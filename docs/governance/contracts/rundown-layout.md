# CONTRACT SNAPSHOT: rundown-layout

Version: 1 · Date: 2026-07-04 · Task: B-1-T1 (input contract for B-1-T2 Rundown screen, B-4 e2e)

**Changelog**
- **v1 amendment (2026-07-04, B-1-T1 review — BEFORE any consumer):** renames on
  the public surface: `MIN_BLOCK_MIN` → `BLOCK_WIDTH_FLOOR_MIN` (leading MIN
  meant "minimum" while the `_MIN` suffix family means "minutes"); block flags
  `clamped`/`offAxis` → `isClamped`/`isOffAxis` (codebase `is*` convention).
  Mutation-probe holes closed: left-edge floor-order row, plannedEndUtc-vs-
  expectedDurationMin head-to-head, floor-never-sets-isClamped, multi-slot
  WINDOW first-wins, negative-slot-duration row; property-sweep forced edges
  now exercise BOTH window sources.

## Public interface

```ts
// src/components/ops/rundownLayout.ts — PURE functions: no React, no fetching,
// no Date.now(). Sibling module to selectors.ts ON PURPOSE (recorded call):
// distinct contract, keeps ops-selectors v2 byte-stable.

export const AXIS_START_MIN = 300         // 05:00
export const AXIS_END_MIN = 1440          // 24:00
export const AXIS_SPAN_MIN = 1140         // README §2 formula divisor
export const BLOCK_WIDTH_FLOOR_MIN = 80   // README §2 width floor (minutes)

export interface RundownBlock {
  event: Event
  windowSource: 'slot' | 'event'  // pin 2: slot wins when both exist
  rawStartMin: number             // PRE-clamp window (tooltip data — real times)
  rawEndMin: number
  startMin: number                // rendered (clamped/floored) axis minutes
  endMin: number
  leftPct: number                 // 0..100 — (startMin−300)/1140 ×100
  widthPct: number                // 0..100 — (endMin−startMin)/1140 ×100
  isClamped: boolean              // ANY axis clamping (incl. off-axis) — tooltip flag (edge AC)
  isOffAxis: boolean              // raw window entirely outside the axis (sliver rendering)
}

export interface RundownLane {
  channel: Channel | null         // null = UNASSIGNED overflow lane
  blocks: RundownBlock[]          // paint order: startMin asc, then event.id asc
}

export function resolveChannel(event: Event, slots: BroadcastSlot[], channels: Channel[]): Channel | null
export function layoutRundown(events: Event[], slots: BroadcastSlot[], channels: Channel[], day: string): RundownLane[]
```

**Representation choice (recorded):** percentages as NUMBERS 0..100 (`leftPct`/
`widthPct` — the README formula ×100) PLUS rendered minutes (`startMin`/`endMin`)
and raw minutes (`rawStartMin`/`rawEndMin`). Everything JSON-serializable; CSS
string formatting is the screen's concern.

## Geometry (Story B-1 pin 1 — normative order: clamp → floor → re-clamp)

1. Raw window in minutes from the OWNING day's midnight (start-day-owns; may
   exceed 1440 for cross-midnight windows).
2. Fully off-axis (`rawEnd ≤ 300` or `rawStart ≥ 1440`) → **floored sliver**
   pinned at the nearer edge (`[300,380]` / `[1360,1440]`), `isOffAxis: true`,
   `isClamped: true` — NEVER dropped (mirrors the UNASSIGNED rule). The
   right-edge case is unreachable for same-day windows (HH ≤ 23) — kept
   defensive, deliberately untested (recorded debt note).
3. Else intersection with `[300,1440]` (both edges), then the **80-min width
   floor**, then the right edge **re-clamps** to 1440 — the floor YIELDS at the
   boundary (pinned twice: e1's `[1380,1530]` renders `[1380,1440]` width 60;
   left-edge straddle 04:30–05:10 clamps FIRST then floors → `[300,380]`, never
   `[300,350]`).
4. `isClamped` = the raw window exceeded either axis edge. The width floor
   alone does NOT set it (mutation-pinned on the 10-minute mid-axis block).
5. Property (test-enforced, 500-case seeded LCG sweep + forced edges duplicated
   across BOTH window sources): ∀ blocks `0 ≤ leftPct ∧ leftPct+widthPct ≤ 100`
   and no block is ever dropped.
6. Degenerate windows: negative slot durations clamp to 0 minutes; the width
   floor then keeps the bad data visible (pinned).

## Window source (pin 2 — TD-24)

- SLOT-FIRST: the **first** slot in input order with `eventId === event.id`
  (multi-slot first-wins pinned for BOTH channel resolution AND the window).
  A slot positions the block only when it has `plannedStartUtc`; duration
  precedence: `plannedEndUtc` diff > `expectedDurationMin` >
  `effectiveDurationMin(event)` (head-to-head pinned: both present → the
  `plannedEndUtc` diff wins).
- Divergent slot-vs-event windows: **slot wins**, INCLUDING the owning day
  (fixture pin: e2 renders at 15:00, not its event 14:00; a Monday event with a
  Tuesday slot renders on Tuesday).
- Event fallback: `getDateKey(startDateBE)` + `timeToMinutes(startTimeBE)` +
  `effectiveDurationMin(event)` — sanctioned accessors ONLY, never the
  @deprecated Event fields.
- Unpositionable events (no slot start AND no event date/time, or invalid Date)
  are skipped silently — mirrors `groupEventsByDay`.

**Dates (recorded judgment call):** slot UTC ISO strings are read TEXTUALLY —
owning day = the string's date part, minutes = its `HH:MM` — matching the
codebase-wide API-shaped-datetime convention (`getDateKey` splits on `'T'`).
Duration diffs use `Date.parse` on the two Z-suffixed strings (machine-TZ
independent). TRUE UTC→broadcast-timezone conversion is deliberately NOT done
(debt candidate — revisit when real slot data proves the seed convention wrong).

## resolveChannel (AS-3 closure — pinned)

1. slot-first: the event's first slot → `channelId` looked up in `channels[]`;
2. fallback: `event.channel` RELATION id looked up in `channels[]` — returns
   the FULL Channel record (relation objects are lite and carry no sortOrder);
3. else `null` → UNASSIGNED lane. Dangling ids (slot/relation pointing at a
   channel missing from the inventory) FALL THROUGH — a dangling id is a
   data-quality signal, not a lane.

## Lanes (pins 5 + 6)

- Lane inventory: channels with ≥1 block on the day, in SERVICE order
  (`Channel.sortOrder` asc, then id — fixture pins order-by-sortOrder with
  deliberately inverted ids); `UNASSIGNED` (`channel: null`) appended LAST,
  only when non-empty. Zero-event day → `[]`.
- NO sub-lane splitting in v1. Paint order per lane: `startMin` asc, then
  `event.id` asc — rendering blocks in array order puts later-starting blocks
  on top; every block must carry a title tooltip (screen obligation, B-1-T2)
  so occluded blocks stay discoverable.
- Unmapped-channel COLOR fallback (pin 7) is a SCREEN concern (B-1-T2):
  `Channel.color` stays data; UNASSIGNED renders the neutral
  `--text-shell-3`-based treatment.

## Fixture extension (pin 8 — ADDITIVE, opsFixtureWeek.ts)

`FIXTURE_CHANNELS` (Eén id 2/sortOrder 0 · Canvas id 1/sortOrder 1 · VRT MAX
id 3/sortOrder 2 with ZERO slots) + `FIXTURE_SLOTS` + builders `makeChannel`/
`makeSlot`. Cases: s-e2 divergence (Mon/Canvas) · s-e1 clamped cross-24:00
(Mon/Eén, floor-yields boundary) · s-e3+s-e4 same-lane overlap pair (Tue/Eén) ·
s-e9 fully-off-axis (Fri 02:00–04:00) · e7 UNRESOLVABLE by omission (Thu — no
slot, no relation → UNASSIGNED with e8). Slot datetimes are API-shaped UTC
strings. Everything pre-existing is byte-stable (A-3/A-4/A-5 pins verified —
suite 445 → 466 with zero modifications to old tests).

## Enforced by

`src/components/ops/rundownLayout.test.ts` (24 tests — resolveChannel matrix,
minute-precision positioning table incl. left-edge floor order and the
negative-duration row, duration precedence incl. head-to-head, multi-slot
window first-wins, lane inventory/service-order/paint-order pins,
day-ownership, zero-event day, seeded property sweep with dual-source forced
edges).

## Depends on

`src/utils/dateTime.ts` (`getDateKey`, `timeToMinutes`, `effectiveDurationMin`) ·
`src/data/types.ts` (`Event`, `BroadcastSlot`, `Channel`) · fixture week
(B-1 extension). TD-24 honored; no React/fetching/`Date.now()`.

## Domain terms used

Rundown (never "Planner" for this screen), Lane, Block, UNASSIGNED lane,
Screen (backlog §4 glossary).
