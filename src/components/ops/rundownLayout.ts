/**
 * Rundown lane/position selectors (B-1-T1) — PURE functions: no React, no
 * fetching, no Date.now(). Contract: docs/governance/contracts/rundown-layout.md
 * (rundown-layout v1). Consumed by the Rundown screen (B-1-T2) and its e2e (B-4).
 *
 * Implements Story B-1 pinned decisions (backlog re-gate 2026-07-04):
 *   pin 1 — axis [300,1440] minutes (05:00–24:00); block = intersection of the
 *           window with the axis (both edges); 80-min width floor AFTER
 *           intersection; right edge then RE-clamps to 1440 (floor yields at
 *           the boundary); fully-off-axis windows render as a FLOORED SLIVER
 *           pinned at the nearer axis edge, flagged — never dropped.
 *   pin 2 — window source is SLOT-FIRST (the broadcast reality the Rundown
 *           depicts): the first BroadcastSlot with eventId === event.id; its
 *           day/start come from plannedStartUtc, duration precedence
 *           plannedEndUtc > expectedDurationMin > effectiveDurationMin(event).
 *           Fallback = event window via SANCTIONED accessors only (TD-24:
 *           getDateKey/timeToMinutes/effectiveDurationMin — never the
 *           @deprecated Event fields).
 *   pin 5 — NO sub-lanes in v1; deterministic paint order: startMin asc, then
 *           event id asc (later-starting blocks render later → on top).
 *   pin 6 — lanes = channels with ≥1 block on the day, in SERVICE order
 *           (Channel.sortOrder, then id); UNASSIGNED (channel: null) appended
 *           only when non-empty.
 *
 * Datetime convention (recorded judgment call, see contract §dates): slot UTC
 * ISO strings are read TEXTUALLY — day = the string's date part, minutes = its
 * HH:MM — matching the codebase-wide API-shaped-datetime treatment
 * (getDateKey splits on 'T'). Duration diffs use Date.parse on the two
 * Z-suffixed strings (machine-TZ independent).
 */
import type { BroadcastSlot, Channel, Event } from '../../data/types'
import { effectiveDurationMin, getDateKey, timeToMinutes } from '../../utils/dateTime'

/** Axis start: 05:00 (minutes from midnight). */
export const AXIS_START_MIN = 300
/** Axis end: 24:00. */
export const AXIS_END_MIN = 1440
/** Axis span — the divisor of the README §2 position formula. */
export const AXIS_SPAN_MIN = AXIS_END_MIN - AXIS_START_MIN // 1140
/** Minimum rendered block width in minutes (README §2: `max(duration, 80min)`). */
export const BLOCK_WIDTH_FLOOR_MIN = 80

export interface RundownBlock {
  event: Event
  /** which window positioned this block (pin 2: slot wins when both exist) */
  windowSource: 'slot' | 'event'
  /** raw (pre-clamp) window minutes from the owning day's midnight — tooltip data */
  rawStartMin: number
  rawEndMin: number
  /** rendered (clamped/floored) axis minutes */
  startMin: number
  endMin: number
  /** percentages 0..100 of the axis span — README formula ×100 */
  leftPct: number
  widthPct: number
  /** any axis clamping occurred (incl. off-axis) — tooltip flag per the edge AC.
   *  The width floor alone NEVER sets this (mutation-pinned). */
  isClamped: boolean
  /** raw window lies entirely outside the axis — rendered as the pinned sliver */
  isOffAxis: boolean
}

export interface RundownLane {
  /** null = the UNASSIGNED overflow lane (unresolvable channel — data-quality signal) */
  channel: Channel | null
  /** paint order: startMin asc, then event id asc */
  blocks: RundownBlock[]
}

/** FIRST slot for the event in input order (deterministic first-wins — pinned in tests). */
function firstSlotFor(event: Event, slots: BroadcastSlot[]): BroadcastSlot | null {
  return slots.find((slot) => slot.eventId === event.id) ?? null
}

/**
 * Slot-first channel resolution (AS-3 closure):
 *   1. slot with eventId === event.id → its channelId looked up in the inventory;
 *   2. fallback: the event.channel RELATION's id looked up in the inventory
 *      (TD-24-sanctioned path — returns the FULL Channel record, never the lite
 *      relation object);
 *   3. else null → the UNASSIGNED lane.
 * A slot or relation pointing at a channel MISSING from the inventory falls
 * through (a dangling id is a data-quality signal, not a lane).
 */
export function resolveChannel(event: Event, slots: BroadcastSlot[], channels: Channel[]): Channel | null {
  const slot = firstSlotFor(event, slots)
  if (slot) {
    const channel = channels.find((c) => c.id === slot.channelId)
    if (channel) return channel
  }
  const relationId = event.channel?.id
  if (relationId != null) {
    const channel = channels.find((c) => c.id === relationId)
    if (channel) return channel
  }
  return null
}

interface DayWindow {
  day: string // YYYY-MM-DD — the owning day (start-day-owns, pin 1)
  startMin: number
  endMin: number
  source: 'slot' | 'event'
}

/**
 * 'YYYY-MM-DDTHH:MM…' → textual day + minutes (see header §dates). "WallClock"
 * on purpose: this is a deliberate TEXTUAL read, never a timezone-correct
 * absolute-instant conversion.
 */
function parseSlotWallClock(iso: string): { day: string; minutes: number } | null {
  const [day, time] = iso.split('T')
  if (!time) return null
  const hours = Number(time.slice(0, 2))
  const minutes = Number(time.slice(3, 5))
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return { day, minutes: hours * 60 + minutes }
}

function windowFor(event: Event, slot: BroadcastSlot | null): DayWindow | null {
  // Slot-first (pin 2): a slot positions the block only when it carries a
  // planned start; otherwise the event window applies (channel may still
  // resolve from the slot — the two concerns are independent).
  if (slot?.plannedStartUtc) {
    const start = parseSlotWallClock(slot.plannedStartUtc)
    if (start) {
      let duration: number | null = null
      if (slot.plannedEndUtc) {
        const startMs = Date.parse(slot.plannedStartUtc)
        const endMs = Date.parse(slot.plannedEndUtc)
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) duration = Math.max(0, (endMs - startMs) / 60_000)
      }
      if (duration === null && typeof slot.expectedDurationMin === 'number') {
        duration = Math.max(0, slot.expectedDurationMin)
      }
      if (duration === null) duration = effectiveDurationMin(event)
      return { day: start.day, startMin: start.minutes, endMin: start.minutes + duration, source: 'slot' }
    }
  }

  if (!event.startDateBE || !event.startTimeBE) return null // unpositionable — skipped silently (mirrors groupEventsByDay)
  if (event.startDateBE instanceof Date && Number.isNaN(event.startDateBE.getTime())) return null
  const day = getDateKey(event.startDateBE)
  if (!day) return null
  const startMin = timeToMinutes(event.startTimeBE)
  return { day, startMin, endMin: startMin + effectiveDurationMin(event), source: 'event' }
}

/**
 * Pin-1 geometry: clamp → floor → re-clamp.
 * Fully-off-axis windows become a BLOCK_WIDTH_FLOOR_MIN sliver pinned at the
 * nearer edge (left when the window ends before the axis; right when it starts
 * after — the latter is unreachable for same-day windows but kept defensive).
 */
function placeOnAxis(rawStartMin: number, rawEndMin: number): Pick<RundownBlock, 'startMin' | 'endMin' | 'isClamped' | 'isOffAxis'> {
  if (rawEndMin <= AXIS_START_MIN) {
    return { startMin: AXIS_START_MIN, endMin: AXIS_START_MIN + BLOCK_WIDTH_FLOOR_MIN, isClamped: true, isOffAxis: true }
  }
  if (rawStartMin >= AXIS_END_MIN) {
    return { startMin: AXIS_END_MIN - BLOCK_WIDTH_FLOOR_MIN, endMin: AXIS_END_MIN, isClamped: true, isOffAxis: true }
  }
  const startMin = Math.max(rawStartMin, AXIS_START_MIN) // intersection, left edge
  let endMin = Math.min(rawEndMin, AXIS_END_MIN) // intersection, right edge
  endMin = Math.max(endMin, startMin + BLOCK_WIDTH_FLOOR_MIN) // width floor AFTER intersection
  endMin = Math.min(endMin, AXIS_END_MIN) // re-clamp — floor yields at the boundary
  return {
    startMin,
    endMin,
    isClamped: rawStartMin < AXIS_START_MIN || rawEndMin > AXIS_END_MIN,
    isOffAxis: false,
  }
}

/**
 * Lays out one Rundown day (pins 1/2/5/6). `day` = 'YYYY-MM-DD'. Events whose
 * owning day (slot-first) differs are excluded; date/time-less events are
 * skipped silently. Returns [] for a zero-event day (screen renders its
 * empty state).
 */
export function layoutRundown(
  events: Event[],
  slots: BroadcastSlot[],
  channels: Channel[],
  day: string,
): RundownLane[] {
  const byChannelId = new Map<number | null, RundownBlock[]>()

  for (const event of events) {
    const slot = firstSlotFor(event, slots)
    const dayWindow = windowFor(event, slot) // named to avoid shadowing the DOM global
    if (!dayWindow || dayWindow.day !== day) continue

    const placed = placeOnAxis(dayWindow.startMin, dayWindow.endMin)
    const channel = resolveChannel(event, slots, channels)
    const block: RundownBlock = {
      event,
      windowSource: dayWindow.source,
      rawStartMin: dayWindow.startMin,
      rawEndMin: dayWindow.endMin,
      ...placed,
      leftPct: ((placed.startMin - AXIS_START_MIN) / AXIS_SPAN_MIN) * 100,
      widthPct: ((placed.endMin - placed.startMin) / AXIS_SPAN_MIN) * 100,
    }

    const key = channel ? channel.id : null
    const bucket = byChannelId.get(key)
    if (bucket) bucket.push(block)
    else byChannelId.set(key, [block])
  }

  // Pin 5: deterministic paint order within a lane.
  for (const blocks of byChannelId.values()) {
    blocks.sort((a, b) => a.startMin - b.startMin || a.event.id - b.event.id)
  }

  // Pin 6: channels with ≥1 block, in service order; UNASSIGNED appended last.
  const lanes: RundownLane[] = channels
    .filter((channel) => byChannelId.has(channel.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((channel) => ({ channel, blocks: byChannelId.get(channel.id)! }))

  const unassigned = byChannelId.get(null)
  if (unassigned && unassigned.length > 0) lanes.push({ channel: null, blocks: unassigned })

  return lanes
}
