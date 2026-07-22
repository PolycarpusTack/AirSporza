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
 * TODO-KPI: provisional KPI coverage targets (percent) per deliverable type (RC-2-T2).
 * The T888 value mirrors the beheersovereenkomst's CLAIMED subtitling target and is
 * NOT contractually verified — RC-0-T1 verifies it as a config edit (AS-1, no deploy).
 * `null` = no coverage target defined for the type. Tests assert the WIRING (the KPI
 * endpoint returns whatever stands here), never that a number is correct.
 */
export const ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE: Readonly<Record<AccessibilityType, number | null>> = {
  T888: 99,
  AUDIO_DESCRIPTION: null,
  VGT: null,
}

/**
 * Lead time N (days) for the stage-4 `ACCESSIBILITY_UNPLANNED` check (RC-2-T3): an
 * event whose slot starts within N days and still has a REQUIRED deliverable not yet
 * ≥ PLANNED gets a validation warning.
 *
 * PROVISIONAL ops-tunable default — 14 days is a planning-horizon guess, NOT a
 * verified operational or contractual number (unlike the TODO-KPI values above it is
 * not AS-1-gated; ops adjusts it as a config edit, no deploy semantics beyond
 * restart). Tests assert the MECHANISM (an injected N is respected and this default
 * is what applies when none is injected), never that 14 is correct.
 */
export const ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS = 14

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
