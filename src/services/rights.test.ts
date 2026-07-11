/**
 * RD-4-T2 — deriveSlotRightsStatus severity rollup (pure domain selector).
 * Precedence: any ERROR → VIOLATION; else any WARNING → WARNING; else CLEAR.
 */
import { describe, it, expect } from 'vitest'
import { deriveSlotRightsStatus } from './rights'
import type { RightsValidationResult } from './rights'

const r = (severity: RightsValidationResult['severity'], code = 'X'): RightsValidationResult => ({
  code, severity, scope: ['rights'], message: code,
})

describe('deriveSlotRightsStatus', () => {
  it('empty → CLEAR', () => {
    expect(deriveSlotRightsStatus([])).toBe('CLEAR')
  })

  it('INFO-only → CLEAR', () => {
    expect(deriveSlotRightsStatus([r('INFO', 'SLOT_NO_EVENT'), r('INFO')])).toBe('CLEAR')
  })

  it('any WARNING (no ERROR) → WARNING', () => {
    expect(deriveSlotRightsStatus([r('INFO'), r('WARNING')])).toBe('WARNING')
  })

  it('any ERROR → VIOLATION (dominates WARNING and INFO)', () => {
    expect(deriveSlotRightsStatus([r('WARNING'), r('INFO'), r('ERROR')])).toBe('VIOLATION')
  })

  it('ERROR precedence holds regardless of order', () => {
    expect(deriveSlotRightsStatus([r('ERROR'), r('WARNING')])).toBe('VIOLATION')
  })

  it('single WARNING → WARNING', () => {
    expect(deriveSlotRightsStatus([r('WARNING')])).toBe('WARNING')
  })
})
