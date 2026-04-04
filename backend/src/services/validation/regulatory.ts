import type { ValidationResult } from './types.js'

/**
 * Stage 4: Regulatory validation
 *
 * Checks for watershed violations, accessibility requirements, etc.
 */
export function validateRegulatory(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  results.push(...checkWatershedViolation(slots))
  results.push(...checkAccessibilityMissing(slots))

  return results
}

/** WATERSHED_VIOLATION (ERROR) — adult/mature content before 21:00 local time */
function checkWatershedViolation(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  for (const slot of slots) {
    const contentRating = slot.sportMetadata?.contentRating
    if (contentRating !== 'adult' && contentRating !== 'mature') continue

    const startUtc = slot.plannedStartUtc ?? slot.estimatedStartUtc
    if (!startUtc) continue

    const tz = slot.channel?.timezone ?? 'UTC'
    const localHour = getLocalHour(new Date(startUtc), tz)

    if (localHour < 21) {
      results.push({
        severity: 'ERROR',
        code: 'WATERSHED_VIOLATION',
        scope: [slot.id],
        message: `Slot has '${contentRating}' content rating but starts before 21:00 in ${tz}`,
        remediation: 'Move to after 21:00 or remove content rating',
      })
    }
  }

  return results
}

/** ACCESSIBILITY_MISSING (WARNING) — no subtitles and no audio description */
function checkAccessibilityMissing(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  for (const slot of slots) {
    const meta = slot.sportMetadata
    if (!meta) continue

    if (!meta.hasSubtitles && !meta.hasAudioDescription) {
      results.push({
        severity: 'WARNING',
        code: 'ACCESSIBILITY_MISSING',
        scope: [slot.id],
        message: 'Slot has no subtitles and no audio description',
      })
    }
  }

  return results
}

/** Convert a UTC Date to local hour (0-23) in the given IANA timezone */
function getLocalHour(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  })
  return Number(formatter.format(date))
}
