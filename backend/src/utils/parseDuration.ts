/**
 * Parse a human-readable duration string into minutes.
 *
 * Handles:
 *   "90"          → 90
 *   "90 min"      → 90
 *   "1h30"        → 90
 *   "1h 30m"      → 90
 *   "01:30:00"    → 90
 *   "01:30"       → 90
 *   "2h"          → 120
 *   "2h30m"       → 150
 *   "45m"         → 45
 *
 * Returns null on failure or empty input.
 */
export function parseDurationToMinutes(raw: string | null | undefined): number | null {
  if (!raw || !raw.trim()) return null

  const s = raw.trim().toLowerCase()

  // Pure number (minutes)
  if (/^\d+$/.test(s)) {
    return parseInt(s, 10)
  }

  // "N min" / "N minutes"
  const minOnly = s.match(/^(\d+)\s*(?:min(?:utes?)?|m)$/)
  if (minOnly) return parseInt(minOnly[1], 10)

  // "Nh" / "NhMm" / "Nh Mm" / "NhM"
  const hm = s.match(/^(\d+)\s*h\s*(?:(\d+)\s*m?)?$/)
  if (hm) {
    const hours = parseInt(hm[1], 10)
    const mins = hm[2] ? parseInt(hm[2], 10) : 0
    return hours * 60 + mins
  }

  // "HH:MM:SS" or "HH:MM"
  const timeParts = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (timeParts) {
    const hours = parseInt(timeParts[1], 10)
    const mins = parseInt(timeParts[2], 10)
    return hours * 60 + mins
  }

  return null
}
