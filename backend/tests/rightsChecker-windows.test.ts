/**
 * RD-3-T1 — window-aware checkRights v2 permutation table (MAX rigor, ADR-015 §2/§4).
 * Pure fn, flag ON via opts.windowsEnabled. Each new code pinned independently;
 * holdback resolution ORDER + boundary; empty-scope unrestricted; NO_WINDOWS
 * fallthrough; per-category run limits incl. null=no-limit.
 */
import { describe, it, expect } from 'vitest'
import { checkRights } from '../src/services/rightsChecker.js'
import type { Contract } from '@prisma/client'

type Win = {
  id: string; category: string; exclusivity: string; territory: string[]; platforms: string[]
  windowStartUtc: Date | null; windowEndUtc: Date | null; maxRuns: number | null; holdbackHoursMin: number | null
}
function win(over: Partial<Win> = {}): Win {
  return {
    id: 'w-1', category: 'LIVE', exclusivity: 'NON_EXCLUSIVE',
    territory: ['BE'], platforms: ['linear'],
    windowStartUtc: null, windowEndUtc: null, maxRuns: null, holdbackHoursMin: null,
    ...over,
  }
}
function contract(windows: Win[], over: Record<string, unknown> = {}): Contract {
  return {
    id: 1, competitionId: 1, status: 'valid', tenantId: 't',
    validFrom: new Date('2025-01-01'), validUntil: new Date('2027-12-31'),
    linearRights: true, maxRights: true, radioRights: false, sublicensing: false,
    seasonId: null, territory: ['BE'], platforms: ['linear'], coverageType: 'LIVE',
    maxLiveRuns: null, maxPickRunsPerRound: null, windowStartUtc: null, windowEndUtc: null,
    tapeDelayHoursMin: null, blackoutPeriods: [], geoRestriction: null, fee: null, notes: null,
    createdAt: new Date(), updatedAt: new Date(), rightsWindows: windows, ...over,
  } as unknown as Contract
}
const ON = { windowsEnabled: true }
const codes = (rs: ReturnType<typeof checkRights>) => rs.map(r => r.code)
const bySeverity = (rs: ReturnType<typeof checkRights>, code: string) => rs.find(r => r.code === code)?.severity

describe('checkRights v2 — window resolution', () => {
  it('NO_WINDOWS (INFO) + legacy fallthrough when contract has zero windows', () => {
    // legacy fallthrough must still surface a scalar violation (territory)
    const out = checkRights({ territory: 'NL' }, [contract([], { territory: ['BE'] })], ON)
    expect(codes(out)).toContain('NO_WINDOWS')
    expect(bySeverity(out, 'NO_WINDOWS')).toBe('INFO')
    // scope tag is singular 'window' — consistent with every other window code
    expect(out.find(r => r.code === 'NO_WINDOWS')?.scope).toEqual(['rights', 'window'])
    expect(codes(out)).toContain('TERRITORY_BLOCKED') // legacy scalar path ran
  })

  it('WINDOW_CATEGORY_MISSING (WARNING) when no window matches runIntent', () => {
    const out = checkRights({ runIntent: 'DELAYED' }, [contract([win({ category: 'LIVE' })])], ON)
    expect(bySeverity(out, 'WINDOW_CATEGORY_MISSING')).toBe('WARNING')
    expect(out.find(r => r.code === 'WINDOW_CATEGORY_MISSING')?.remediation).toContain('DELAYED')
  })

  it('resolves the window whose category === runIntent (default LIVE)', () => {
    const out = checkRights({ runIntent: 'HIGHLIGHTS', channelId: 1, channelTypes: ['on-demand'] },
      [contract([win({ category: 'LIVE' }), win({ id: 'w2', category: 'HIGHLIGHTS', platforms: ['linear'] })])], ON)
    // matched the HIGHLIGHTS window (platforms ['linear']) → on-demand not covered
    expect(codes(out)).toContain('PLATFORM_NOT_COVERED')
    expect(codes(out)).not.toContain('WINDOW_CATEGORY_MISSING')
  })
})

describe('checkRights v2 — per-window scalar checks', () => {
  it('PLATFORM_NOT_COVERED (WARNING) when channelTypes not in non-empty window.platforms', () => {
    const out = checkRights({ channelId: 1, channelTypes: ['fast'] }, [contract([win({ platforms: ['linear'] })])], ON)
    expect(bySeverity(out, 'PLATFORM_NOT_COVERED')).toBe('WARNING')
  })

  it('empty window.platforms = UNRESTRICTED (no PLATFORM_NOT_COVERED)', () => {
    const out = checkRights({ channelId: 1, channelTypes: ['fast'] }, [contract([win({ platforms: [], territory: ['BE'] })])], ON)
    expect(codes(out)).not.toContain('PLATFORM_NOT_COVERED')
  })

  it('OUTSIDE_RIGHTS_WINDOW (WARNING) when start is outside window bounds', () => {
    const out = checkRights({ startUtc: '2026-01-01T00:00:00.000Z' },
      [contract([win({ windowStartUtc: new Date('2026-06-01T00:00:00.000Z'), windowEndUtc: new Date('2026-09-01T00:00:00.000Z') })])], ON)
    expect(bySeverity(out, 'OUTSIDE_RIGHTS_WINDOW')).toBe('WARNING')
  })

  it('TERRITORY_BLOCKED (ERROR) when input.territory not in non-empty window.territory', () => {
    const out = checkRights({ territory: 'NL' }, [contract([win({ territory: ['BE'] })])], ON)
    expect(bySeverity(out, 'TERRITORY_BLOCKED')).toBe('ERROR')
    expect(out.find(r => r.code === 'TERRITORY_BLOCKED')?.scope).toEqual(['rights', 'territory'])
  })

  it('empty window.territory = UNRESTRICTED (no TERRITORY_BLOCKED)', () => {
    const out = checkRights({ territory: 'NL' }, [contract([win({ territory: [], platforms: ['linear'] })])], ON)
    expect(codes(out)).not.toContain('TERRITORY_BLOCKED')
  })
})

describe('checkRights v2 — per-category run limits', () => {
  it('MAX_RUNS_EXCEEDED (ERROR) at/over window.maxRuns', () => {
    const out = checkRights({ currentRunCount: 2 }, [contract([win({ maxRuns: 2 })])], ON)
    expect(bySeverity(out, 'MAX_RUNS_EXCEEDED')).toBe('ERROR')
  })
  it('MAX_RUNS_NEAR (WARNING) at maxRuns-1', () => {
    const out = checkRights({ currentRunCount: 1 }, [contract([win({ maxRuns: 2 })])], ON)
    expect(bySeverity(out, 'MAX_RUNS_NEAR')).toBe('WARNING')
  })
  it('null window.maxRuns = no limit (RD-1F) — no run codes', () => {
    const out = checkRights({ currentRunCount: 99 }, [contract([win({ maxRuns: null })])], ON)
    expect(codes(out)).not.toContain('MAX_RUNS_EXCEEDED')
    expect(codes(out)).not.toContain('MAX_RUNS_NEAR')
  })
})

describe('checkRights v2 — holdback resolution order (ADR-015 §4)', () => {
  const holdbackWin = win({ category: 'DELAYED', holdbackHoursMin: 24, territory: ['BE'], platforms: ['linear'] })
  const liveEnd = '2026-03-01T00:00:00.000Z'
  const liveEndMs = new Date(liveEnd).getTime()
  const earliest = liveEndMs + 24 * 3600_000 // liveEnd + 24h

  it('(1a) ledger actual is USED — violation before ledgerEnd+holdback', () => {
    const out = checkRights(
      { runIntent: 'DELAYED', startUtc: new Date(earliest - 1).toISOString(),
        liveRunEndedAtUtc: liveEnd, scheduledEndUtc: null },
      [contract([holdbackWin])], ON)
    expect(bySeverity(out, 'HOLDBACK_VIOLATION')).toBe('ERROR')
    expect(out.find(r => r.code === 'HOLDBACK_VIOLATION')?.scope).toEqual(['rights', 'holdback'])
    // remediation names the earliest lawful start (actionable publish-blocking ERROR)
    expect(out.find(r => r.code === 'HOLDBACK_VIOLATION')?.remediation).toContain(new Date(earliest).toISOString())
  })

  it('(1b) ledger PRECEDENCE: with ledger EARLIER than scheduled, only ledger+holdback gates (kills max(ledger,scheduled))', () => {
    // ledger 2026-03-01, scheduled 2026-03-10 (LATER). Correct picks ledger →
    // earliest = ledger+24h. A max()/scheduled-first mutant would gate on the later
    // scheduled end and wrongly flag. Start exactly at ledger+24h → NO violation.
    const scheduledLater = '2026-03-10T00:00:00.000Z'
    const out = checkRights(
      { runIntent: 'DELAYED', startUtc: new Date(earliest).toISOString(),
        liveRunEndedAtUtc: liveEnd, scheduledEndUtc: scheduledLater },
      [contract([holdbackWin])], ON)
    expect(codes(out)).not.toContain('HOLDBACK_VIOLATION')
  })

  it('(2) scheduled end used when no ledger end present', () => {
    const out = checkRights(
      { runIntent: 'DELAYED', startUtc: new Date(earliest - 1).toISOString(),
        liveRunEndedAtUtc: null, scheduledEndUtc: liveEnd },
      [contract([holdbackWin])], ON)
    expect(bySeverity(out, 'HOLDBACK_VIOLATION')).toBe('ERROR')
  })

  it('(3) neither present → HOLDBACK_LIVE_END_UNKNOWN (INFO), no violation', () => {
    const out = checkRights(
      { runIntent: 'DELAYED', startUtc: liveEnd, liveRunEndedAtUtc: null, scheduledEndUtc: null },
      [contract([holdbackWin])], ON)
    expect(bySeverity(out, 'HOLDBACK_LIVE_END_UNKNOWN')).toBe('INFO')
    expect(codes(out)).not.toContain('HOLDBACK_VIOLATION')
  })

  it('boundary: exactly at liveEnd+holdback = NO violation', () => {
    const out = checkRights(
      { runIntent: 'DELAYED', startUtc: new Date(earliest).toISOString(), liveRunEndedAtUtc: liveEnd },
      [contract([holdbackWin])], ON)
    expect(codes(out)).not.toContain('HOLDBACK_VIOLATION')
  })

  it('boundary: one ms before earliest = violation', () => {
    const out = checkRights(
      { runIntent: 'DELAYED', startUtc: new Date(earliest - 1).toISOString(), liveRunEndedAtUtc: liveEnd },
      [contract([holdbackWin])], ON)
    expect(codes(out)).toContain('HOLDBACK_VIOLATION')
  })

  it('no holdback when window.holdbackHoursMin is null', () => {
    const out = checkRights(
      { runIntent: 'DELAYED', startUtc: '2020-01-01T00:00:00.000Z', liveRunEndedAtUtc: liveEnd },
      [contract([win({ category: 'DELAYED', holdbackHoursMin: null, territory: [], platforms: [] })])], ON)
    expect(codes(out)).not.toContain('HOLDBACK_VIOLATION')
    expect(codes(out)).not.toContain('HOLDBACK_LIVE_END_UNKNOWN')
  })

  it('NaN guard: malformed liveRunEndedAtUtc → HOLDBACK_LIVE_END_UNKNOWN, NOT a swallowed violation', () => {
    const out = checkRights(
      { runIntent: 'DELAYED', startUtc: new Date(earliest - 1).toISOString(),
        liveRunEndedAtUtc: 'not-a-date', scheduledEndUtc: null },
      [contract([holdbackWin])], ON)
    expect(bySeverity(out, 'HOLDBACK_LIVE_END_UNKNOWN')).toBe('INFO')
    expect(codes(out)).not.toContain('HOLDBACK_VIOLATION') // must NOT silently pass as "rights OK"
  })

  it('NaN guard: malformed startUtc → HOLDBACK_LIVE_END_UNKNOWN, no false pass', () => {
    const out = checkRights(
      { runIntent: 'DELAYED', startUtc: 'garbage', liveRunEndedAtUtc: liveEnd },
      [contract([holdbackWin])], ON)
    expect(bySeverity(out, 'HOLDBACK_LIVE_END_UNKNOWN')).toBe('INFO')
    expect(codes(out)).not.toContain('HOLDBACK_VIOLATION')
  })

  it('LIVE-category guard: a LIVE window with holdbackHoursMin set does NOT enforce holdback', () => {
    // Kills the `runIntent !== "LIVE"` guard mutant: no violation AND no UNKNOWN note.
    const out = checkRights(
      { runIntent: 'LIVE', startUtc: '2026-03-01T00:00:00.000Z', liveRunEndedAtUtc: null, scheduledEndUtc: null },
      [contract([win({ category: 'LIVE', holdbackHoursMin: 24, territory: ['BE'], platforms: ['linear'] })])], ON)
    expect(codes(out)).not.toContain('HOLDBACK_VIOLATION')
    expect(codes(out)).not.toContain('HOLDBACK_LIVE_END_UNKNOWN')
  })
})

describe('checkRights v2 — WINDOW_UNSCOPED (INFO) + multi-INFO', () => {
  it('fires when the matched window has empty TERRITORY (platforms non-empty)', () => {
    const out = checkRights({}, [contract([win({ territory: [], platforms: ['linear'] })])], ON)
    expect(bySeverity(out, 'WINDOW_UNSCOPED')).toBe('INFO')
  })

  it('fires when the matched window has empty PLATFORMS (territory non-empty)', () => {
    const out = checkRights({}, [contract([win({ territory: ['BE'], platforms: [] })])], ON)
    expect(bySeverity(out, 'WINDOW_UNSCOPED')).toBe('INFO')
  })
  it('does NOT fire when both scopes are non-empty', () => {
    const out = checkRights({}, [contract([win({ territory: ['BE'], platforms: ['linear'] })])], ON)
    expect(codes(out)).not.toContain('WINDOW_UNSCOPED')
  })
  it('a slot hitting >1 INFO trigger emits each distinct code', () => {
    // unscoped window (both empty) + holdback with no live end → 2 distinct INFO codes
    const out = checkRights(
      { runIntent: 'DELAYED', startUtc: '2026-03-01T00:00:00.000Z' },
      [contract([win({ category: 'DELAYED', territory: [], platforms: [], holdbackHoursMin: 24 })])], ON)
    expect(codes(out)).toContain('WINDOW_UNSCOPED')
    expect(codes(out)).toContain('HOLDBACK_LIVE_END_UNKNOWN')
  })
})

describe('checkRights v2 — contract-level checks regardless of window', () => {
  it('BLACKOUT_PERIOD (ERROR) checked at contract level even with a matched window', () => {
    const out = checkRights({ startUtc: '2026-03-15T12:00:00.000Z' },
      [contract([win({ territory: ['BE'], platforms: ['linear'] })],
        { blackoutPeriods: [{ start: '2026-03-15T00:00:00.000Z', end: '2026-03-16T00:00:00.000Z' }] })], ON)
    expect(bySeverity(out, 'BLACKOUT_PERIOD')).toBe('ERROR')
  })
  it('CONTRACT_EXPIRING (WARNING) still emitted in the window path', () => {
    const out = checkRights({}, [contract([win({ territory: ['BE'], platforms: ['linear'] })], { status: 'expiring' })], ON)
    expect(bySeverity(out, 'CONTRACT_EXPIRING')).toBe('WARNING')
  })
  it('shared empty/none guards unchanged in v2 (no contracts → NO_VALID_CONTRACT)', () => {
    expect(checkRights({}, [], ON).map(r => r.code)).toEqual(['NO_VALID_CONTRACT'])
  })
})
