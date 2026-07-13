import type { ValidationResult } from './types.js'
import { checkListedEventFta, type ListedFtaEvent } from './listedEventFta.js'

/**
 * Stage 4: Regulatory validation — watershed, accessibility, and (RC-1-T3, flag-gated)
 * listed-events FTA obligations.
 *
 * @param opts.regulatoryEnabled + opts.events  When falsy/absent, runs ONLY watershed +
 *   accessibility — byte-identical to the pre-RC-1-T3 baseline (golden master). Existing
 *   callers passing just `slots` are unchanged. When `regulatoryEnabled` is true AND
 *   `events` are provided, ALSO runs `checkListedEventFta` (LISTED_EVENT_FTA). The flag is
 *   read at the route boundary and threaded here; this fn never reads env.
 */
export function validateRegulatory(
  slots: any[],
  opts: { events?: ListedFtaEvent[]; regulatoryEnabled?: boolean } = {},
): ValidationResult[] {
  const results: ValidationResult[] = []

  results.push(...checkWatershedViolation(slots))
  results.push(...checkAccessibilityMissing(slots))

  if (opts.regulatoryEnabled && opts.events) {
    results.push(...checkListedEventFta(opts.events, slots))
  }

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
