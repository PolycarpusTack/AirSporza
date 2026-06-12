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
 * Supports: plain number (incl. "0" → 0), SMPTE timecode (HH:MM:SS;FF),
 * plain HH:MM:SS, HH:MM, "Xh Ym", and minutes-only "Xm"/"X min".
 * Returns `fallback` (default 90) when the input is empty or unrecognised.
 */
export function parseDurationMin(duration?: string | null, fallback = 90): number {
  if (!duration || !duration.trim()) return fallback
  const n = Number(duration)
  // TD-16 fix: '0' is a real zero-minute duration, not a fallback trigger
  if (!isNaN(n) && n >= 0) return n
  // SMPTE timecode (HH:MM:SS;FF / HH:MM:SS:FF) or plain HH:MM:SS —
  // seconds and frames are ignored (TD-16 fix: frames are now optional)
  const hms = duration.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[;:]\d{2})?$/)
  if (hms) return Number(hms[1]) * 60 + Number(hms[2])
  // Standard HH:MM format (e.g., "02:00" → 120min)
  const hhmm = duration.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2])
  const match = duration.match(/(\d+)h\s*(\d+)?m?/)
  if (match) return Number(match[1]) * 60 + Number(match[2] || 0)
  // TD-16 fix: minutes-only "45m" / "120 min"
  const minOnly = duration.match(/^(\d+(?:\.\d+)?)\s*m(?:in)?s?$/i)
  if (minOnly) return Number(minOnly[1])
  return fallback
}

/**
 * THE app-wide accessor for an event's effective duration in minutes.
 * quality-pass fix (C-quality): unified duration accessor — every consumer
 * (calendar layout, crew/resource conflicts, readiness, card rendering) must
 * interpret durations through this one function so they always agree.
 *
 * Prefers the numeric `durationMin` field (0 is a real zero-minute duration,
 * per TD-16), falling back to parsing the deprecated `duration` string via
 * parseDurationMin (minutes app-wide, default fallback 90).
 */
export function effectiveDurationMin(
  ev: { durationMin?: number | null; duration?: string | null },
  fallbackMin = 90
): number {
  if (typeof ev.durationMin === 'number' && ev.durationMin >= 0) return ev.durationMin
  return parseDurationMin(ev.duration || '', fallbackMin)
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
