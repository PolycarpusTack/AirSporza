/**
 * RC-2-T1 — pure accessibility defaulting MECHANISM (no DB).
 * Asserts the MECHANISM, not legal correctness: T888 → REQUIRED unless the event's
 * sport is in the (injected) exclusion set → NOT_REQUIRED; AUDIO_DESCRIPTION + VGT
 * → NOT_REQUIRED. The authoritative exclusion set is a config edit (RC-0-T1, AS-1).
 */
import { describe, it, expect } from 'vitest'
import { buildDefaultAccessibilityDeliverables } from '../src/config/accessibility.js'

const statusByType = (rows: ReturnType<typeof buildDefaultAccessibilityDeliverables>) =>
  Object.fromEntries(rows.map(r => [r.type, r.status]))

describe('buildDefaultAccessibilityDeliverables', () => {
  it('sport NOT excluded → T888 REQUIRED, AD + VGT NOT_REQUIRED', () => {
    expect(statusByType(buildDefaultAccessibilityDeliverables({ sportId: 1 }, new Set()))).toEqual({
      T888: 'REQUIRED',
      AUDIO_DESCRIPTION: 'NOT_REQUIRED',
      VGT: 'NOT_REQUIRED',
    })
  })

  it('sport IN the exclusion set → T888 NOT_REQUIRED (AD + VGT still NOT_REQUIRED)', () => {
    const statuses = statusByType(buildDefaultAccessibilityDeliverables({ sportId: 7 }, new Set([7])))
    expect(statuses.T888).toBe('NOT_REQUIRED')
    expect(statuses.AUDIO_DESCRIPTION).toBe('NOT_REQUIRED')
    expect(statuses.VGT).toBe('NOT_REQUIRED')
  })

  it('another sport in a multi-sport exclusion set is unaffected', () => {
    // sport 3 excluded, sport 1 not → 1 stays REQUIRED
    expect(statusByType(buildDefaultAccessibilityDeliverables({ sportId: 1 }, new Set([3, 5]))).T888).toBe('REQUIRED')
  })

  it('always returns exactly the three deliverable types', () => {
    const rows = buildDefaultAccessibilityDeliverables({ sportId: 1 }, new Set())
    expect(rows.map(r => r.type).sort()).toEqual(['AUDIO_DESCRIPTION', 'T888', 'VGT'])
  })

  it('uses the provisional default set (empty → all sports REQUIRED) when none injected', () => {
    // TODO-KPI provisional default = empty exclusion set = safe/inclusive (REQUIRED).
    expect(statusByType(buildDefaultAccessibilityDeliverables({ sportId: 999 })).T888).toBe('REQUIRED')
  })
})
