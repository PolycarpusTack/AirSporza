/**
 * Characterization tests for dateTime utils (B-3-T1).
 * Pins CURRENT behavior — surprising results are documented in the task
 * findings list, not fixed here.
 *
 * Timezone: pinned to Europe/Brussels (the app's operating context) by
 * setting process.env.TZ before any Date use. Node (incl. Windows) picks up
 * runtime TZ changes; a guard test asserts the pin actually took effect.
 * DST 2026 (Brussels): spring forward Sun 2026-03-29, fall back Sun 2026-10-25.
 */
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'Europe/Brussels'

import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from 'vitest'
import {
  weekMonday,
  addDays,
  dateStr,
  addDaysStr,
  getDateKey,
  timeToMinutes,
  parseDurationMin,
  fmtAgo,
  fmtDateTime,
} from './dateTime'

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

/** Normalize Intl spacing quirks (NBSP / narrow NBSP) for stable comparison. */
function normSpace(s: string): string {
  return s.replace(/[  ]/g, ' ')
}

describe('timezone harness guard', () => {
  it('runs under Europe/Brussels with real DST transitions in 2026', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Brussels')
    // Spring-forward day (Sun 2026-03-29) is 23 hours long
    expect(new Date(2026, 2, 29, 12).getTime() - new Date(2026, 2, 28, 12).getTime()).toBe(23 * 3600000)
    // Fall-back day (Sun 2026-10-25) is 25 hours long
    expect(new Date(2026, 9, 25, 12).getTime() - new Date(2026, 9, 24, 12).getTime()).toBe(25 * 3600000)
  })
})

describe('weekMonday', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns this week Monday at local midnight when called with no args (now = Friday)', () => {
    vi.setSystemTime(new Date(2026, 5, 12, 10, 30)) // Fri 2026-06-12
    const m = weekMonday()
    expect(dateStr(m)).toBe('2026-06-08')
    expect(m.getDay()).toBe(1)
    expect([m.getHours(), m.getMinutes(), m.getSeconds(), m.getMilliseconds()]).toEqual([0, 0, 0, 0])
  })

  it('treats Sunday as belonging to the previous Monday-based week', () => {
    vi.setSystemTime(new Date(2026, 5, 14, 9, 0)) // Sun 2026-06-14
    expect(dateStr(weekMonday())).toBe('2026-06-08')
  })

  it('applies positive and negative week offsets', () => {
    vi.setSystemTime(new Date(2026, 5, 12, 10, 30)) // Fri 2026-06-12
    expect(dateStr(weekMonday(1))).toBe('2026-06-15')
    expect(dateStr(weekMonday(-2))).toBe('2026-05-25')
  })

  it('accepts a Date and returns the Monday of that week, without mutating the input', () => {
    const input = new Date(2026, 5, 10, 15, 45) // Wed 2026-06-10
    const before = input.getTime()
    expect(dateStr(weekMonday(input))).toBe('2026-06-08')
    expect(input.getTime()).toBe(before)
  })

  it('handles the DST spring-forward Sunday (2026-03-29) by returning Mon 2026-03-23 at 00:00', () => {
    const m = weekMonday(new Date(2026, 2, 29, 15, 0)) // Sun 29 Mar, CEST
    expect(dateStr(m)).toBe('2026-03-23')
    expect(m.getHours()).toBe(0)
  })
})

describe('addDays', () => {
  it('adds days and rolls over month boundaries without mutating the input', () => {
    const d = new Date(2026, 0, 31, 12, 0) // 2026-01-31
    const r = addDays(d, 1)
    expect(dateStr(r)).toBe('2026-02-01')
    expect(dateStr(d)).toBe('2026-01-31')
  })

  it('supports negative offsets across month boundaries', () => {
    expect(dateStr(addDays(new Date(2026, 2, 1), -1))).toBe('2026-02-28') // 2026 not a leap year
  })

  it('keeps the wall-clock hour across the spring-forward transition', () => {
    const r = addDays(new Date(2026, 2, 28, 12, 0), 1) // Sat 12:00 CET -> Sun
    expect(dateStr(r)).toBe('2026-03-29')
    expect(r.getHours()).toBe(12)
  })
})

describe('dateStr', () => {
  it('formats using local components with zero padding', () => {
    expect(dateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('does not shift the date at local midnight (unlike toISOString in Brussels)', () => {
    const d = new Date(2026, 5, 12, 0, 0, 0) // 00:00 local = 22:00Z previous day
    expect(dateStr(d)).toBe('2026-06-12')
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-11') // demonstrates the UTC pitfall avoided
  })
})

describe('addDaysStr', () => {
  it('crosses the spring-forward transition (23h day) without skipping or repeating a date', () => {
    expect(addDaysStr('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDaysStr('2026-03-29', 1)).toBe('2026-03-30')
  })

  it('crosses the fall-back transition (25h day) without skipping or repeating a date', () => {
    expect(addDaysStr('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDaysStr('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('handles year rollover and negative offsets', () => {
    expect(addDaysStr('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysStr('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysStr('2026-06-12', 0)).toBe('2026-06-12')
  })
})

describe('getDateKey', () => {
  it('splits ISO strings on T without any timezone conversion', () => {
    expect(getDateKey('2026-06-12T20:00:00Z')).toBe('2026-06-12')
    expect(getDateKey('2026-06-12')).toBe('2026-06-12')
    // PINNED: a UTC instant that is already "the next day" in Brussels keeps its UTC date
    expect(getDateKey('2026-06-11T23:00:00Z')).toBe('2026-06-11') // = 2026-06-12 01:00 local
  })

  it('uses local components for Date inputs (consistent with dateStr)', () => {
    expect(getDateKey(new Date(2026, 5, 12, 0, 30))).toBe('2026-06-12')
  })
})

describe('timeToMinutes', () => {
  it('converts HH:MM and H:MM to minutes from midnight', () => {
    expect(timeToMinutes('20:00')).toBe(1200)
    expect(timeToMinutes('9:05')).toBe(545)
    expect(timeToMinutes('00:00')).toBe(0)
  })

  it('performs no range validation (24:30 is allowed)', () => {
    expect(timeToMinutes('24:30')).toBe(1470)
  })

  it('coerces invalid or partial input to 0 / hour-only values', () => {
    // PINNED: garbage input silently becomes 0 (midnight), not NaN or an error
    expect(timeToMinutes('abc')).toBe(0)
    expect(timeToMinutes('')).toBe(0)
    expect(timeToMinutes('12')).toBe(720) // hour-only input is accepted
  })
})

describe('parseDurationMin', () => {
  it('parses plain numeric strings as minutes', () => {
    expect(parseDurationMin('120')).toBe(120)
    expect(parseDurationMin('90.5')).toBe(90.5)
  })

  it('falls back for zero, negative, empty, and nullish inputs', () => {
    // PINNED: '0' is not parsed as 0 minutes — it falls back to 90
    expect(parseDurationMin('0')).toBe(90)
    expect(parseDurationMin('-30')).toBe(90)
    expect(parseDurationMin(undefined)).toBe(90)
    expect(parseDurationMin(null)).toBe(90)
    expect(parseDurationMin('')).toBe(90)
    expect(parseDurationMin(undefined, 45)).toBe(45) // custom fallback honoured
  })

  it('parses SMPTE timecodes (HH:MM:SS;FF) and HH:MM, ignoring seconds/frames', () => {
    expect(parseDurationMin('01:30:00;00')).toBe(90)
    expect(parseDurationMin('01:30:45:12')).toBe(90) // seconds discarded
    expect(parseDurationMin('02:00')).toBe(120)
    expect(parseDurationMin('0:45')).toBe(45)
  })

  it('does NOT parse plain HH:MM:SS (no frames) — falls back instead', () => {
    // PINNED: '01:30:00' only "works" by coincidence (fallback is also 90).
    // A custom fallback exposes that it is not actually parsed.
    expect(parseDurationMin('01:30:00')).toBe(90)
    expect(parseDurationMin('01:30:00', 60)).toBe(60)
  })

  it('parses "Xh Ym" style but not minutes-only "Xm"', () => {
    expect(parseDurationMin('1h 30m')).toBe(90)
    expect(parseDurationMin('2h')).toBe(120)
    // PINNED: '45m' is unsupported and falls back to 90
    expect(parseDurationMin('45m')).toBe(90)
  })
})

describe('fmtAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 12, 12, 0, 0)) // 2026-06-12 12:00 local
  })
  afterEach(() => vi.useRealTimers())

  it('formats nullish, sub-minute, minute, hour, and day buckets', () => {
    expect(fmtAgo(null)).toBe('—')
    expect(fmtAgo(new Date(2026, 5, 12, 11, 59, 40).toISOString())).toBe('just now')
    expect(fmtAgo(new Date(2026, 5, 12, 11, 55, 0).toISOString())).toBe('5m ago')
    expect(fmtAgo(new Date(2026, 5, 12, 10, 30, 0).toISOString())).toBe('1h ago')
    expect(fmtAgo(new Date(2026, 5, 10, 10, 0, 0).toISOString())).toBe('2d ago')
  })

  it('renders future timestamps as "just now"', () => {
    // PINNED: negative diff is not special-cased
    expect(fmtAgo(new Date(2026, 5, 12, 12, 30, 0).toISOString())).toBe('just now')
  })
})

describe('fmtDateTime', () => {
  it('returns an em dash for null', () => {
    expect(fmtDateTime(null)).toBe('—')
  })

  it('formats with en-BE medium date + short time in local (Brussels) time', () => {
    expect(normSpace(fmtDateTime('2026-06-12T20:00:00'))).toBe('12 Jun 2026, 20:00')
    // UTC input is converted to Brussels wall-clock (CET = UTC+1 in January)
    expect(normSpace(fmtDateTime('2026-01-15T10:00:00Z'))).toBe('15 Jan 2026, 11:00')
  })
})
