/**
 * RC-5-T1 — loadTenantAccessibilityConfig merge/fallback MECHANICS (pure-ish: the
 * tx is a fake — no DB, no HTTP). Asserts the fallback + override MECHANISM only,
 * never that any value is legally correct (RC-2 TODO-KPI posture, AS-1).
 *
 * PINNED MERGE SEMANTICS (decided here, RC-5-T1):
 *  - No row → EXACTLY the global constants (same object references — byte-identical).
 *  - Row present → PER-FIELD merge: a NULL field falls back to THAT field's constant;
 *    a non-NULL field replaces it. An explicit empty exclusion array `[]` is an
 *    OVERRIDE (no exclusions), distinct from NULL (fall back).
 *  - Within `kpiTargetPctByType`, merge is PER-TYPE-KEY over the constant record so
 *    the result stays exhaustive over the AccessibilityType enum (the KPI aggregation
 *    derives its buckets from the record's keys — a partial stored record must never
 *    silently drop a report bucket). Unknown stored keys are dropped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadTenantAccessibilityConfig } from '../src/services/accessibility/tenantConfig.js'
import {
  T888_EXCLUDED_SPORT_IDS,
  ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE,
  ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS,
} from '../src/config/accessibility.js'

const TENANT = '00000000-0000-0000-0000-0000000000aa'
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000bb'

const findUnique = vi.fn()
const tx = { tenantAccessibilityConfig: { findUnique } } as unknown as Parameters<
  typeof loadTenantAccessibilityConfig
>[0]

/** A full DB row as prisma returns it (Json fields already parsed; null = SQL NULL). */
function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    tenantId: TENANT,
    t888ExcludedSportIds: null,
    kpiTargetPctByType: null,
    unplannedLeadTimeDays: null,
    updatedBy: null,
    createdAt: new Date('2026-07-23T00:00:00.000Z'),
    updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    ...overrides,
  }
}

beforeEach(() => {
  findUnique.mockReset()
})

describe('RC-5-T1 loadTenantAccessibilityConfig — fallback (no row)', () => {
  it('no row → EXACTLY the constants (same references — byte-identical behavior)', async () => {
    findUnique.mockResolvedValue(null)
    const cfg = await loadTenantAccessibilityConfig(tx, TENANT)
    expect(cfg.t888ExcludedSportIds).toBe(T888_EXCLUDED_SPORT_IDS)
    expect(cfg.kpiTargetPctByType).toBe(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE)
    expect(cfg.unplannedLeadTimeDays).toBe(ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS)
  })

  it('queries by the GIVEN tenantId only (tenant identifier comes from the caller’s auth/owning row — never widened)', async () => {
    findUnique.mockResolvedValue(null)
    await loadTenantAccessibilityConfig(tx, TENANT)
    expect(findUnique).toHaveBeenCalledTimes(1)
    expect(findUnique.mock.calls[0][0]).toEqual({ where: { tenantId: TENANT } })

    findUnique.mockClear()
    await loadTenantAccessibilityConfig(tx, OTHER_TENANT)
    expect(findUnique.mock.calls[0][0]).toEqual({ where: { tenantId: OTHER_TENANT } })
  })
})

describe('RC-5-T1 loadTenantAccessibilityConfig — per-field merge (pinned semantics)', () => {
  it('a row with ALL fields NULL behaves like no row (every field falls back)', async () => {
    findUnique.mockResolvedValue(row())
    const cfg = await loadTenantAccessibilityConfig(tx, TENANT)
    expect(cfg.t888ExcludedSportIds).toBe(T888_EXCLUDED_SPORT_IDS)
    expect(cfg.kpiTargetPctByType).toEqual(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE)
    expect(cfg.unplannedLeadTimeDays).toBe(ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS)
  })

  it('a fully-populated row overrides all three fields', async () => {
    findUnique.mockResolvedValue(
      row({
        t888ExcludedSportIds: [7, 9],
        kpiTargetPctByType: { T888: 90, AUDIO_DESCRIPTION: 10, VGT: 5 },
        unplannedLeadTimeDays: 30,
      }),
    )
    const cfg = await loadTenantAccessibilityConfig(tx, TENANT)
    expect([...cfg.t888ExcludedSportIds].sort()).toEqual([7, 9])
    expect(cfg.kpiTargetPctByType).toEqual({ T888: 90, AUDIO_DESCRIPTION: 10, VGT: 5 })
    expect(cfg.unplannedLeadTimeDays).toBe(30)
  })

  it('a PARTIAL row merges per field: the set field overrides, NULL fields keep their constants', async () => {
    findUnique.mockResolvedValue(row({ unplannedLeadTimeDays: 3 }))
    const cfg = await loadTenantAccessibilityConfig(tx, TENANT)
    expect(cfg.unplannedLeadTimeDays).toBe(3)
    expect(cfg.t888ExcludedSportIds).toBe(T888_EXCLUDED_SPORT_IDS)
    expect(cfg.kpiTargetPctByType).toEqual(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE)
  })

  it('an explicit EMPTY exclusion array is an override (no exclusions), not a fallback', async () => {
    findUnique.mockResolvedValue(row({ t888ExcludedSportIds: [] }))
    const cfg = await loadTenantAccessibilityConfig(tx, TENANT)
    expect(cfg.t888ExcludedSportIds.size).toBe(0)
    // It is a NEW set derived from the row, not the shared constant instance:
    expect(cfg.t888ExcludedSportIds).not.toBe(T888_EXCLUDED_SPORT_IDS)
  })

  it('kpiTargetPctByType merges PER TYPE KEY over the constants — a partial record stays enum-exhaustive', async () => {
    findUnique.mockResolvedValue(row({ kpiTargetPctByType: { T888: 95 } }))
    const cfg = await loadTenantAccessibilityConfig(tx, TENANT)
    expect(cfg.kpiTargetPctByType).toEqual({
      ...ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE,
      T888: 95,
    })
    // Exhaustiveness pin: every enum key present (the KPI buckets derive from these keys).
    expect(Object.keys(cfg.kpiTargetPctByType).sort()).toEqual(
      Object.keys(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE).sort(),
    )
  })

  it('a tenant can null a target per key (explicit null overrides a constant number)', async () => {
    findUnique.mockResolvedValue(row({ kpiTargetPctByType: { T888: null } }))
    const cfg = await loadTenantAccessibilityConfig(tx, TENANT)
    expect(cfg.kpiTargetPctByType.T888).toBeNull()
  })

  it('unknown stored kpi keys are DROPPED (buckets stay pinned to the enum — defense against bad rows)', async () => {
    findUnique.mockResolvedValue(row({ kpiTargetPctByType: { T888: 90, BOGUS_TYPE: 50 } }))
    const cfg = await loadTenantAccessibilityConfig(tx, TENANT)
    expect(Object.keys(cfg.kpiTargetPctByType).sort()).toEqual(
      Object.keys(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE).sort(),
    )
    expect((cfg.kpiTargetPctByType as Record<string, unknown>).BOGUS_TYPE).toBeUndefined()
  })

  it('a NON-NUMERIC stored kpi value is DROPPED — that key keeps its constant (direct-DB pollution guard)', async () => {
    findUnique.mockResolvedValue(row({ kpiTargetPctByType: { T888: 'oops', AUDIO_DESCRIPTION: 42 } }))
    const cfg = await loadTenantAccessibilityConfig(tx, TENANT)
    expect(cfg.kpiTargetPctByType.T888).toBe(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE.T888)
    expect(cfg.kpiTargetPctByType.AUDIO_DESCRIPTION).toBe(42) // valid sibling still overrides
  })
})
