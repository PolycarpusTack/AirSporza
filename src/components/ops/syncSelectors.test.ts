/**
 * Permutation tests for the SYNC job/candidate selectors (D-1-T1).
 *
 * These rows PIN the D-1 pins written to be testable:
 *   pin 1 dot state map (all 5 ImportJob.status values) · pin 2 sourceName ·
 *   pin 3 assembled meta line (time seam · dead-letters vs success · statsJson
 *   coercion) · pin 4 startedAt→createdAt time fallback · pin 5 pendingCandidateCount.
 *
 * TZ seam: the meta `time` is a WALL-CLOCK HH:MM in the AMBIENT tz. The repo pins
 * vitest to America/New_York (vitest.config.ts) — the instants below are winter
 * (January) dates so the offset is unambiguously EST (UTC-5): `…T20:00:00Z`
 * reads `15:00`. No Date.now()/Math.random() (repo rule; pure selectors).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { ImportJob, ImportMergeCandidate } from '../../services'
import {
  FIXTURE_COMPETITIONS,
  FIXTURE_JOBS,
  FIXTURE_MERGE_CANDIDATES,
  FIXTURE_SPORTS,
  makeEvent,
  makeJob,
  makeMergeCandidate,
} from './__fixtures__/opsFixtureWeek'
import {
  deriveJobCard,
  deriveMergeCard,
  deriveMergeDiff,
  mergeConfidencePercent,
  pendingCandidateCount,
  type JobDotColor,
} from './syncSelectors'

describe('deriveJobCard — dot state map (pin 1, all 5 statuses)', () => {
  it.each<{ status: ImportJob['status']; dot: JobDotColor }>([
    { status: 'completed', dot: 'green' },
    { status: 'failed', dot: 'red' },
    { status: 'partial', dot: 'amber' },
    { status: 'queued', dot: 'neutral' },
    { status: 'running', dot: 'neutral' },
  ])('status "$status" → dot $dot', ({ status, dot }) => {
    expect(deriveJobCard(makeJob({ id: 'j', status })).dotColor).toBe(dot)
  })

  it('dotColor is a semantic token, never a hex literal (anti-smart-ui)', () => {
    expect(deriveJobCard(makeJob({ id: 'j', status: 'failed' })).dotColor).not.toMatch(/^#/)
  })
})

describe('deriveJobCard — id + sourceName (pin 2)', () => {
  it('passes the job id through and reads job.source.name', () => {
    const card = deriveJobCard(
      makeJob({ id: 'job-x', source: { id: 's', code: 'the_sports_db', name: 'Sports Feed A' } }),
    )
    expect(card.id).toBe('job-x')
    expect(card.sourceName).toBe('Sports Feed A')
  })
})

describe('deriveJobCard — success meta (pin 3, records path)', () => {
  it('records from _count.records when statsJson has no recordsProcessed', () => {
    const card = deriveJobCard(
      makeJob({
        id: 'j',
        status: 'completed',
        statsJson: {},
        startedAt: '2026-01-15T20:00:00.000Z',
        _count: { records: 42, deadLetters: 0 },
      }),
    )
    expect(card.statusLine).toBe('15:00 · OK · 42 RECORDS')
  })

  it('statsJson.recordsProcessed OVERRIDES _count.records when a finite number', () => {
    const card = deriveJobCard(
      makeJob({
        id: 'j',
        status: 'completed',
        statsJson: { recordsProcessed: 128 },
        startedAt: '2026-01-15T20:00:00.000Z',
        _count: { records: 5, deadLetters: 0 },
      }),
    )
    expect(card.statusLine).toBe('15:00 · OK · 128 RECORDS')
  })

  it('statsJson.recordsProcessed as a Decimal-serialized STRING coerces via Number()', () => {
    const card = deriveJobCard(
      makeJob({
        id: 'j',
        status: 'completed',
        statsJson: { recordsProcessed: '256' as unknown as number },
        startedAt: '2026-01-15T20:00:00.000Z',
        _count: { records: 5, deadLetters: 0 },
      }),
    )
    expect(card.statusLine).toBe('15:00 · OK · 256 RECORDS')
  })

  it('non-numeric / absent recordsProcessed falls back to _count.records', () => {
    const nonNumeric = deriveJobCard(
      makeJob({
        id: 'j',
        status: 'completed',
        statsJson: { recordsProcessed: 'not-a-number' },
        startedAt: '2026-01-15T20:00:00.000Z',
        _count: { records: 7, deadLetters: 0 },
      }),
    )
    expect(nonNumeric.statusLine).toBe('15:00 · OK · 7 RECORDS')
  })

  it('empty-string recordsProcessed is ignored (Number("")===0 trap), falls back to _count.records', () => {
    const card = deriveJobCard(
      makeJob({
        id: 'j',
        status: 'completed',
        statsJson: { recordsProcessed: '' as unknown as number },
        startedAt: '2026-01-15T20:00:00.000Z',
        _count: { records: 9, deadLetters: 0 },
      }),
    )
    expect(card.statusLine).toBe('15:00 · OK · 9 RECORDS') // not '0 RECORDS'
  })

  it('null recordsProcessed is ignored (Number(null)===0 trap), falls back to _count.records', () => {
    const card = deriveJobCard(
      makeJob({
        id: 'j',
        status: 'completed',
        statsJson: { recordsProcessed: null as unknown as number },
        startedAt: '2026-01-15T20:00:00.000Z',
        _count: { records: 11, deadLetters: 0 },
      }),
    )
    expect(card.statusLine).toBe('15:00 · OK · 11 RECORDS') // not '0 RECORDS'
  })

  it('absent _count → 0 RECORDS (never crash)', () => {
    const card = deriveJobCard(
      makeJob({
        id: 'j',
        status: 'completed',
        statsJson: {},
        startedAt: '2026-01-15T20:00:00.000Z',
        _count: undefined,
      }),
    )
    expect(card.statusLine).toBe('15:00 · OK · 0 RECORDS')
  })
})

describe('deriveJobCard — dead-letters meta (pin 3, deadLetters > 0 wins)', () => {
  it('deadLetters > 0 → `time · N DEAD-LETTERS` (success meta suppressed)', () => {
    const card = deriveJobCard(
      makeJob({
        id: 'j',
        status: 'failed',
        statsJson: { recordsProcessed: 999 },
        startedAt: '2026-01-15T21:00:00.000Z',
        _count: { records: 12, deadLetters: 3 },
      }),
    )
    expect(card.statusLine).toBe('16:00 · 3 DEAD-LETTERS')
  })

  it('deadLetters absent (no _count) → 0 → success meta path', () => {
    const card = deriveJobCard(
      makeJob({
        id: 'j',
        status: 'completed',
        statsJson: { recordsProcessed: 4 },
        startedAt: '2026-01-15T20:00:00.000Z',
        _count: undefined,
      }),
    )
    expect(card.statusLine).toBe('15:00 · OK · 4 RECORDS')
  })
})

describe('deriveJobCard — time seam (pin 4, ambient TZ = America/New_York / EST)', () => {
  it('uses startedAt when present (20:00Z → 15:00 EST)', () => {
    const card = deriveJobCard(
      makeJob({ id: 'j', startedAt: '2026-01-15T20:00:00.000Z', createdAt: '2026-01-15T08:00:00.000Z' }),
    )
    expect(card.statusLine.startsWith('15:00 ')).toBe(true)
  })

  it('falls back to createdAt when startedAt is null (13:30Z → 08:30 EST, zero-padded)', () => {
    const card = deriveJobCard(
      makeJob({ id: 'j', startedAt: null, createdAt: '2026-01-15T13:30:00.000Z' }),
    )
    expect(card.statusLine.startsWith('08:30 ')).toBe(true)
  })
})

describe('deriveJobCard — full fixture jobs end-to-end', () => {
  it('projects each FIXTURE_JOBS row into its assembled JobCard', () => {
    const cards = FIXTURE_JOBS.map(deriveJobCard)
    expect(cards).toEqual([
      { id: 'job-completed', sourceName: 'Sports Feed A', dotColor: 'green', statusLine: '15:00 · OK · 128 RECORDS' },
      { id: 'job-failed', sourceName: 'Fixture Provider B', dotColor: 'red', statusLine: '16:00 · 3 DEAD-LETTERS' },
      { id: 'job-running', sourceName: 'League Data C', dotColor: 'neutral', statusLine: '17:00 · OK · 0 RECORDS' },
    ])
  })
})

describe('mergeConfidencePercent (D-2-T0 / D-2-T1 scale fix) — 0..100 → whole percent', () => {
  // VERIFIED scale is 0..100 (DeduplicationService: 100/95/60/score vs 70-95 thresholds,
  // stored directly by process.ts). The raw value IS the percent — no *100.
  it.each<{ input: number; expected: number }>([
    { input: 95, expected: 95 }, // fingerprint
    { input: 62, expected: 62 },
    { input: 100, expected: 100 }, // exact
    { input: 0, expected: 0 },
  ])('number $input → $expected%', ({ input, expected }) => {
    expect(mergeConfidencePercent(input)).toBe(expected)
  })

  it.each<{ input: string; expected: number }>([
    { input: '95.00', expected: 95 }, // Decimal(5,2) serialized as a string
    { input: '60', expected: 60 },
  ])('Decimal-serialized STRING "$input" → $expected% (Number() coercion seam)', ({ input, expected }) => {
    expect(mergeConfidencePercent(input as unknown as number)).toBe(expected)
  })

  it.each<{ input: number; expected: number }>([
    { input: 89.6, expected: 90 }, // rounds up
    { input: 89.4, expected: 89 }, // rounds down (float-safe)
  ])('rounds $input → $expected%', ({ input, expected }) => {
    expect(mergeConfidencePercent(input)).toBe(expected)
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * D-2-T1 — merge-review card + diff selectors (sync-selectors v1.2). Pins:
 *   deriveMergeDiff — the 4-field comparable set; a row renders ONLY when BOTH
 *     sides resolve to a non-empty string; changed = string-inequality after
 *     normalization; DATE is TZ-free (ISO slice on incoming, local-component
 *     read on a Date on current); null normalizedJson / null currentEvent → [].
 *   deriveMergeCard — 2-band ≥90 (via mergeConfidencePercent); source-code map
 *     (known → code, unknown → uppercase); incomingName fallback chain; kindLabel
 *     uppercased; isCurrentResolved:false (null currentEvent) → diffRows:[] +
 *     currentName:null.
 * ──────────────────────────────────────────────────────────────────────── */

/** Full-shape candidate builder for the merge selectors (overrides the importRecord wholesale). */
function mergeCandidate(opts: {
  id?: string
  entityType?: string
  confidence?: number
  suggestedEntityId?: string | null
  sourceCode?: string
  sourceRecordId?: string
  normalizedJson: Record<string, unknown> | null
}) {
  return makeMergeCandidate({
    id: opts.id ?? 'cand',
    entityType: opts.entityType ?? 'event',
    confidence: opts.confidence ?? 80,
    suggestedEntityId: opts.suggestedEntityId ?? null,
    importRecord: {
      id: `rec-${opts.id ?? 'cand'}`,
      sourceId: 'src',
      sourceRecordId: opts.sourceRecordId ?? 'srcrec-cand',
      entityType: opts.entityType ?? 'event',
      normalizedJson: opts.normalizedJson,
      sourceUpdatedAt: null,
      source: { id: 'src', code: opts.sourceCode ?? 'the_sports_db', name: 'Feed' },
    },
  })
}

describe('deriveMergeDiff — comparable 4-field set + change flags', () => {
  const currentEvent = makeEvent({
    id: 1,
    sportId: 1, // Football
    competitionId: 101, // League A
    startDateBE: '2026-03-02',
    participants: 'Home Utd — Away FC',
  })

  it('renders all 4 rows when both sides resolve; flags only the differing field', () => {
    const rows = deriveMergeDiff(
      {
        sportName: 'Football', // matches
        competitionName: 'Cup C', // differs (current is League A)
        startsAtUtc: '2026-03-02T10:00:00.000Z', // matches (date part)
        homeTeam: 'Home Utd',
        awayTeam: 'Away FC', // matches current participants
      },
      currentEvent,
      FIXTURE_SPORTS,
      FIXTURE_COMPETITIONS,
    )
    expect(rows).toEqual([
      { field: 'SPORT', incoming: 'Football', current: 'Football', isChanged: false },
      { field: 'COMPETITION', incoming: 'Cup C', current: 'League A', isChanged: true },
      { field: 'DATE', incoming: '2026-03-02', current: '2026-03-02', isChanged: false },
      { field: 'PARTICIPANTS', incoming: 'Home Utd — Away FC', current: 'Home Utd — Away FC', isChanged: false },
    ])
  })

  it('omits a field absent on the INCOMING side (no sportName → no SPORT row)', () => {
    const rows = deriveMergeDiff(
      { competitionName: 'League A', startsAtUtc: '2026-03-02T10:00:00.000Z', participantsText: 'Other' },
      currentEvent,
      FIXTURE_SPORTS,
      FIXTURE_COMPETITIONS,
    )
    expect(rows.map((r) => r.field)).toEqual(['COMPETITION', 'DATE', 'PARTICIPANTS'])
  })

  it('omits a field absent on the CURRENT side (unknown sportId → no SPORT row)', () => {
    const rows = deriveMergeDiff(
      { sportName: 'Football', startsAtUtc: '2026-03-02T10:00:00.000Z' },
      makeEvent({ id: 2, sportId: 999, competitionId: 101, startDateBE: '2026-03-02' }),
      FIXTURE_SPORTS,
      FIXTURE_COMPETITIONS,
    )
    expect(rows.map((r) => r.field)).toEqual(['DATE'])
  })

  it('PARTICIPANTS uses homeTeam — awayTeam when BOTH present, else participantsText', () => {
    const both = deriveMergeDiff(
      { homeTeam: 'Alpha', awayTeam: 'Beta' },
      makeEvent({ id: 3, participants: 'Alpha — Beta' }),
      FIXTURE_SPORTS,
      FIXTURE_COMPETITIONS,
    )
    expect(both.find((r) => r.field === 'PARTICIPANTS')?.incoming).toBe('Alpha — Beta')

    const textOnly = deriveMergeDiff(
      { homeTeam: 'Alpha', participantsText: 'Solo Text' }, // awayTeam absent → fall to text
      makeEvent({ id: 4, participants: 'Solo Text' }),
      FIXTURE_SPORTS,
      FIXTURE_COMPETITIONS,
    )
    expect(textOnly.find((r) => r.field === 'PARTICIPANTS')?.incoming).toBe('Solo Text')
  })

  it('DATE is TZ-free: an ISO-string current and a Date-object current normalize identically', () => {
    const incoming = { startsAtUtc: '2026-03-06T23:30:00.000Z' }
    const stringSide = deriveMergeDiff(incoming, makeEvent({ id: 5, startDateBE: '2026-03-06T00:00:00.000Z' }), FIXTURE_SPORTS, FIXTURE_COMPETITIONS)
    const dateSide = deriveMergeDiff(incoming, makeEvent({ id: 6, startDateBE: new Date(2026, 2, 6) }), FIXTURE_SPORTS, FIXTURE_COMPETITIONS)
    const stringDate = stringSide.find((r) => r.field === 'DATE')
    const dateDate = dateSide.find((r) => r.field === 'DATE')
    expect(stringDate).toEqual({ field: 'DATE', incoming: '2026-03-06', current: '2026-03-06', isChanged: false })
    expect(dateDate).toEqual({ field: 'DATE', incoming: '2026-03-06', current: '2026-03-06', isChanged: false })
  })

  it('DATE from a Date whose LOCAL day differs from its UTC day reads the LOCAL calendar day', () => {
    // new Date(2026, 2, 6, 23, 0) = LOCAL 2026-03-06 23:00 EST → 2026-03-07T04:00Z UTC.
    // A `toISOString().slice(0,10)` regression would read '2026-03-07' (the UTC day) and
    // flip isChanged to true; a dropped `.slice` would blow up the string entirely. Both die here.
    const rows = deriveMergeDiff(
      { startsAtUtc: '2026-03-06T12:00:00.000Z' },
      makeEvent({ id: 7, startDateBE: new Date(2026, 2, 6, 23, 0) }),
      FIXTURE_SPORTS,
      FIXTURE_COMPETITIONS,
    )
    expect(rows.find((r) => r.field === 'DATE')).toEqual({ field: 'DATE', incoming: '2026-03-06', current: '2026-03-06', isChanged: false })
  })

  it('null normalizedJson → no rows', () => {
    expect(deriveMergeDiff(null, currentEvent, FIXTURE_SPORTS, FIXTURE_COMPETITIONS)).toEqual([])
  })

  it('null currentEvent → no rows', () => {
    expect(deriveMergeDiff({ sportName: 'Football' }, null, FIXTURE_SPORTS, FIXTURE_COMPETITIONS)).toEqual([])
  })

  it('coerces non-string normalizedJson values to empty (never crashes on unknown shape)', () => {
    const rows = deriveMergeDiff(
      { sportName: 42 as unknown, competitionName: 'League A' },
      currentEvent,
      FIXTURE_SPORTS,
      FIXTURE_COMPETITIONS,
    )
    // sportName is a number → coerced to '' → SPORT row omitted
    expect(rows.map((r) => r.field)).toEqual(['COMPETITION'])
  })
})

describe('deriveMergeCard — projection', () => {
  const currentEvent = makeEvent({
    id: 1,
    sportId: 1,
    competitionId: 101,
    startDateBE: '2026-03-02',
    participants: 'Home Utd — Away FC',
  })

  it('null currentEvent → isCurrentResolved:false, currentName:null, diffRows:[]', () => {
    const card = deriveMergeCard(
      mergeCandidate({ id: 'x', suggestedEntityId: null, normalizedJson: { sportName: 'Football' } }),
      null,
      FIXTURE_SPORTS,
      FIXTURE_COMPETITIONS,
    )
    expect(card.isCurrentResolved).toBe(false)
    expect(card.currentName).toBeNull()
    expect(card.diffRows).toEqual([])
    expect(card.suggestedEntityId).toBeNull()
  })

  it('resolved currentEvent → isCurrentResolved:true, currentName = event.participants, diff populated', () => {
    const card = deriveMergeCard(
      mergeCandidate({
        id: 'x',
        suggestedEntityId: '1',
        normalizedJson: { sportName: 'Tennis', homeTeam: 'Home Utd', awayTeam: 'Away FC' },
      }),
      currentEvent,
      FIXTURE_SPORTS,
      FIXTURE_COMPETITIONS,
    )
    expect(card.isCurrentResolved).toBe(true)
    expect(card.currentName).toBe('Home Utd — Away FC')
    expect(card.diffRows.find((r) => r.field === 'SPORT')).toEqual({ field: 'SPORT', incoming: 'Tennis', current: 'Football', isChanged: true })
  })

  it('kindLabel is the entityType uppercased', () => {
    expect(deriveMergeCard(mergeCandidate({ entityType: 'event', normalizedJson: null }), null, [], []).kindLabel).toBe('EVENT')
    expect(deriveMergeCard(mergeCandidate({ entityType: 'team', normalizedJson: null }), null, [], []).kindLabel).toBe('TEAM')
  })

  it.each<{ confidence: number; percent: number; band: 'green' | 'amber' }>([
    { confidence: 90, percent: 90, band: 'green' },
    { confidence: 89, percent: 89, band: 'amber' },
    { confidence: 100, percent: 100, band: 'green' },
  ])('band boundary: confidence $confidence → $percent% $band', ({ confidence, percent, band }) => {
    const card = deriveMergeCard(mergeCandidate({ confidence, normalizedJson: null }), null, [], [])
    expect(card.confidencePercent).toBe(percent)
    expect(card.band).toBe(band)
  })

  it('confidence as a Decimal-serialized STRING coerces (95.00 → 95 green)', () => {
    const card = deriveMergeCard(
      mergeCandidate({ confidence: '95.00' as unknown as number, normalizedJson: null }),
      null,
      [],
      [],
    )
    expect(card.confidencePercent).toBe(95)
    expect(card.band).toBe('green')
  })

  it.each<{ code: string; sourceCode: string }>([
    { code: 'the_sports_db', sourceCode: 'TSDB' },
    { code: 'api_football', sourceCode: 'API-FB' },
    { code: 'football_data', sourceCode: 'FB-DATA' },
    { code: 'opta', sourceCode: 'OPTA' }, // unknown key → uppercased raw
  ])('sourceCode: $code → $sourceCode', ({ code, sourceCode }) => {
    expect(deriveMergeCard(mergeCandidate({ sourceCode: code, normalizedJson: null }), null, [], []).sourceCode).toBe(sourceCode)
  })

  it('band token is semantic, never a hex literal', () => {
    expect(deriveMergeCard(mergeCandidate({ confidence: 95, normalizedJson: null }), null, [], []).band).not.toMatch(/^#/)
  })

  describe('incomingName fallback chain', () => {
    it('homeTeam — awayTeam when both present (highest priority)', () => {
      const card = deriveMergeCard(
        mergeCandidate({ normalizedJson: { homeTeam: 'Alpha', awayTeam: 'Beta', participantsText: 'ignored' } }),
        null,
        [],
        [],
      )
      expect(card.incomingName).toBe('Alpha — Beta')
    })

    it('participantsText when home/away incomplete', () => {
      const card = deriveMergeCard(
        mergeCandidate({ normalizedJson: { homeTeam: 'Alpha', participantsText: 'Text Wins' } }),
        null,
        [],
        [],
      )
      expect(card.incomingName).toBe('Text Wins')
    })

    it('sportName · competitionName when no participants', () => {
      const card = deriveMergeCard(
        mergeCandidate({ normalizedJson: { sportName: 'Football', competitionName: 'League A' } }),
        null,
        [],
        [],
      )
      expect(card.incomingName).toBe('Football · League A')
    })

    it('sourceRecordId as the last resort (null normalizedJson)', () => {
      const card = deriveMergeCard(
        mergeCandidate({ sourceRecordId: 'ext-999', normalizedJson: null }),
        null,
        [],
        [],
      )
      expect(card.incomingName).toBe('ext-999')
    })
  })
})

describe('pendingCandidateCount (pin 5) — counts by status defensively', () => {
  it('all-pending array → full length', () => {
    expect(pendingCandidateCount(FIXTURE_MERGE_CANDIDATES)).toBe(2)
  })

  it('mixed-status array → only pending counted (D-3 decrement seam)', () => {
    const mixed: ImportMergeCandidate[] = [
      makeMergeCandidate({ id: 'p1', status: 'pending' }),
      makeMergeCandidate({ id: 'm1', status: 'approved_merge' }),
      makeMergeCandidate({ id: 'p2', status: 'pending' }),
      makeMergeCandidate({ id: 'c1', status: 'create_new' }),
      makeMergeCandidate({ id: 'i1', status: 'ignored' }),
    ]
    expect(pendingCandidateCount(mixed)).toBe(2)
  })

  it('empty array → 0', () => {
    expect(pendingCandidateCount([])).toBe(0)
  })
})
