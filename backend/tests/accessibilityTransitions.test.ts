/**
 * RC-2-T2 — pure accessibility status state machine (no DB, no HTTP).
 * Full permutation matrix: the ONLY legal steps are
 *   NOT_REQUIRED → REQUIRED            (requirement toggle)
 *   REQUIRED     → NOT_REQUIRED        (requirement toggle)
 *   REQUIRED     → PLANNED
 *   PLANNED      → CONFIRMED
 *   CONFIRMED    → DELIVERED
 * Everything else (self, skip, backward) is rejected, and the machine names the
 * allowed next statuses so the route can return them in a 409 body.
 */
import { describe, it, expect } from 'vitest'
import {
  allowedNextStatuses,
  canTransitionAccessibility,
  isRequirementToggle,
  resolveRequirementChange,
} from '../src/services/accessibility/transitions.js'
import type { AccessibilityStatus } from '@prisma/client'

const ALL: AccessibilityStatus[] = ['NOT_REQUIRED', 'REQUIRED', 'PLANNED', 'CONFIRMED', 'DELIVERED']

const LEGAL: ReadonlyArray<[AccessibilityStatus, AccessibilityStatus]> = [
  ['NOT_REQUIRED', 'REQUIRED'],
  ['REQUIRED', 'NOT_REQUIRED'],
  ['REQUIRED', 'PLANNED'],
  ['PLANNED', 'CONFIRMED'],
  ['CONFIRMED', 'DELIVERED'],
]

describe('canTransitionAccessibility — full 5x5 permutation matrix', () => {
  for (const from of ALL) {
    for (const to of ALL) {
      const legal = LEGAL.some(([f, t]) => f === from && t === to)
      it(`${from} → ${to} is ${legal ? 'ALLOWED' : 'REJECTED'}`, () => {
        expect(canTransitionAccessibility(from, to)).toBe(legal)
      })
    }
  }
})

describe('allowedNextStatuses — the 409 body payload', () => {
  it('NOT_REQUIRED → [REQUIRED]', () => {
    expect(allowedNextStatuses('NOT_REQUIRED')).toEqual(['REQUIRED'])
  })
  it('REQUIRED → [NOT_REQUIRED, PLANNED]', () => {
    expect(allowedNextStatuses('REQUIRED')).toEqual(['NOT_REQUIRED', 'PLANNED'])
  })
  it('PLANNED → [CONFIRMED]', () => {
    expect(allowedNextStatuses('PLANNED')).toEqual(['CONFIRMED'])
  })
  it('CONFIRMED → [DELIVERED]', () => {
    expect(allowedNextStatuses('CONFIRMED')).toEqual(['DELIVERED'])
  })
  it('DELIVERED is terminal → []', () => {
    expect(allowedNextStatuses('DELIVERED')).toEqual([])
  })
  // (No table-mirror test: allowedNextStatuses returns ACCESSIBILITY_TRANSITIONS[from]
  // verbatim, so mirroring it here would be tautological — the hardcoded per-status
  // expectations above are the independent oracle.)
})

describe('isRequirementToggle — the setRequirement-vs-lifecycle split', () => {
  it('flags any step into or out of NOT_REQUIRED', () => {
    expect(isRequirementToggle('NOT_REQUIRED', 'REQUIRED')).toBe(true)
    expect(isRequirementToggle('REQUIRED', 'NOT_REQUIRED')).toBe(true)
  })
  it('does NOT flag lifecycle steps', () => {
    expect(isRequirementToggle('REQUIRED', 'PLANNED')).toBe(false)
    expect(isRequirementToggle('PLANNED', 'CONFIRMED')).toBe(false)
    expect(isRequirementToggle('CONFIRMED', 'DELIVERED')).toBe(false)
  })
})

describe('resolveRequirementChange — full setRequirement semantics (pure)', () => {
  it('T888 is locked regardless of current status or direction', () => {
    expect(resolveRequirementChange('T888', 'REQUIRED', false)).toEqual({ kind: 't888-locked' })
    expect(resolveRequirementChange('T888', null, true)).toEqual({ kind: 't888-locked' })
  })
  it('no row (legacy event) → create at the requested requirement', () => {
    expect(resolveRequirementChange('AUDIO_DESCRIPTION', null, true)).toEqual({ kind: 'create', status: 'REQUIRED' })
    expect(resolveRequirementChange('VGT', null, false)).toEqual({ kind: 'create', status: 'NOT_REQUIRED' })
  })
  it('already at the target → noop', () => {
    expect(resolveRequirementChange('VGT', 'REQUIRED', true)).toEqual({ kind: 'noop' })
    expect(resolveRequirementChange('VGT', 'NOT_REQUIRED', false)).toEqual({ kind: 'noop' })
  })
  it('required=true past REQUIRED → noop (lifecycle position is not reset)', () => {
    expect(resolveRequirementChange('AUDIO_DESCRIPTION', 'PLANNED', true)).toEqual({ kind: 'noop' })
    expect(resolveRequirementChange('AUDIO_DESCRIPTION', 'DELIVERED', true)).toEqual({ kind: 'noop' })
  })
  it('un-requiring in-flight work → illegal', () => {
    expect(resolveRequirementChange('AUDIO_DESCRIPTION', 'PLANNED', false)).toEqual({ kind: 'illegal' })
    expect(resolveRequirementChange('VGT', 'DELIVERED', false)).toEqual({ kind: 'illegal' })
  })
  it('legal toggle → update with the target status', () => {
    expect(resolveRequirementChange('AUDIO_DESCRIPTION', 'NOT_REQUIRED', true)).toEqual({ kind: 'update', status: 'REQUIRED' })
    expect(resolveRequirementChange('AUDIO_DESCRIPTION', 'REQUIRED', false)).toEqual({ kind: 'update', status: 'NOT_REQUIRED' })
  })
})
