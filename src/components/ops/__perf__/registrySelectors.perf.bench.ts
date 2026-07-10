/**
 * E-1-T0 — prove the rig on the HARDEST SLO FIRST: Registry @2,000 records.
 * SLO #5 Registry initial render < 1.5s p95 @ 2,000 (client-derivation portion)
 * SLO #6 Registry search keystroke → filtered table < 50ms p95 @ 2,000
 * SLO #7 Registry inspector hop → update < 100ms p95
 *
 * These are the network-free ALGORITHMIC ceiling — buildRegistryIndex +
 * projectRegistryRows are the exact functions the C-2/C-3 screen runs per data
 * change / per keystroke. The bare-array concern every A–D retro flagged is a
 * client-side O(rows) filter over an unbounded list; the ceiling sweep below pins
 * the record count at which #6 crosses its 50ms budget.
 *
 * Run: npx vitest run --config vitest.perf.config.ts registrySelectors.perf
 */
import { expect, test } from 'vitest'
import { buildRegistryIndex, linkedRecordsOf, makeRecordId, projectRegistryRows } from '../registrySelectors'
import { bench, keep, machineProfile, report } from './perfStats'
import { makeRegistryScale } from './scaledFixtures'

test('PERF machine profile', () => {
  machineProfile()
  expect(true).toBe(true)
})

test('E-1-T0 SLO#5 — buildRegistryIndex @2000 (initial-render derivation)', () => {
  const { sports, competitions, teams, players, total } = makeRegistryScale(1)
  expect(total).toBe(2000)
  const stat = bench('#5 buildRegistryIndex @2000', () => buildRegistryIndex(sports, competitions, teams, players), {
    runs: 300,
    warmup: 30,
  })
  report(stat)
  expect(stat.p95).toBeLessThan(1500) // SLO #5 budget (derivation portion only)
})

test('E-1-T0 SLO#6 — projectRegistryRows keystroke @2000 (search over the index)', () => {
  const { sports, competitions, teams, players } = makeRegistryScale(1)
  const index = buildRegistryIndex(sports, competitions, teams, players)

  // Worst realistic keystroke: a non-empty query forces the full O(rows) filter
  // (empty query short-circuits to the base by reference — not a keystroke cost).
  // Three query shapes: matches-many (common substring), matches-some, matches-none.
  const many = bench('#6 projectRegistryRows q="team" @2000 (matches ~many)', () => projectRegistryRows(index, { query: 'team' }), { runs: 500, warmup: 50 })
  const some = bench('#6 projectRegistryRows q="player 4" @2000', () => projectRegistryRows(index, { query: 'player 4' }), { runs: 500, warmup: 50 })
  const none = bench('#6 projectRegistryRows q="zzzz-no-match" @2000', () => projectRegistryRows(index, { query: 'zzzz-no-match' }), { runs: 500, warmup: 50 })
  const facetPlayer = bench('#6 projectRegistryRows facet=player+q @2000', () => projectRegistryRows(index, { facet: 'player', query: 'fixtura' }), { runs: 500, warmup: 50 })
  report(many)
  report(some)
  report(none)
  report(facetPlayer)

  expect(many.p95).toBeLessThan(50) // SLO #6 budget
  expect(some.p95).toBeLessThan(50)
  expect(none.p95).toBeLessThan(50)
})

test('E-1-T0 stability — rerun projectRegistryRows p95 twice (variance check)', () => {
  const { sports, competitions, teams, players } = makeRegistryScale(1)
  const index = buildRegistryIndex(sports, competitions, teams, players)
  const runA = bench('#6 stability run A', () => projectRegistryRows(index, { query: 'united' }), { runs: 500, warmup: 50 })
  const runB = bench('#6 stability run B', () => projectRegistryRows(index, { query: 'united' }), { runs: 500, warmup: 50 })
  report(runA)
  report(runB)
  // Honest variance line: both p95s printed; assert they are the same order of magnitude.
  const ratio = Math.max(runA.p95, runB.p95) / Math.max(1e-6, Math.min(runA.p95, runB.p95))
  // eslint-disable-next-line no-console
  console.log(`PERF #6 stability p95 ratio A/B = ${ratio.toFixed(2)}x (A=${runA.p95.toFixed(4)}ms B=${runB.p95.toFixed(4)}ms)`)
  expect(ratio).toBeLessThan(4)
})

test('E-1-T1 bare-array CEILING — projectRegistryRows p95 vs record count (#6 50ms breach)', () => {
  // Linear scale factors → record counts; find where the search keystroke crosses 50ms.
  const scales = [1, 2, 5, 10, 20, 40]
  // eslint-disable-next-line no-console
  console.log('PERF-CEILING #6 (search keystroke, 50ms budget):')
  let breachAt = Infinity
  for (const scale of scales) {
    const { sports, competitions, teams, players, total } = makeRegistryScale(scale)
    const index = buildRegistryIndex(sports, competitions, teams, players)
    const stat = bench(`#6 @${total}`, () => projectRegistryRows(index, { query: 'team' }), { runs: 200, warmup: 20 })
    const buildStat = bench(`#5 build @${total}`, () => buildRegistryIndex(sports, competitions, teams, players), { runs: 60, warmup: 10 })
    // eslint-disable-next-line no-console
    console.log(
      `PERF-CEILING records=${total} search_p95=${stat.p95.toFixed(4)}ms build_p95=${buildStat.p95.toFixed(4)}ms`,
    )
    if (stat.p95 >= 50 && breachAt === Infinity) breachAt = total
    keep(stat.p95)
  }
  // eslint-disable-next-line no-console
  console.log(`PERF-CEILING #6 first record count with search_p95 >= 50ms: ${breachAt === Infinity ? 'NONE within tested range (<=~80k)' : breachAt}`)
  expect(true).toBe(true)
})

test('E-1-T0 SLO#7 — inspector hop (index.byId lookup + linkedRecordsOf) @2000', () => {
  const { sports, competitions, teams, players } = makeRegistryScale(1)
  const index = buildRegistryIndex(sports, competitions, teams, players)

  // The hop = resolve the clicked record via byId, then project its linked sections.
  // Heaviest branch: a team with fetched competitions + a 50-player roster.
  const teamRecordId = makeRecordId('team', 12)
  const fetched = {
    teamCompetitions: Array.from({ length: 6 }, (_, i) => ({
      id: i,
      teamId: 12,
      competitionId: 1000 + i,
      seasonId: null,
      source: 'manual',
      competition: { id: 1000 + i, name: `Competition ${i}`, season: '2026' },
    })),
    players: Array.from({ length: 50 }, (_, i) => players[i]),
  }
  const stat = bench('#7 linkedRecordsOf team hop @2000 (6 comps + 50 players)', () => linkedRecordsOf(index, teamRecordId, fetched), { runs: 500, warmup: 50, batch: 20 })
  const lookupStat = bench('#7 index.byId.get @2000', () => index.byId.get(teamRecordId), { runs: 500, warmup: 50, batch: 200 })
  report(stat)
  report(lookupStat)
  expect(stat.p95).toBeLessThan(100) // SLO #7 budget (client hop, excl. lazy fetch)
})
