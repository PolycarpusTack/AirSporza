import { describe, it, expect } from 'vitest'
import { canTransition, TRANSITIONS } from '../src/services/eventTransitions.js'

describe('canTransition', () => {
  it('planner can move draft → ready', () => {
    expect(canTransition('draft', 'ready', 'planner')).toBe(true)
  })
  it('planner cannot move ready → approved', () => {
    expect(canTransition('ready', 'approved', 'planner')).toBe(false)
  })
  it('admin can move ready → approved', () => {
    expect(canTransition('ready', 'approved', 'admin')).toBe(true)
  })
  it('sports can move published → live', () => {
    expect(canTransition('published', 'live', 'sports')).toBe(true)
  })
  it('contracts role cannot make any transition', () => {
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      for (const { to } of targets) {
        expect(canTransition(from as never, to, 'contracts')).toBe(false)
      }
    }
  })
  it('same-status transition is always false', () => {
    expect(canTransition('draft', 'draft', 'admin')).toBe(false)
  })
})
