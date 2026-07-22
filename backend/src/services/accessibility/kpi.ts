/**
 * RC-2-T2 — pure KPI aggregation for accessibility deliverables (no DB, no HTTP).
 * Coverage % per deliverable type, reconciling 1:1 with the raw rows it is fed:
 * every row lands in exactly one type bucket; `requiredCount`/`deliveredCount` are
 * plain raw-row filters — nothing is dropped, weighted, or double-counted.
 *
 * The target % is CONFIG-read (ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE — TODO-KPI
 * provisional, AS-1): this module never hardcodes a KPI number.
 */
import type { AccessibilityStatus, AccessibilityType } from '@prisma/client'
import { ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE } from '../../config/accessibility.js'

/** The raw material — one deliverable row projected to what the KPI needs. */
export interface AccessibilityKpiRow {
  type: AccessibilityType
  status: AccessibilityStatus
}

export interface AccessibilityKpiEntry {
  type: AccessibilityType
  /** All rows of this type in the period (including NOT_REQUIRED). */
  total: number
  /** Rows whose status is anything but NOT_REQUIRED (the KPI denominator). */
  requiredCount: number
  /** Rows with status DELIVERED (the KPI numerator). */
  deliveredCount: number
  /** deliveredCount / requiredCount * 100, rounded to 2 decimals; null when requiredCount = 0. */
  coveragePct: number | null
  /** Config-read target (TODO-KPI provisional); null = no target defined. */
  targetPct: number | null
}

const roundToTwoDecimals = (n: number): number => Math.round(n * 100) / 100

export function aggregateAccessibilityKpi(
  rows: readonly AccessibilityKpiRow[],
  targets: Readonly<Record<AccessibilityType, number | null>> = ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE,
): AccessibilityKpiEntry[] {
  // Buckets derive from the target record's keys (exhaustively typed over the enum),
  // so a future 4th AccessibilityType cannot be silently dropped from the report.
  return (Object.keys(targets) as AccessibilityType[]).map(type => {
    const ofType = rows.filter(r => r.type === type)
    const requiredCount = ofType.filter(r => r.status !== 'NOT_REQUIRED').length
    const deliveredCount = ofType.filter(r => r.status === 'DELIVERED').length
    return {
      type,
      total: ofType.length,
      requiredCount,
      deliveredCount,
      coveragePct: requiredCount === 0 ? null : roundToTwoDecimals((deliveredCount / requiredCount) * 100),
      targetPct: targets[type],
    }
  })
}
