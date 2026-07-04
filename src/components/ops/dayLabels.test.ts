/**
 * Unit pins for the shared ops day-label formatter (B-2-T1 PREP — Rule of
 * Three extraction). The two suites of the PRE-EXISTING consumers stayed
 * byte-unchanged across the extraction (behavior pin): ScheduleScreen.test.tsx
 * ('MON 2 MARCH') and EventInspector.test.tsx ('WED 4 MAR'). The Rundown
 * formats ('MON 2', 'MON 2 MARCH 2026') are pinned end-to-end by the B-2
 * feature suite, which lands as its own commit unit.
 *
 * The repo-wide vitest TZ pin (America/New_York) makes the local-components
 * assertions here meaningful on machines east of UTC too.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { formatOpsDayLabel } from './dayLabels'

describe('formatOpsDayLabel', () => {
  it("default (pill format): '2026-03-02' → 'MON 2'", () => {
    expect(formatOpsDayLabel('2026-03-02')).toBe('MON 2')
  })

  it("month 'full' (Schedule day headers): '2026-03-02' → 'MON 2 MARCH'", () => {
    expect(formatOpsDayLabel('2026-03-02', { month: 'full' })).toBe('MON 2 MARCH')
  })

  it("month 'abbr' (Inspector meta line): '2026-03-04' → 'WED 4 MAR'", () => {
    expect(formatOpsDayLabel('2026-03-04', { month: 'abbr' })).toBe('WED 4 MAR')
  })

  it("month 'full' + withYear (Rundown date label): '2026-03-04' → 'WED 4 MARCH 2026'", () => {
    expect(formatOpsDayLabel('2026-03-04', { month: 'full', withYear: true })).toBe('WED 4 MARCH 2026')
  })

  it('parses on LOCAL components — no toISOString day shift (Dec 31 stays Dec 31 under the TZ pin)', () => {
    expect(formatOpsDayLabel('2026-12-31', { month: 'abbr' })).toBe('THU 31 DEC')
  })

  it("unparseable input → '—' (empty string, garbage, out-of-range month)", () => {
    expect(formatOpsDayLabel('')).toBe('—')
    expect(formatOpsDayLabel('not-a-date')).toBe('—')
    expect(formatOpsDayLabel('2026-13-01')).toBe('—')
  })

  it("out-of-range day-of-month → '—' (never rolls over to the next month)", () => {
    expect(formatOpsDayLabel('2026-01-32')).toBe('—')
  })
})
