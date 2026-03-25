// ── Centralized date/time utilities ──────────────────────────────────────────

/**
 * Returns a Date for the Monday of a given week.
 * - If called with no argument or 0, returns this week's Monday.
 * - Accepts a week-offset number (positive = future, negative = past).
 * - Also accepts a Date, returning the Monday of that date's week.
 */
export function weekMonday(offsetOrDate: Date | number = 0): Date {
  const d = typeof offsetOrDate === 'number' ? new Date() : new Date(offsetOrDate)
  const offset = typeof offsetOrDate === 'number' ? offsetOrDate : 0
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Return a new Date that is `n` days after `d`. */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/**
 * Format a Date as "YYYY-MM-DD" using **local** date components
 * (avoids the UTC shift that toISOString() causes around midnight).
 */
export function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * String-based addDays: takes a "YYYY-MM-DD" string, adds `n` days, returns "YYYY-MM-DD".
 * Uses dateStr() internally to avoid UTC shift.
 */
export function addDaysStr(dateString: string, n: number): string {
  const d = new Date(dateString + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return dateStr(d)
}

/**
 * Extract a "YYYY-MM-DD" key from a Date or string.
 * Strings are split on 'T' so ISO timestamps are handled.
 */
export function getDateKey(date: Date | string): string {
  if (typeof date === 'string') return date.split('T')[0]
  return dateStr(date)
}

/** Convert "HH:MM" (or "H:MM") to total minutes from midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Parse a duration string to minutes.
 * Supports: plain number, SMPTE timecode (HH:MM:SS;FF), HH:MM, "Xh Ym".
 * Returns `fallback` (default 90) when the input is empty or unrecognised.
 */
export function parseDurationMin(duration?: string | null, fallback = 90): number {
  if (!duration) return fallback
  const n = Number(duration)
  if (!isNaN(n) && n > 0) return n
  // SMPTE timecode: HH:MM:SS;FF or HH:MM:SS:FF
  const smpte = duration.match(/^(\d{1,2}):(\d{2}):(\d{2})[;:](\d{2})$/)
  if (smpte) return Number(smpte[1]) * 60 + Number(smpte[2])
  // Standard HH:MM format (e.g., "02:00" → 120min)
  const hhmm = duration.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2])
  const match = duration.match(/(\d+)h\s*(\d+)?m?/)
  if (match) return Number(match[1]) * 60 + Number(match[2] || 0)
  return fallback
}

/** Format a relative "X ago" label from an ISO timestamp. */
export function fmtAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Format an ISO timestamp as a medium date + short time using en-BE locale. */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-BE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}
