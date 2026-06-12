/**
 * Unit tests for the FieldVisibilityFilter (B-1, TD-6).
 * Contract: docs/governance/contracts/field-visibility-filter.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  filterFieldDefs,
  restrictedFieldIds,
  stripRestrictedValues,
  stripRestrictedCrew,
  isFieldVisibilityEnforced,
} from '../src/services/fieldVisibility.js'
import { logger } from '../src/utils/logger.js'

type Def = { id: string; name: string; visibleByRoles: string[] }

const open: Def = { id: 'venue_info', name: 'venue_info', visibleByRoles: [] }
const adminOnly: Def = { id: 'budget_code', name: 'budget_code', visibleByRoles: ['admin'] }
const sportsAndAdmin: Def = { id: 'scout_notes', name: 'scout_notes', visibleByRoles: ['sports', 'admin'] }
const corrupt: Def = { id: 'ghost_field', name: 'ghost_field', visibleByRoles: ['superuser'] }

beforeEach(() => vi.clearAllMocks())
afterEach(() => { delete process.env.FIELD_VISIBILITY_ENFORCEMENT })

describe('isFieldVisibilityEnforced', () => {
  it('defaults to off', () => {
    expect(isFieldVisibilityEnforced()).toBe(false)
  })
  it('is on only when env var is the string "true"', () => {
    process.env.FIELD_VISIBILITY_ENFORCEMENT = 'true'
    expect(isFieldVisibilityEnforced()).toBe(true)
    process.env.FIELD_VISIBILITY_ENFORCEMENT = '1'
    expect(isFieldVisibilityEnforced()).toBe(false)
  })
})

describe('filterFieldDefs', () => {
  it('empty visibleByRoles means visible to every role', () => {
    for (const role of ['planner', 'sports', 'contracts', 'admin'] as const) {
      expect(filterFieldDefs([open], role)).toEqual([open])
    }
  })

  it('admin-only field is hidden from sports/planner/contracts', () => {
    for (const role of ['planner', 'sports', 'contracts'] as const) {
      expect(filterFieldDefs([adminOnly], role)).toEqual([])
    }
  })

  it('admin always sees everything, even corrupt defs', () => {
    expect(filterFieldDefs([open, adminOnly, sportsAndAdmin, corrupt], 'admin'))
      .toEqual([open, adminOnly, sportsAndAdmin, corrupt])
  })

  it('role listed in visibleByRoles sees the field', () => {
    expect(filterFieldDefs([sportsAndAdmin], 'sports')).toEqual([sportsAndAdmin])
    expect(filterFieldDefs([sportsAndAdmin], 'planner')).toEqual([])
  })

  it('fail-closed: unknown role entries are dropped with a warning; a non-empty list reduced to empty restricts the field', () => {
    expect(filterFieldDefs([corrupt], 'planner')).toEqual([])
    expect(logger.warn).toHaveBeenCalled()
  })

  it('unknown entry mixed with a valid one keeps the valid grant', () => {
    const mixed: Def = { id: 'm', name: 'm', visibleByRoles: ['superuser', 'sports'] }
    expect(filterFieldDefs([mixed], 'sports')).toEqual([mixed])
    expect(filterFieldDefs([mixed], 'planner')).toEqual([])
  })
})

describe('restrictedFieldIds', () => {
  it('is the complement of filterFieldDefs', () => {
    const defs = [open, adminOnly, sportsAndAdmin, corrupt]
    expect(restrictedFieldIds(defs, 'planner')).toEqual(new Set(['budget_code', 'scout_notes', 'ghost_field']))
    expect(restrictedFieldIds(defs, 'sports')).toEqual(new Set(['budget_code', 'ghost_field']))
    expect(restrictedFieldIds(defs, 'admin')).toEqual(new Set())
  })
})

describe('stripRestrictedValues', () => {
  const restricted = new Set(['budget_code'])
  const event = {
    id: 1,
    participants: 'A vs B',
    customFields: { budget_code: 'X-99', venue_info: 'Hall 3' },
    customValues: [
      { fieldId: 'budget_code', fieldValue: 'X-99' },
      { fieldId: 'venue_info', fieldValue: 'Hall 3' },
    ],
  }

  it('removes restricted customValues rows and customFields keys', () => {
    const [out] = stripRestrictedValues([event], restricted)
    expect(out.customValues).toEqual([{ fieldId: 'venue_info', fieldValue: 'Hall 3' }])
    expect(out.customFields).toEqual({ venue_info: 'Hall 3' })
    expect(out.participants).toBe('A vs B')
  })

  it('does not mutate the input', () => {
    stripRestrictedValues([event], restricted)
    expect(event.customFields.budget_code).toBe('X-99')
    expect(event.customValues).toHaveLength(2)
  })

  it('no-ops with an empty restricted set', () => {
    const [out] = stripRestrictedValues([event], new Set<string>())
    expect(out).toEqual(event)
  })

  it('tolerates items without customFields/customValues', () => {
    const [out] = stripRestrictedValues([{ id: 2 }], restricted)
    expect(out).toEqual({ id: 2 })
  })
})

describe('stripRestrictedCrew', () => {
  it('removes restricted crew keys without mutating', () => {
    const plan = { id: 1, crew: { director: 'Jane', budget_code: 'X-99' } }
    const [out] = stripRestrictedCrew([plan], new Set(['budget_code']))
    expect(out.crew).toEqual({ director: 'Jane' })
    expect(plan.crew.budget_code).toBe('X-99')
  })

  it('tolerates plans without crew', () => {
    const [out] = stripRestrictedCrew([{ id: 2 } as { id: number; crew?: Record<string, unknown> }], new Set(['x']))
    expect(out).toEqual({ id: 2 })
  })
})
