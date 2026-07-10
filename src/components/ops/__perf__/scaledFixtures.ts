/**
 * E-1 SCALED synthetic fixtures (VERIFICATION hat). Deterministic generators for
 * the SLO volumes — NOT added to the shared frozen opsFixtureWeek.ts. Reuses the
 * fixture `make*` builders (which return fresh, non-frozen objects) so the shapes
 * stay identical to production payloads.
 *
 * Determinism: every value derives from the loop index (no Math.random / Date.now)
 * so a rerun reproduces byte-identical inputs → repeatable p95.
 *
 * PII (EPIC C/D DoD 3): every name is synthetic (`Team 12`, `Player 480`, …) — no
 * real athletes/fixtures.
 *
 * Volumes (per the 9 SLOs):
 *   REGISTRY  2,000 records = 20 sports + 200 competitions + 780 teams + 1,000 players
 *   SCHEDULE    500 events across the fixture week (2026-03-02 … 03-08)
 *   RIGHTS      100 contracts over the generated competitions
 *   SYNC         50 jobs + 100 merge candidates
 */
import type { Competition, Contract, Event, Player, Sport, Team } from '../../../data/types'
import type { ImportJob, ImportMergeCandidate } from '../../../services'
import { makeCompetition, makeContract, makeEvent, makeJob, makeMergeCandidate, makePlayer, makeTeam } from '../__fixtures__/opsFixtureWeek'

const SOURCE_KEYS = ['the_sports_db', 'api_football', 'football_data', 'opta', ''] // '' → MANUAL branch
const PLAYER_STATUS = ['active', 'injured', 'loaned', 'retired', 'unknown-enum']
const COUNTRIES = ['Belgium', 'Netherlands', 'France', 'Germany', 'Spain']
const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Sprinter']

function externalRefsFor(i: number): Record<string, unknown> {
  const key = SOURCE_KEYS[i % SOURCE_KEYS.length]
  return key ? { [key]: `${key}-${i}` } : {}
}

export interface RegistryScale {
  sports: Sport[]
  competitions: Competition[]
  teams: Team[]
  players: Player[]
  total: number
}

/**
 * Build a registry universe of ~`total` records with the default 20/200/780/1000
 * split (== 2,000). `scale` linearly re-sizes every collection for ceiling sweeps.
 */
export function makeRegistryScale(scale = 1): RegistryScale {
  const nSports = Math.max(1, Math.round(20 * scale))
  const nComps = Math.max(1, Math.round(200 * scale))
  const nTeams = Math.max(1, Math.round(780 * scale))
  const nPlayers = Math.max(1, Math.round(1000 * scale))

  const sports: Sport[] = Array.from({ length: nSports }, (_, i) => ({
    id: i + 1,
    name: `Sport ${i + 1}`,
    icon: '*',
    federation: `Federation ${i + 1}`,
  }))

  const competitions: Competition[] = Array.from({ length: nComps }, (_, i) =>
    makeCompetition({
      id: 1000 + i,
      sportId: (i % nSports) + 1,
      name: `Competition ${i} League ${i % 7}`,
      season: `20${20 + (i % 6)}`,
      _count: { events: i % 30, teamLinks: i % 18 },
    }),
  )

  const teams: Team[] = Array.from({ length: nTeams }, (_, i) =>
    makeTeam({
      id: 1 + i,
      name: `Team ${i} United`,
      sportId: (i % nSports) + 1,
      country: COUNTRIES[i % COUNTRIES.length],
      // half carry a sport embed (embed arm), half resolve via the sportId lookup arm
      sport: i % 2 === 0 ? { id: (i % nSports) + 1, name: `Sport ${(i % nSports) + 1}`, icon: '*' } : undefined,
      notes: i % 5 === 0 ? `Remark ${i}` : undefined,
      externalRefs: externalRefsFor(i),
      _count: { competitionLinks: i % 6, playerLinks: i % 25 },
    }),
  )

  const players: Player[] = Array.from({ length: nPlayers }, (_, i) =>
    makePlayer({
      id: 1 + i,
      fullName: `Player ${i} Fixtura`,
      sportId: (i % nSports) + 1,
      status: PLAYER_STATUS[i % PLAYER_STATUS.length],
      position: POSITIONS[i % POSITIONS.length],
      jerseyNumber: (i % 30) + 1,
      countryCode: COUNTRIES[i % COUNTRIES.length].slice(0, 2).toUpperCase(),
      sport: i % 2 === 0 ? { id: (i % nSports) + 1, name: `Sport ${(i % nSports) + 1}`, icon: '*' } : undefined,
      externalRefs: externalRefsFor(i),
      // ~80% attached to a current team, ~20% unattached (null team embed)
      teamLinks: i % 5 === 0 ? [{ team: null }] : [{ team: { id: (i % nTeams) + 1, name: `Team ${i % nTeams} United` } }],
    }),
  )

  return { sports, competitions, teams, players, total: nSports + nComps + nTeams + nPlayers }
}

/** 500 events spread across the 7 fixture-week days (all IN-week → worst-case grouping). */
export function makeEventScale(n = 500): Event[] {
  const week = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']
  return Array.from({ length: n }, (_, i) =>
    makeEvent({
      id: i + 1,
      sportId: (i % 20) + 1,
      competitionId: 1000 + (i % 200),
      startDateBE: week[i % week.length],
      startTimeBE: `${String(6 + (i % 16)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
      durationMin: 60 + (i % 4) * 30,
      participants: `Team ${i % 200} — Team ${(i + 1) % 200}`,
    }),
  )
}

export const PERF_WEEK = { start: '2026-03-02' }
export const PERF_NOW = new Date('2026-03-04T00:00:00Z')

/** 100 contracts over the generated competitions, spanning every derive branch. */
export function makeContractScale(n = 100): Contract[] {
  // validUntil spread: past (lapsed), inside 90d (expiring), far future (valid).
  const untils = ['2026-02-01', '2026-03-20', '2026-04-15', '2027-06-30', '2028-12-31', '']
  const statuses: Contract['status'][] = ['valid', 'draft', 'none', 'valid', 'valid']
  return Array.from({ length: n }, (_, i) =>
    makeContract({
      id: i + 1,
      competitionId: 1000 + (i % 200),
      status: statuses[i % statuses.length],
      validFrom: '2024-07-01',
      validUntil: untils[i % untils.length],
    }),
  )
}

/** 50 import jobs spanning every status + dead-letter / records branch. */
export function makeJobScale(n = 50): ImportJob[] {
  const statuses: ImportJob['status'][] = ['completed', 'failed', 'partial', 'queued', 'running']
  return Array.from({ length: n }, (_, i) =>
    makeJob({
      id: `job-${i}`,
      status: statuses[i % statuses.length],
      statsJson: { recordsProcessed: i * 3 },
      startedAt: i % 5 === 4 ? null : '2026-01-15T20:00:00.000Z',
      createdAt: '2026-01-15T19:55:00.000Z',
      _count: { records: i * 3, deadLetters: i % 4 },
      source: { id: `s${i}`, code: SOURCE_KEYS[i % 3], name: `Source ${i}` },
    }),
  )
}

/**
 * 100 merge candidates. ~half carry a suggestedEntityId (resolved-current path,
 * the heavier deriveMergeDiff branch); ~half are incoming-only.
 */
export function makeCandidateScale(n = 100): ImportMergeCandidate[] {
  return Array.from({ length: n }, (_, i) =>
    makeMergeCandidate({
      id: `cand-${i}`,
      entityType: 'event',
      confidence: (i % 100) as unknown as number,
      suggestedEntityId: i % 2 === 0 ? String((i % 500) + 1) : null,
      status: 'pending',
      importRecord: {
        id: `rec-${i}`,
        sourceId: 'src',
        sourceRecordId: `srcrec-${i}`,
        entityType: 'event',
        normalizedJson: {
          sportName: `Sport ${(i % 20) + 1}`,
          competitionName: `Competition ${i % 200} League ${i % 7}`,
          startsAtUtc: '2026-03-02T19:00:00.000Z',
          homeTeam: `Team ${i % 200}`,
          awayTeam: `Team ${(i + 1) % 200}`,
        },
        sourceUpdatedAt: null,
        source: { id: 's', code: SOURCE_KEYS[i % 3], name: `Source ${i}` },
      },
    }),
  )
}
