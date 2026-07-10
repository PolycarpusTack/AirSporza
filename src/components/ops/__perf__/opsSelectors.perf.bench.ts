/**
 * E-1-T1 — the remaining pure-derivation SLOs (client-derivation portion of the
 * render SLOs + the interaction selectors).
 *   SLO #1 Schedule render < 1.5s p95 @ 500 events  → groupEventsByDay derivation
 *   SLO #4 Rights render  < 1s   p95 @ 100 contracts → deriveRightsMatrix/Tiles
 *   SLO #8 Sync render    < 1.5s p95 @ 50 jobs+100 cand → deriveJobCard×50 + deriveMergeCard×100
 *   SLO #9 Merge decision click → terminal status < 300ms (optimistic) → deriveMergeCard + decided-map set
 *
 * Plus the SYNC bare-array ceiling (useSyncData jobs+candidates): the record count
 * at which the sync render-derivation crosses its 1.5s budget.
 *
 * Run: npx vitest run --config vitest.perf.config.ts opsSelectors.perf
 */
import { expect, test } from 'vitest'
import { deriveRightsMatrix, deriveRightsTiles, groupEventsByDay } from '../selectors'
import { deriveJobCard, deriveMergeCard, pendingCandidateCount } from '../syncSelectors'
import type { Event } from '../../../data/types'
import type { ImportMergeCandidate } from '../../../services'
import { bench, keep, machineProfile, report } from './perfStats'
import {
  makeCandidateScale,
  makeContractScale,
  makeEventScale,
  makeJobScale,
  makeRegistryScale,
  PERF_NOW,
  PERF_WEEK,
} from './scaledFixtures'

test('PERF machine profile', () => {
  machineProfile()
  expect(true).toBe(true)
})

test('E-1-T1 SLO#1 — groupEventsByDay @500 (schedule initial-render derivation)', () => {
  const events = makeEventScale(500)
  const stat = bench('#1 groupEventsByDay @500', () => groupEventsByDay(events, PERF_WEEK), { runs: 500, warmup: 50, batch: 5 })
  report(stat)
  expect(stat.p95).toBeLessThan(1500) // SLO #1 budget (derivation portion only)
})

test('E-1-T1 SLO#4 — deriveRightsMatrix + deriveRightsTiles @100 contracts (rights render derivation)', () => {
  const contracts = makeContractScale(100)
  const { competitions } = makeRegistryScale(1) // 200 competitions
  const events = makeEventScale(500)
  const matrixStat = bench('#4 deriveRightsMatrix @100c/200comp/500ev', () => deriveRightsMatrix(contracts, competitions, events, PERF_NOW), { runs: 300, warmup: 30 })
  const tilesStat = bench('#4 deriveRightsTiles @100c', () => deriveRightsTiles(contracts, competitions, events, PERF_NOW), { runs: 300, warmup: 30 })
  report(matrixStat)
  report(tilesStat)
  // The screen renders the matrix once (tiles is a fold over the same matrix — the
  // screen memoizes; measured separately here to show the fold is cheap).
  expect(matrixStat.p95).toBeLessThan(1000) // SLO #4 budget
})

test('E-1-T1 SLO#8 — sync render derivation: deriveJobCard×50 + deriveMergeCard×100', () => {
  const jobs = makeJobScale(50)
  const candidates = makeCandidateScale(100)
  const { sports, competitions } = makeRegistryScale(1)
  const events = makeEventScale(500)
  const eventById = new Map<string, Event>(events.map((e) => [String(e.id), e]))

  const renderDerive = (): number => {
    const jobCards = jobs.map(deriveJobCard)
    const mergeCards = candidates.map((c) =>
      deriveMergeCard(c, c.suggestedEntityId ? eventById.get(c.suggestedEntityId) ?? null : null, sports, competitions),
    )
    return jobCards.length + mergeCards.length + pendingCandidateCount(candidates)
  }

  const stat = bench('#8 sync render derive (50 jobs + 100 cand, sports/comp .find)', renderDerive, { runs: 300, warmup: 30 })
  report(stat)
  expect(stat.p95).toBeLessThan(1500) // SLO #8 budget (derivation portion only)
})

test('E-1-T1 SLO#9 — merge decision: deriveMergeCard (resolved diff) + decided-map set', () => {
  const candidates = makeCandidateScale(100)
  const { sports, competitions } = makeRegistryScale(1)
  const events = makeEventScale(500)
  const eventById = new Map<string, Event>(events.map((e) => [String(e.id), e]))
  // A resolved-current candidate → the heavier deriveMergeDiff branch runs.
  const candidate = candidates.find((c) => c.suggestedEntityId)!
  const currentEvent = eventById.get(candidate.suggestedEntityId!) ?? null

  const decided = new Map<string, ImportMergeCandidate['status']>()
  const decisionClick = (): number => {
    // The optimistic client work on a decision: re-derive the card + flip the local map.
    const card = deriveMergeCard(candidate, currentEvent, sports, competitions)
    decided.set(candidate.id, 'approved_merge')
    return card.diffRows.length + decided.size
  }
  const stat = bench('#9 merge decision optimistic (deriveMergeCard + decided.set)', decisionClick, { runs: 500, warmup: 50, batch: 20 })
  report(stat)
  expect(stat.p95).toBeLessThan(300) // SLO #9 budget (optimistic, excl. server)
})

test('E-1-T1 bare-array CEILING — sync render-derivation vs candidate count (#8 1500ms budget)', () => {
  const { sports, competitions } = makeRegistryScale(1)
  const events = makeEventScale(500)
  const eventById = new Map<string, Event>(events.map((e) => [String(e.id), e]))
  // Candidates scale; each resolved candidate runs sports.find (20) + competitions.find (200)
  // inside deriveMergeDiff → an O(candidates × competitions) shape worth pinning.
  const counts = [100, 500, 1000, 5000, 10000, 20000]
  // eslint-disable-next-line no-console
  console.log('PERF-CEILING #8 (sync render derivation, 1500ms budget):')
  let breachAt = Infinity
  for (const n of counts) {
    const candidates = makeCandidateScale(n)
    const jobs = makeJobScale(50)
    const stat = bench(`#8 @${n}cand`, () => {
      jobs.map(deriveJobCard)
      return candidates.map((c) => deriveMergeCard(c, c.suggestedEntityId ? eventById.get(c.suggestedEntityId) ?? null : null, sports, competitions)).length
    }, { runs: 40, warmup: 5 })
    // eslint-disable-next-line no-console
    console.log(`PERF-CEILING candidates=${n} render_p95=${stat.p95.toFixed(4)}ms`)
    if (stat.p95 >= 1500 && breachAt === Infinity) breachAt = n
    keep(stat.p95)
  }
  // eslint-disable-next-line no-console
  console.log(`PERF-CEILING #8 first candidate count with render_p95 >= 1500ms: ${breachAt === Infinity ? 'NONE within tested range (<=20k)' : breachAt}`)
  expect(true).toBe(true)
})
