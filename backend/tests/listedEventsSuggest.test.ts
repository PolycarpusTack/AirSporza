/**
 * RC-1-T2 — pure listed-event suggestion heuristic. No DB.
 * Rule: sportId match is NECESSARY; among sport matches, rank by token overlap of
 * the event's competition name vs the category name (desc, ties by id asc). A sport
 * match with zero overlap is STILL suggested (sport is the necessary signal), ranked last.
 */
import { describe, it, expect } from 'vitest'
import { suggestListedCategories } from '../src/services/listedEvents/suggest.js'
import type { ListedEventCategory } from '@prisma/client'

let seq = 0
function cat(over: Partial<ListedEventCategory> = {}): ListedEventCategory {
  seq += 1
  return {
    id: seq, tenantId: 't', name: 'Category', sportId: 1, fullLiveRequired: true,
    besluitRef: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  } as ListedEventCategory
}
const ids = (cs: ListedEventCategory[]) => cs.map(c => c.id)

describe('suggestListedCategories', () => {
  it('different sport → NOT suggested', () => {
    const out = suggestListedCategories({ sportId: 1, competitionName: 'FIFA World Cup' }, [cat({ id: 1, sportId: 2, name: 'FIFA World Cup final' })])
    expect(out).toEqual([])
  })

  it('sport match + name overlap → suggested', () => {
    const c = cat({ id: 1, sportId: 1, name: 'FIFA World Cup — final phase' })
    const out = suggestListedCategories({ sportId: 1, competitionName: 'FIFA World Cup 2026' }, [c])
    expect(ids(out)).toEqual([1])
  })

  it('sport match + NO name overlap → still suggested (sport is the necessary signal)', () => {
    const c = cat({ id: 1, sportId: 1, name: 'Belgian Cup football final' })
    const out = suggestListedCategories({ sportId: 1, competitionName: 'Jupiler Pro League' }, [c])
    expect(ids(out)).toEqual([1])
  })

  it('multiple sport matches → ranked by name overlap (best first)', () => {
    const strong = cat({ id: 10, sportId: 1, name: 'FIFA World Cup final phase' }) // overlap 3
    const weak = cat({ id: 11, sportId: 1, name: 'Belgian Cup final' })            // overlap 0
    const mid = cat({ id: 12, sportId: 1, name: 'World Cup qualifiers' })          // overlap 2
    const out = suggestListedCategories({ sportId: 1, competitionName: 'FIFA World Cup' }, [weak, mid, strong])
    expect(ids(out)).toEqual([10, 12, 11])
  })

  it('ties broken by category id ascending (deterministic)', () => {
    const a = cat({ id: 20, sportId: 1, name: 'World Cup A' })
    const b = cat({ id: 21, sportId: 1, name: 'World Cup B' })
    const out = suggestListedCategories({ sportId: 1, competitionName: 'World Cup' }, [b, a])
    expect(ids(out)).toEqual([20, 21])
  })

  it('filters foreign-sport rows out of a mixed list', () => {
    const match = cat({ id: 30, sportId: 1, name: 'Tour de France' })
    const other = cat({ id: 31, sportId: 3, name: 'Tour de France' })
    const out = suggestListedCategories({ sportId: 1, competitionName: 'Tour de France' }, [other, match])
    expect(ids(out)).toEqual([30])
  })

  it('no categories → empty', () => {
    expect(suggestListedCategories({ sportId: 1, competitionName: 'X' }, [])).toEqual([])
  })

  it('missing competition name → sport matches still returned (overlap 0)', () => {
    const c = cat({ id: 40, sportId: 1, name: 'FIFA World Cup' })
    expect(ids(suggestListedCategories({ sportId: 1, competitionName: null }, [c]))).toEqual([40])
  })
})
