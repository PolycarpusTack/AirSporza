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
  FIXTURE_JOBS,
  FIXTURE_MERGE_CANDIDATES,
  makeJob,
  makeMergeCandidate,
} from './__fixtures__/opsFixtureWeek'
import {
  deriveJobCard,
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
