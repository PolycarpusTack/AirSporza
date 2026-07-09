/**
 * Shared ops day-label formatting (B-2-T1 PREP — Rule of Three TRIGGERED).
 * The third consumer of the WEEKDAY + day-of-month + MONTH label family forced
 * this extraction (anti-duplication guardrail):
 *   1. ScheduleScreen day-group headers   'MON 2 MARCH'        (month: 'full')
 *   2. EventInspector meta line           'WED 4 MAR'          (month: 'abbr')
 *   3. Rundown day pills + date label     'MON 2' / 'WED 4 MARCH 2026'
 *
 * Input is a 'YYYY-MM-DD' key parsed on LOCAL components (no TZ drift) —
 * upstream code normalizes Date/ISO-datetime shapes via getDateKey first.
 * Unparseable/out-of-range input → '—' (EventInspector's established fallback).
 *
 * Naming precedent (B-2-T1 review): `formatOpsDayLabel` joins the *Label
 * formatter family — future ops formatter extractions (B-3+) follow it.
 *
 * NOT in this family: EventInspector's title-case 'until 30 Jun 2027' line —
 * contract-date wording with different casing rules stays local there.
 */

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS_FULL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const MONTHS_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export interface OpsDayLabelOptions {
  /** 'none' (default) → 'MON 2' · 'abbr' → 'WED 4 MAR' · 'full' → 'MON 2 MARCH' */
  month?: 'none' | 'abbr' | 'full'
  /** append the year → 'WED 4 MARCH 2026' */
  withYear?: boolean
}

/** 'YYYY-MM-DD' → uppercase ops day label; '—' for unparseable/out-of-range input. */
export function formatOpsDayLabel(dateKey: string, { month = 'none', withYear = false }: OpsDayLabelOptions = {}): string {
  const [yearNum, monthNum, dayNum] = dateKey.split('-').map(Number)
  if (!yearNum || !monthNum || monthNum > 12 || !dayNum || dayNum > 31) return '—'
  const weekday = WEEKDAYS[new Date(yearNum, monthNum - 1, dayNum).getDay()]
  const monthPart = month === 'none' ? '' : ` ${(month === 'full' ? MONTHS_FULL : MONTHS_ABBR)[monthNum - 1]}`
  return `${weekday} ${dayNum}${monthPart}${withYear ? ` ${yearNum}` : ''}`
}
