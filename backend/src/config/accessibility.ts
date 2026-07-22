import type { AccessibilityType, AccessibilityStatus } from '@prisma/client'

/**
 * TODO-KPI: provisional default (empty set = all sports T888-REQUIRED) — the
 * authoritative subtitling-KPI sport-exclusion set is verified via RC-0-T1 as a
 * config edit (AS-1); NOT legally authoritative.
 *
 * Empty is the SAFE / INCLUSIVE default: with no exclusions every sport's events
 * default to T888 = REQUIRED (never silently drops the subtitling obligation).
 */
export const T888_EXCLUDED_SPORT_IDS: ReadonlySet<number> = new Set<number>()

/**
 * Default accessibility deliverable rows for a NEW event (RC-2-T1). Pure — the
 * exclusion set is injected (defaults to the provisional config set above), so the
 * mechanism is testable without asserting the set's legal correctness.
 *
 * - T888 → REQUIRED, unless the event's sport is excluded → NOT_REQUIRED.
 * - AUDIO_DESCRIPTION → NOT_REQUIRED.
 * - VGT → NOT_REQUIRED.
 */
export function buildDefaultAccessibilityDeliverables(
  event: { sportId: number },
  excludedSportIds: ReadonlySet<number> = T888_EXCLUDED_SPORT_IDS,
): Array<{ type: AccessibilityType; status: AccessibilityStatus }> {
  const t888Status: AccessibilityStatus = excludedSportIds.has(event.sportId) ? 'NOT_REQUIRED' : 'REQUIRED'
  return [
    { type: 'T888', status: t888Status },
    { type: 'AUDIO_DESCRIPTION', status: 'NOT_REQUIRED' },
    { type: 'VGT', status: 'NOT_REQUIRED' },
  ]
}
