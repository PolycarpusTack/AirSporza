/**
 * Rundown lane/position selector tests (B-1-T1).
 * Contract: docs/governance/contracts/rundown-layout.md (rundown-layout v1).
 * Written to Story B-1's pinned decisions 1/2/5/6 (backlog re-gate 2026-07-04):
 *   pin 1 — axis [300,1440]; intersection-clamp both edges; 80-min floor AFTER
 *           intersection; right edge re-clamps (floor yields at the boundary);
 *           fully-off-axis → floored sliver at the nearer edge, flagged;
 *           property: ∀ blocks 0 ≤ left ∧ left+width ≤ 100%.
 *   pin 2 — window slot-first (divergence: slot wins); event fallback via
 *           sanctioned accessors only (TD-24).
 *   pin 5 — no sub-lanes; deterministic order: startMin asc, then event id.
 *   pin 6 — lanes = channels with ≥1 block that day in SERVICE order
 *           (sortOrder, not id); UNASSIGNED appended only when non-empty.
 *
 * Fixed data: the deep-frozen fixture week + its B-1 additive slot/channel
 * extension. No React, no fetching, no Date.now().
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { BroadcastSlot, Event } from '../../data/types'
import {
  FIXTURE_CHANNELS,
  FIXTURE_EVENTS,
  FIXTURE_SLOTS,
  makeEvent,
  makeSlot,
} from './__fixtures__/opsFixtureWeek'
import { layoutRundown, resolveChannel, type RundownLane } from './rundownLayout'

const getFixtureEvent = (id: number): Event => FIXTURE_EVENTS.find((e) => e.id === id)!

const laneNames = (lanes: RundownLane[]) => lanes.map((lane) => lane.channel?.name ?? 'UNASSIGNED')
const laneByName = (lanes: RundownLane[], name: string | null) =>
  lanes.find((lane) => (name === null ? lane.channel === null : lane.channel?.name === name))!

const layoutDay = (day: string) => layoutRundown(FIXTURE_EVENTS, FIXTURE_SLOTS, FIXTURE_CHANNELS, day)

describe('resolveChannel — slot-first, relation fallback, null → UNASSIGNED (AS-3 closure)', () => {
  it('slot-first: e2 resolves to Canvas via its slot (no event.channel relation needed)', () => {
    const channel = resolveChannel(getFixtureEvent(2), FIXTURE_SLOTS, FIXTURE_CHANNELS)

    expect(channel?.name).toBe('Canvas')
    expect(channel?.id).toBe(1)
  })

  it('fallback: slot-less event with an event.channel relation resolves the FULL Channel record from the inventory', () => {
    const event = makeEvent({ id: 900, channel: { id: 2, name: 'Eén (lite)', color: '#E4572E', types: [] } })

    const channel = resolveChannel(event, FIXTURE_SLOTS, FIXTURE_CHANNELS)

    expect(channel?.name).toBe('Eén') // the inventory record, not the lite relation
    expect(channel?.sortOrder).toBe(0) // proves it is the full Channel (relation has no sortOrder)
  })

  it('relation id not present in the channel inventory → null (data-quality signal)', () => {
    const event = makeEvent({ id: 901, channel: { id: 999, name: 'Ghost', color: '#000000', types: [] } })

    expect(resolveChannel(event, FIXTURE_SLOTS, FIXTURE_CHANNELS)).toBeNull()
  })

  it('no slot and no relation → null (e8, unresolvable by omission)', () => {
    expect(resolveChannel(getFixtureEvent(8), FIXTURE_SLOTS, FIXTURE_CHANNELS)).toBeNull()
  })

  it('DANGLING fixture slot channelId (e7 → id 99, not in the inventory) → null (data-quality signal)', () => {
    // s-e7-dangling added at the B-1-T2 review: e7 HAS a slot, but its channel
    // id resolves nowhere and e7 carries no relation → UNASSIGNED.
    expect(resolveChannel(getFixtureEvent(7), FIXTURE_SLOTS, FIXTURE_CHANNELS)).toBeNull()
  })

  it('slot with an unknown channelId falls back to the relation; without one → null', () => {
    const withRelation = makeEvent({ id: 902, channel: { id: 1, name: 'Canvas (lite)', color: '#4C8DF5', types: [] } })
    const withoutRelation = makeEvent({ id: 903 })
    const slots: BroadcastSlot[] = [
      makeSlot({ id: 's-ghost-a', eventId: 902, channelId: 999 }),
      makeSlot({ id: 's-ghost-b', eventId: 903, channelId: 999 }),
    ]

    expect(resolveChannel(withRelation, slots, FIXTURE_CHANNELS)?.name).toBe('Canvas')
    expect(resolveChannel(withoutRelation, slots, FIXTURE_CHANNELS)).toBeNull()
  })

  it('multiple slots for one event → the FIRST in input order wins (deterministic, pinned)', () => {
    const event = makeEvent({ id: 904 })
    const slots: BroadcastSlot[] = [
      makeSlot({ id: 's-first', eventId: 904, channelId: 1 }),
      makeSlot({ id: 's-second', eventId: 904, channelId: 2 }),
    ]

    expect(resolveChannel(event, slots, FIXTURE_CHANNELS)?.name).toBe('Canvas')
  })
})

describe('positioning table — minute precision (pins 1 + 2)', () => {
  it('DIVERGENCE (e2, Mon): slot window wins — 15:00, not the event\'s 14:00', () => {
    const canvas = laneByName(layoutDay('2026-03-02'), 'Canvas')
    const block = canvas.blocks[0]

    expect(block.event.id).toBe(2)
    expect(block.windowSource).toBe('slot')
    expect(block.startMin).toBe(900) // 15:00 — the slot, never 840
    expect(block.endMin).toBe(1020)
    expect(block.leftPct).toBeCloseTo(52.631578947368425, 6) // (900−300)/1140
    expect(block.widthPct).toBeCloseTo(10.526315789473685, 6) // 120/1140
    expect(block.isClamped).toBe(false)
    expect(block.isOffAxis).toBe(false)
  })

  it('CLAMPED cross-24:00 (e1, Mon): [1380,1530] → [1380,1440]; the 80-min floor YIELDS at the boundary (width 60)', () => {
    const een = laneByName(layoutDay('2026-03-02'), 'Eén')
    const block = een.blocks[0]

    expect(block.event.id).toBe(1)
    expect(block.rawStartMin).toBe(1380)
    expect(block.rawEndMin).toBe(1530) // 23:00 + 150 min crosses midnight
    expect(block.startMin).toBe(1380)
    expect(block.endMin).toBe(1440) // clamped; floor would give 1460 but re-clamp wins
    expect(block.widthPct).toBeCloseTo(5.263157894736842, 6) // 60/1140 — NOT floored to 80
    expect(block.isClamped).toBe(true)
    expect(block.isOffAxis).toBe(false)
    expect(block.leftPct + block.widthPct).toBeCloseTo(100, 6)
  })

  it('EVENT-WINDOW fallback (Wed): slot-less, relation-less e5/e6 land in UNASSIGNED with event-derived windows', () => {
    const unassigned = laneByName(layoutDay('2026-03-04'), null)

    expect(unassigned.blocks.map((b) => b.event.id)).toEqual([5, 6])
    const e5 = unassigned.blocks[0]
    expect(e5.windowSource).toBe('event')
    expect(e5.startMin).toBe(720) // 12:00 via startTimeBE
    expect(e5.endMin).toBe(840) // effectiveDurationMin (durationMin 120 — TD-24 accessor)
    expect(e5.leftPct).toBeCloseTo(36.84210526315789, 6)
  })

  it('FULLY OFF-AXIS (e9, Fri): 02:00–04:00 ends before 05:00 → floored sliver at the LEFT edge, flagged', () => {
    const een = laneByName(layoutDay('2026-03-06'), 'Eén')
    const block = een.blocks[0]

    expect(block.event.id).toBe(9)
    expect(block.rawStartMin).toBe(120)
    expect(block.rawEndMin).toBe(240)
    expect(block.startMin).toBe(300) // pinned at the axis start
    expect(block.endMin).toBe(380) // 80-min floored sliver
    expect(block.leftPct).toBe(0)
    expect(block.widthPct).toBeCloseTo(7.017543859649122, 6)
    expect(block.isOffAxis).toBe(true)
    expect(block.isClamped).toBe(true)
  })

  it('80-min floor applies mid-axis: a 10-minute slot renders 80 minutes wide — and the floor alone never sets isClamped', () => {
    const event = makeEvent({ id: 905, startDateBE: '2026-03-02', startTimeBE: '10:00' })
    const slots = [
      makeSlot({
        id: 's-short',
        eventId: 905,
        channelId: 1,
        plannedStartUtc: '2026-03-02T10:00:00.000Z',
        plannedEndUtc: '2026-03-02T10:10:00.000Z',
      }),
    ]

    const [lane] = layoutRundown([event], slots, FIXTURE_CHANNELS, '2026-03-02')
    expect(lane.blocks[0].startMin).toBe(600)
    expect(lane.blocks[0].endMin).toBe(680) // floored AFTER intersection
    expect(lane.blocks[0].rawEndMin).toBe(610) // raw window preserved for tooltips
    // Mutation pin: isClamped is AXIS clamping only — a floored short block is
    // NOT clamped (a clamped-on-floor mutant would tooltip-flag every short block).
    expect(lane.blocks[0].isClamped).toBe(false)
    expect(lane.blocks[0].isOffAxis).toBe(false)
  })

  it('LEFT-EDGE floor order: a sub-80 window straddling 05:00 clamps FIRST, then floors from the clamped start (04:30–05:10 → [300,380])', () => {
    // Mutation pin: floor-before-intersection would keep [270,350] → clamp → [300,350].
    const event = makeEvent({ id: 909 })
    const slots = [
      makeSlot({
        id: 's-straddle',
        eventId: 909,
        channelId: 1,
        plannedStartUtc: '2026-03-02T04:30:00.000Z',
        plannedEndUtc: '2026-03-02T05:10:00.000Z',
      }),
    ]

    const [lane] = layoutRundown([event], slots, FIXTURE_CHANNELS, '2026-03-02')
    const block = lane.blocks[0]
    expect(block.startMin).toBe(300)
    expect(block.endMin).toBe(380)
    expect(block.leftPct).toBe(0)
    expect(block.widthPct).toBeCloseTo(7.017543859649122, 6)
    expect(block.isClamped).toBe(true) // the raw start (270) was axis-clamped
    expect(block.isOffAxis).toBe(false) // the window touches the axis — not the sliver path
  })

  it('negative slot duration (plannedEndUtc before plannedStartUtc) clamps to 0 and the floor makes it visible', () => {
    const event = makeEvent({ id: 912 })
    const slots = [
      makeSlot({
        id: 's-negative',
        eventId: 912,
        channelId: 1,
        plannedStartUtc: '2026-03-02T10:00:00.000Z',
        plannedEndUtc: '2026-03-02T09:00:00.000Z',
      }),
    ]

    const [lane] = layoutRundown([event], slots, FIXTURE_CHANNELS, '2026-03-02')
    expect(lane.blocks[0].rawEndMin).toBe(600) // duration clamped to 0, never negative
    expect(lane.blocks[0].startMin).toBe(600)
    expect(lane.blocks[0].endMin).toBe(680) // 80-min floor keeps bad data visible
  })

  it('multi-slot WINDOW first-wins: with two divergent slots the block positions at the FIRST slot\'s start', () => {
    const event = makeEvent({ id: 913 })
    const slots = [
      makeSlot({
        id: 's-window-first',
        eventId: 913,
        channelId: 1,
        plannedStartUtc: '2026-03-02T10:00:00.000Z',
        plannedEndUtc: '2026-03-02T12:00:00.000Z',
      }),
      makeSlot({
        id: 's-window-second',
        eventId: 913,
        channelId: 2,
        plannedStartUtc: '2026-03-02T14:00:00.000Z',
        plannedEndUtc: '2026-03-02T16:00:00.000Z',
      }),
    ]

    const lanes = layoutRundown([event], slots, FIXTURE_CHANNELS, '2026-03-02')
    const block = lanes.flatMap((lane) => lane.blocks)[0]
    expect(block.startMin).toBe(600) // 10:00 — the FIRST slot, never 840
    expect(block.endMin).toBe(720)
  })

  it('floor does NOT inflate blocks already ≥80 min (e3: 120 min stays 120)', () => {
    const een = laneByName(layoutDay('2026-03-03'), 'Eén')
    const e3 = een.blocks.find((b) => b.event.id === 3)!

    expect(e3.endMin - e3.startMin).toBe(120)
  })

  it('slot duration precedence: plannedEndUtc > expectedDurationMin > effectiveDurationMin(event)', () => {
    const event = makeEvent({ id: 906, startDateBE: '2026-03-02', startTimeBE: '10:00', durationMin: 90 })
    const startOnly = makeSlot({
      id: 's-start-only',
      eventId: 906,
      channelId: 1,
      plannedStartUtc: '2026-03-02T10:00:00.000Z',
    })

    // no plannedEndUtc, no expectedDurationMin → event duration (90)
    let [lane] = layoutRundown([event], [startOnly], FIXTURE_CHANNELS, '2026-03-02')
    expect(lane.blocks[0].endMin - lane.blocks[0].startMin).toBe(90)

    // expectedDurationMin present → it wins over the event duration
    const withExpected = makeSlot({ ...startOnly, id: 's-expected', expectedDurationMin: 200 })
    ;[lane] = layoutRundown([event], [withExpected], FIXTURE_CHANNELS, '2026-03-02')
    expect(lane.blocks[0].endMin - lane.blocks[0].startMin).toBe(200)

    // HEAD-TO-HEAD (mutation pin): BOTH present → plannedEndUtc wins (120, never 200)
    const withBoth = makeSlot({
      ...startOnly,
      id: 's-both',
      plannedEndUtc: '2026-03-02T12:00:00.000Z',
      expectedDurationMin: 200,
    })
    ;[lane] = layoutRundown([event], [withBoth], FIXTURE_CHANNELS, '2026-03-02')
    expect(lane.blocks[0].endMin - lane.blocks[0].startMin).toBe(120)
  })
})

describe('lanes — inventory, service order, paint order (pins 5 + 6)', () => {
  it('Monday: lanes in SERVICE order [Eén, Canvas] (sortOrder 0,1 — despite ids 2,1); no UNASSIGNED', () => {
    expect(laneNames(layoutDay('2026-03-02'))).toEqual(['Eén', 'Canvas'])
  })

  it('Tuesday: one Eén lane with the overlap pair ordered startMin asc [e3 18:00, e4 18:30]; zero-event VRT MAX has no lane', () => {
    const lanes = layoutDay('2026-03-03')

    expect(laneNames(lanes)).toEqual(['Eén'])
    expect(laneByName(lanes, 'Eén').blocks.map((b) => b.event.id)).toEqual([3, 4])
  })

  it('Thursday: only the UNASSIGNED lane (e7 unresolvable + e8 slot-less), ordered by startMin', () => {
    const lanes = layoutDay('2026-03-05')

    expect(laneNames(lanes)).toEqual(['UNASSIGNED'])
    expect(laneByName(lanes, null).blocks.map((b) => b.event.id)).toEqual([7, 8])
  })

  it('UNASSIGNED is appended LAST when channel lanes exist', () => {
    const stray = makeEvent({ id: 907, startDateBE: '2026-03-02', startTimeBE: '09:00', durationMin: 60 })

    const lanes = layoutRundown([...FIXTURE_EVENTS, stray], FIXTURE_SLOTS, FIXTURE_CHANNELS, '2026-03-02')

    expect(laneNames(lanes)).toEqual(['Eén', 'Canvas', 'UNASSIGNED'])
    expect(laneByName(lanes, null).blocks.map((b) => b.event.id)).toEqual([907])
  })

  it('paint-order tie: identical startMin sorts by event id asc (pin 5 determinism)', () => {
    // The id inversion IS the test: the higher-id event comes FIRST in input order.
    const higherIdEvent = makeEvent({ id: 911, startDateBE: '2026-03-02', startTimeBE: '18:00', durationMin: 120 })
    const lowerIdEvent = makeEvent({ id: 910, startDateBE: '2026-03-02', startTimeBE: '18:00', durationMin: 120 })
    const slots = [
      makeSlot({ id: 's-tie-a', eventId: 911, channelId: 2 }),
      makeSlot({ id: 's-tie-b', eventId: 910, channelId: 2 }),
    ]

    const lanes = layoutRundown([higherIdEvent, lowerIdEvent], slots, FIXTURE_CHANNELS, '2026-03-02')

    expect(laneByName(lanes, 'Eén').blocks.map((blk) => blk.event.id)).toEqual([910, 911])
  })

  it('day ownership: events from other days are excluded; a divergent slot DAY also wins (slot-first)', () => {
    // Tuesday layout contains no Monday events…
    const tuesdayIds = layoutDay('2026-03-03').flatMap((lane) => lane.blocks.map((b) => b.event.id))
    expect(tuesdayIds).toEqual([3, 4])

    // …and an event DATED Monday whose slot is planned Tuesday appears on TUESDAY.
    const event = makeEvent({ id: 908, startDateBE: '2026-03-02', startTimeBE: '12:00', durationMin: 60 })
    const slots = [
      makeSlot({
        id: 's-moved',
        eventId: 908,
        channelId: 1,
        plannedStartUtc: '2026-03-03T12:00:00.000Z',
        plannedEndUtc: '2026-03-03T13:00:00.000Z',
      }),
    ]
    expect(layoutRundown([event], slots, FIXTURE_CHANNELS, '2026-03-02')).toEqual([])
    const [lane] = layoutRundown([event], slots, FIXTURE_CHANNELS, '2026-03-03')
    expect(lane.blocks[0].event.id).toBe(908)
  })

  it('zero-event day (Sat) → empty lane array (screen renders its empty state)', () => {
    expect(layoutDay('2026-03-07')).toEqual([])
  })
})

describe('property: ∀ blocks 0 ≤ left ∧ left+width ≤ 100 (pin 1 — seeded deterministic sweep)', () => {
  /** Small deterministic LCG — no PBT library in the dependency set (deliberate). */
  function lcg(seed: number): () => number {
    let state = seed >>> 0
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 2 ** 32
    }
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  /** minutes-from-midnight (may exceed 1440) → API-shaped UTC ISO string on 2026-03-02 (+day rollover). */
  const isoAt = (minutes: number): string => {
    const dayOffset = Math.floor(minutes / 1440)
    const rest = minutes - dayOffset * 1440
    const day = ['2026-03-02', '2026-03-03', '2026-03-04'][dayOffset]
    return `${day}T${pad(Math.floor(rest / 60))}:${pad(rest % 60)}:00.000Z`
  }

  it('holds across 500 generated windows + forced edge cases (both window sources)', () => {
    const rand = lcg(0xb1f00d)
    const cases: { startMin: number; durationMin: number }[] = []
    for (let i = 0; i < 500; i++) {
      cases.push({
        startMin: Math.floor(rand() * 1440), // 0..1439 (same-day starts — start-day-owns)
        durationMin: Math.floor(rand() * 1200), // 0..1199 incl. cross-midnight windows
      })
    }
    // Forced edges: fully-off-axis left, zero-width off-axis, end exactly at 05:00,
    // floor-at-right-boundary, sliver-adjacent, latest possible start, cross-midnight
    // long. Pushed TWICE (offset 7 flips index parity) so every edge exercises BOTH
    // window sources — the source alternates on index parity below.
    const forcedEdges = [
      { startMin: 0, durationMin: 60 },
      { startMin: 200, durationMin: 0 },
      { startMin: 280, durationMin: 20 },
      { startMin: 1400, durationMin: 10 },
      { startMin: 1360, durationMin: 80 },
      { startMin: 1439, durationMin: 1 },
      { startMin: 1380, durationMin: 900 },
    ]
    cases.push(...forcedEdges, ...forcedEdges)

    const failures: string[] = []
    cases.forEach(({ startMin, durationMin }, index) => {
      const isSlotSourced = index % 2 === 0
      const event = isSlotSourced
        ? makeEvent({ id: 10_000 + index })
        : makeEvent({
            id: 10_000 + index,
            startDateBE: '2026-03-02',
            startTimeBE: `${Math.floor(startMin / 60)}:${pad(startMin % 60)}`,
            durationMin,
          })
      const slots = isSlotSourced
        ? [
            makeSlot({
              id: `s-prop-${index}`,
              eventId: 10_000 + index,
              channelId: 1,
              plannedStartUtc: isoAt(startMin),
              plannedEndUtc: isoAt(startMin + durationMin),
            }),
          ]
        : []

      const lanes = layoutRundown([event], slots, FIXTURE_CHANNELS, '2026-03-02')
      const blocks = lanes.flatMap((lane) => lane.blocks)
      if (blocks.length !== 1) {
        failures.push(`case ${index} [${startMin}+${durationMin}]: block dropped (never allowed)`)
        return
      }
      const { leftPct, widthPct } = blocks[0]
      if (leftPct < -1e-6 || leftPct + widthPct > 100 + 1e-6 || widthPct <= 0) {
        failures.push(`case ${index} [${startMin}+${durationMin}]: left=${leftPct} width=${widthPct}`)
      }
    })

    expect(failures).toEqual([]) // failure output names the offending windows
  })
})
