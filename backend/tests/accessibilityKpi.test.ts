/**
 * RC-2-T2 — pure KPI aggregation (no DB). Coverage % per deliverable type must
 * reconcile 1:1 with the raw rows it was computed from (every row lands in exactly
 * one type bucket; required/delivered counts equal independent raw filters).
 *
 * MECHANISM ONLY (AS-1): the target % is read from config
 * (ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE, provisional TODO-KPI) — tests assert the WIRING
 * (entry.targetPct === the config value), NEVER that any number is contractually
 * correct. Do not assert a literal 99 anywhere.
 */
import { describe, it, expect } from 'vitest'
import { aggregateAccessibilityKpi, type AccessibilityKpiRow } from '../src/services/accessibility/kpi.js'
import { ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE } from '../src/config/accessibility.js'
import type { AccessibilityStatus, AccessibilityType } from '@prisma/client'

const row = (type: AccessibilityType, status: AccessibilityStatus): AccessibilityKpiRow => ({ type, status })

/** Anonymised fixture: mixed statuses across all three types. */
const FIXTURE: AccessibilityKpiRow[] = [
  // T888: 5 rows — 1 NOT_REQUIRED, 4 required-track of which 2 DELIVERED
  row('T888', 'NOT_REQUIRED'),
  row('T888', 'REQUIRED'),
  row('T888', 'PLANNED'),
  row('T888', 'DELIVERED'),
  row('T888', 'DELIVERED'),
  // AUDIO_DESCRIPTION: 3 rows — 2 NOT_REQUIRED, 1 CONFIRMED (required, not delivered)
  row('AUDIO_DESCRIPTION', 'NOT_REQUIRED'),
  row('AUDIO_DESCRIPTION', 'NOT_REQUIRED'),
  row('AUDIO_DESCRIPTION', 'CONFIRMED'),
  // VGT: none required
  row('VGT', 'NOT_REQUIRED'),
]

describe('aggregateAccessibilityKpi — shape', () => {
  it('always returns exactly one entry per deliverable type, in stable order', () => {
    const entries = aggregateAccessibilityKpi([])
    expect(entries.map(e => e.type)).toEqual(['T888', 'AUDIO_DESCRIPTION', 'VGT'])
  })

  it('empty input → zero counts and null coverage everywhere', () => {
    for (const e of aggregateAccessibilityKpi([])) {
      expect(e.total).toBe(0)
      expect(e.requiredCount).toBe(0)
      expect(e.deliveredCount).toBe(0)
      expect(e.coveragePct).toBeNull()
    }
  })
})

describe('aggregateAccessibilityKpi — 1:1 reconciliation with raw rows', () => {
  const entries = aggregateAccessibilityKpi(FIXTURE)
  const byType = Object.fromEntries(entries.map(e => [e.type, e]))

  it('every raw row lands in exactly one bucket (totals sum to input length)', () => {
    expect(entries.reduce((n, e) => n + e.total, 0)).toBe(FIXTURE.length)
  })

  it('per-type counts equal independent raw-row filters', () => {
    for (const type of ['T888', 'AUDIO_DESCRIPTION', 'VGT'] as const) {
      const raw = FIXTURE.filter(r => r.type === type)
      expect(byType[type].total).toBe(raw.length)
      expect(byType[type].requiredCount).toBe(raw.filter(r => r.status !== 'NOT_REQUIRED').length)
      expect(byType[type].deliveredCount).toBe(raw.filter(r => r.status === 'DELIVERED').length)
    }
  })

  it('coveragePct = delivered / required * 100 (derived from the counts, not stored)', () => {
    // T888 fixture: 4 required, 2 delivered → 50
    expect(byType.T888.requiredCount).toBe(4)
    expect(byType.T888.deliveredCount).toBe(2)
    expect(byType.T888.coveragePct).toBe(50)
    // AD: 1 required, 0 delivered → 0
    expect(byType.AUDIO_DESCRIPTION.coveragePct).toBe(0)
  })

  it('required = 0 → coveragePct null (no divide-by-zero, never a fake 100%)', () => {
    expect(byType.VGT.requiredCount).toBe(0)
    expect(byType.VGT.coveragePct).toBeNull()
  })

  it('rounds coverage to 2 decimals (1/3 delivered)', () => {
    const entries3 = aggregateAccessibilityKpi([
      row('T888', 'DELIVERED'),
      row('T888', 'REQUIRED'),
      row('T888', 'REQUIRED'),
    ])
    expect(entries3.find(e => e.type === 'T888')?.coveragePct).toBe(33.33)
  })
})

describe('aggregateAccessibilityKpi — target is CONFIG-read (AS-1 mechanism, TODO-KPI value)', () => {
  it('default targets come from ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE (wiring, not a literal)', () => {
    for (const e of aggregateAccessibilityKpi(FIXTURE)) {
      expect(e.targetPct).toBe(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE[e.type])
    }
  })

  it('an injected target set overrides the config default (a config edit needs no code change)', () => {
    const entries = aggregateAccessibilityKpi(FIXTURE, { T888: 42, AUDIO_DESCRIPTION: 7, VGT: null })
    const byType = Object.fromEntries(entries.map(e => [e.type, e]))
    expect(byType.T888.targetPct).toBe(42)
    expect(byType.AUDIO_DESCRIPTION.targetPct).toBe(7)
    expect(byType.VGT.targetPct).toBeNull()
  })

  it('config defines a target entry for every deliverable type (mechanism completeness)', () => {
    expect(Object.keys(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE).sort()).toEqual(['AUDIO_DESCRIPTION', 'T888', 'VGT'])
  })
})
