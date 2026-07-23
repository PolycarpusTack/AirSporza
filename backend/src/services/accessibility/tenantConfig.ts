/**
 * RC-5-T1 — per-tenant accessibility configuration loader (AS-10: client
 * regulatory rules are tenant configuration, never product constants).
 *
 * `loadTenantAccessibilityConfig(tx, tenantId)` returns the tenant's
 * `TenantAccessibilityConfig` row merged over the global constant defaults in
 * `config/accessibility.ts`. The tenantId MUST come from the auth context or the
 * owning row (event.tenantId) — never from client input (TD-31 lesson).
 *
 * PINNED MERGE SEMANTICS (RC-5-T1 decision):
 *  - NO row → EXACTLY the constants, returned by reference — byte-identical
 *    behavior to the pre-RC-5 constant-only world (tested with `toBe`).
 *  - Row present → PER-FIELD merge: a NULL column falls back to THAT field's
 *    constant; a non-NULL column replaces it wholesale. An explicit empty
 *    exclusion array `[]` is an override ("no exclusions"), distinct from NULL.
 *  - Within `kpiTargetPctByType`, the stored record merges PER TYPE KEY over the
 *    constant record and unknown keys are dropped, so the result is ALWAYS
 *    exhaustive over `AccessibilityType`. Rationale: the KPI aggregation derives
 *    its report buckets from the record's keys (kpi.ts) — a partial or polluted
 *    stored record must never silently drop or invent a report bucket.
 *
 * TODO-KPI posture carries over unchanged (AS-1): this module implements the
 * override MECHANISM only; whether any configured value is legally/contractually
 * correct is RC-0-T1's oracle, and the constants keep their TODO-KPI markers as
 * documented fallback defaults.
 */
import type { AccessibilityType, Prisma } from '@prisma/client'
import {
  T888_EXCLUDED_SPORT_IDS,
  ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE,
  ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS,
} from '../../config/accessibility.js'

/** The effective (merged) config every consumer reads — same shapes as the constants. */
export interface EffectiveAccessibilityConfig {
  t888ExcludedSportIds: ReadonlySet<number>
  kpiTargetPctByType: Readonly<Record<AccessibilityType, number | null>>
  unplannedLeadTimeDays: number
}

/**
 * ONE reader posture for the stored `kpiTargetPctByType` Json: keep only KNOWN
 * enum keys whose value is a number or null (anything else — unknown key, string,
 * object — is dropped, so direct-DB pollution can never corrupt the effective
 * config). Returns null when the stored value is not a record at all.
 */
function sanitizeKpiTargets(stored: unknown): Partial<Record<AccessibilityType, number | null>> | null {
  if (stored == null || typeof stored !== 'object' || Array.isArray(stored)) return null
  const sanitized: Partial<Record<AccessibilityType, number | null>> = {}
  for (const key of Object.keys(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE) as AccessibilityType[]) {
    if (!(key in stored)) continue
    const value = (stored as Record<string, unknown>)[key]
    if (typeof value === 'number' || value === null) sanitized[key] = value
  }
  return sanitized
}

/** Per-type-key merge of the sanitized stored record over the constant record. */
function mergeKpiTargets(stored: unknown): Readonly<Record<AccessibilityType, number | null>> {
  return { ...ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE, ...sanitizeKpiTargets(stored) }
}

/** The nullable row fields the merge reads — matches the Prisma row (extra fields ignored). */
export interface TenantAccessibilityConfigRow {
  t888ExcludedSportIds: unknown
  kpiTargetPctByType: unknown
  unplannedLeadTimeDays: number | null
}

/**
 * The stored OVERRIDE view (what the admin config surface reports next to the
 * effective values): the raw row fields, read through the SAME narrowing as the
 * merge path — null = "falls back to the constant"; null when there is no row.
 */
export interface AccessibilityConfigOverride {
  t888ExcludedSportIds: number[] | null
  kpiTargetPctByType: Partial<Record<AccessibilityType, number | null>> | null
  unplannedLeadTimeDays: number | null
}

export function overrideOf(row: TenantAccessibilityConfigRow | null): AccessibilityConfigOverride | null {
  if (row == null) return null
  return {
    t888ExcludedSportIds: Array.isArray(row.t888ExcludedSportIds)
      ? (row.t888ExcludedSportIds as number[]).map(Number)
      : null,
    kpiTargetPctByType: sanitizeKpiTargets(row.kpiTargetPctByType),
    unplannedLeadTimeDays: row.unplannedLeadTimeDays,
  }
}

/**
 * Pure transformation (row | null → effective config) — the ONE implementation of
 * the pinned semantics above; the loader and the config routes both go through it.
 */
export function toEffectiveAccessibilityConfig(
  row: TenantAccessibilityConfigRow | null,
): EffectiveAccessibilityConfig {
  // No row → the constants THEMSELVES (reference-equal — byte-identical fallback).
  if (row == null) {
    return {
      t888ExcludedSportIds: T888_EXCLUDED_SPORT_IDS,
      kpiTargetPctByType: ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE,
      unplannedLeadTimeDays: ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS,
    }
  }

  return {
    t888ExcludedSportIds: Array.isArray(row.t888ExcludedSportIds)
      ? new Set((row.t888ExcludedSportIds as number[]).map(Number))
      : T888_EXCLUDED_SPORT_IDS,
    kpiTargetPctByType:
      row.kpiTargetPctByType == null
        ? ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE
        : mergeKpiTargets(row.kpiTargetPctByType),
    unplannedLeadTimeDays: row.unplannedLeadTimeDays ?? ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS,
  }
}

export async function loadTenantAccessibilityConfig(
  tx: Pick<Prisma.TransactionClient, 'tenantAccessibilityConfig'>,
  tenantId: string,
): Promise<EffectiveAccessibilityConfig> {
  const row = await tx.tenantAccessibilityConfig.findUnique({ where: { tenantId } })
  return toEffectiveAccessibilityConfig(row)
}
