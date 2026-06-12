/**
 * Characterization tests for calendarLayout (B-3-T1).
 * Pins CURRENT behavior — surprising results are documented in the task
 * findings list, not fixed here.
 *
 * Grid facts: CAL_START_HOUR 08:00, CAL_END_HOUR 23:00, 60px/hour, height 900px.
 * Durations flow through dateTime.parseDurationMin (minutes, fallback 90).
 */
import { describe, it, expect } from 'vitest'
import {
  eventTopPx,
  eventHeightPx,
  computeOverlapLayout,
  hexToChannelColor,
  buildColorMapById,
  statusVariant,
  FALLBACK_COLOR,
  CAL_HEIGHT,
} from './calendarLayout'
import type { Event, EventStatus } from '../data/types'

let nextEventId = 1

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: nextEventId++,
    sportId: 1,
    competitionId: 10,
    participants: 'Team A vs Team B',
    startDateBE: '2026-06-12',
    startTimeBE: '10:00',
    isLive: false,
    isDelayedLive: false,
    customFields: {},
    ...overrides,
  } as Event
}

describe('eventTopPx', () => {
  it('maps times relative to the 08:00 grid start at 1px per minute', () => {
    expect(eventTopPx('08:00')).toBe(0)
    expect(eventTopPx('09:30')).toBe(90)
    expect(eventTopPx('20:15')).toBe(735)
  })

  it('clamps times before grid start to 0', () => {
    expect(eventTopPx('07:00')).toBe(0)
    expect(eventTopPx('00:00')).toBe(0)
  })

  it('does NOT clamp at the bottom — times after 23:00 overflow the 900px grid', () => {
    // PINNED: no upper clamp; a 23:30 event renders below the calendar canvas
    expect(eventTopPx('23:30')).toBe(930)
    expect(eventTopPx('23:30')).toBeGreaterThan(CAL_HEIGHT)
  })

  it('renders invalid time strings at the top of the grid (timeToMinutes coerces to 0)', () => {
    expect(eventTopPx('abc')).toBe(0)
  })
})

describe('eventHeightPx', () => {
  it('maps minutes to pixels with a 20px minimum', () => {
    expect(eventHeightPx(60)).toBe(60)
    expect(eventHeightPx(120)).toBe(120)
    expect(eventHeightPx(5)).toBe(20)
    expect(eventHeightPx(0)).toBe(20) // zero duration still gets the minimum height
    expect(eventHeightPx(-10)).toBe(20)
  })
})

describe('computeOverlapLayout', () => {
  it('returns an empty map for no events', () => {
    expect(computeOverlapLayout([]).size).toBe(0)
  })

  it('places a single event in column 0 of 1', () => {
    const e = makeEvent({ id: 1, startTimeBE: '10:00', duration: '60' })
    expect(computeOverlapLayout([e]).get(1)).toEqual({ col: 0, totalCols: 1 })
  })

  it('packs two overlapping events into two columns', () => {
    const a = makeEvent({ id: 1, startTimeBE: '10:00', duration: '60' })
    const b = makeEvent({ id: 2, startTimeBE: '10:30', duration: '60' })
    const layout = computeOverlapLayout([a, b])
    expect(layout.get(1)).toEqual({ col: 0, totalCols: 2 })
    expect(layout.get(2)).toEqual({ col: 1, totalCols: 2 })
  })

  it('treats exact boundary touch (end == start) as non-overlapping', () => {
    const a = makeEvent({ id: 1, startTimeBE: '10:00', duration: '60' }) // ends 11:00
    const b = makeEvent({ id: 2, startTimeBE: '11:00', duration: '60' })
    const layout = computeOverlapLayout([a, b])
    expect(layout.get(1)).toEqual({ col: 0, totalCols: 1 })
    expect(layout.get(2)).toEqual({ col: 0, totalCols: 1 })
  })

  it('reuses a freed column within an overlap cluster', () => {
    const a = makeEvent({ id: 1, startTimeBE: '10:00', duration: '60' }) // col 0
    const b = makeEvent({ id: 2, startTimeBE: '10:30', duration: '60' }) // col 1
    const c = makeEvent({ id: 3, startTimeBE: '11:00', duration: '60' }) // col 0 again
    const layout = computeOverlapLayout([a, b, c])
    expect(layout.get(1)).toEqual({ col: 0, totalCols: 2 })
    expect(layout.get(2)).toEqual({ col: 1, totalCols: 2 })
    expect(layout.get(3)).toEqual({ col: 0, totalCols: 2 })
  })

  it('breaks same-start ties by duration: the longer event takes column 0', () => {
    const short = makeEvent({ id: 1, startTimeBE: '10:00', duration: '30' })
    const long = makeEvent({ id: 2, startTimeBE: '10:00', duration: '120' })
    const layout = computeOverlapLayout([short, long])
    expect(layout.get(2)!.col).toBe(0)
    expect(layout.get(1)!.col).toBe(1)
  })

  it('treats duration "0" as the 90-minute fallback, so "zero-duration" events still collide', () => {
    // PINNED: parseDurationMin('0') -> 90, there is no true zero-width event
    const zero = makeEvent({ id: 1, startTimeBE: '10:00', duration: '0' })
    const other = makeEvent({ id: 2, startTimeBE: '11:00', duration: '60' }) // inside 10:00–11:30
    const layout = computeOverlapLayout([zero, other])
    expect(layout.get(1)!.totalCols).toBe(2)
    expect(layout.get(2)!.totalCols).toBe(2)
  })

  it('prefers linearStartTime over startTimeBE', () => {
    const a = makeEvent({ id: 1, startTimeBE: '10:00', linearStartTime: '14:00', duration: '60' })
    const b = makeEvent({ id: 2, startTimeBE: '14:30', duration: '60' })
    const c = makeEvent({ id: 3, startTimeBE: '10:00', duration: '60' })
    const layout = computeOverlapLayout([a, b, c])
    expect(layout.get(1)!.totalCols).toBe(2) // overlaps b at 14:00, not c at 10:00
    expect(layout.get(3)).toEqual({ col: 0, totalCols: 1 })
  })

  it('ignores durationMin entirely — only the deprecated duration string is read', () => {
    // PINNED: a 10-hour durationMin has no effect; fallback 90min applies
    const long = makeEvent({ id: 1, startTimeBE: '10:00', durationMin: 600, duration: undefined })
    const later = makeEvent({ id: 2, startTimeBE: '12:00', duration: '60' })
    const layout = computeOverlapLayout([long, later])
    expect(layout.get(1)).toEqual({ col: 0, totalCols: 1 })
    expect(layout.get(2)).toEqual({ col: 0, totalCols: 1 })
  })

  it('defaults missing times to 00:00 (events sort and render at the top)', () => {
    const noTime = makeEvent({ id: 1, startTimeBE: '', duration: '60' })
    const early = makeEvent({ id: 2, startTimeBE: '00:30', duration: '60' })
    const layout = computeOverlapLayout([early, noTime])
    expect(layout.get(1)).toEqual({ col: 0, totalCols: 2 }) // 00:00–01:00
    expect(layout.get(2)).toEqual({ col: 1, totalCols: 2 }) // 00:30–01:30
  })
})

describe('hexToChannelColor', () => {
  it('lightens text for dark backgrounds', () => {
    expect(hexToChannelColor('#000000')).toEqual({
      border: '#000000',
      bg: 'rgba(0,0,0,0.1)',
      text: '#595959',
    })
  })

  it('darkens text for light backgrounds', () => {
    expect(hexToChannelColor('#ffffff')).toEqual({
      border: '#ffffff',
      bg: 'rgba(255,255,255,0.1)',
      text: '#666666',
    })
  })

  it('falls back for anything that is not a 6-digit hex', () => {
    expect(hexToChannelColor('#fff')).toEqual(FALLBACK_COLOR) // shorthand not supported
    expect(hexToChannelColor('red')).toEqual(FALLBACK_COLOR)
    expect(hexToChannelColor('')).toEqual(FALLBACK_COLOR)
    expect(hexToChannelColor('#12345g')).toEqual(FALLBACK_COLOR)
  })
})

describe('buildColorMapById', () => {
  it('maps channel ids to computed colors, with fallback for invalid colors', () => {
    const map = buildColorMapById([
      { id: 1, color: '#000000' },
      { id: 2, color: 'nope' },
    ])
    expect(map[1].text).toBe('#595959')
    expect(map[2]).toEqual(FALLBACK_COLOR)
  })
})

describe('statusVariant', () => {
  it('pins the full status -> badge variant mapping', () => {
    const expected: Record<EventStatus, string> = {
      draft: 'draft',
      ready: 'warning',
      approved: 'success',
      published: 'live',
      live: 'live',
      completed: 'default',
      cancelled: 'danger',
    }
    for (const [status, variant] of Object.entries(expected)) {
      expect(statusVariant(status as EventStatus)).toBe(variant)
    }
  })

  it('falls back to "default" for unknown statuses', () => {
    expect(statusVariant('bogus' as EventStatus)).toBe('default')
  })
})
