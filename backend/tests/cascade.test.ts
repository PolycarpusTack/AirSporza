import { describe, it, expect } from 'vitest'
import {
  CHANGEOVER_MIN,
  CONFIDENCE_DECAY,
  addMinutes,
  computeCascadeChain,
  type CascadeItem,
} from '../src/services/cascade/compute.js'
import { heuristicEstimator } from '../src/services/cascade/estimator.js'

// Base timestamp used throughout — 2026-04-21T12:00:00Z so numbers stay
// human-readable in failure messages.
const T0 = new Date('2026-04-21T12:00:00Z').getTime()

function item(overrides: Partial<CascadeItem>): CascadeItem {
  return {
    id: 1,
    startMs: T0,
    status: 'scheduled',
    notBeforeMs: null,
    actualStartMs: null,
    actualEndMs: null,
    shortMin: 90,
    longMin: 120,
    ...overrides,
  }
}

describe('computeCascadeChain', () => {
  it('returns empty for an empty chain', () => {
    expect(computeCascadeChain([])).toEqual([])
  })

  it('anchors the first scheduled item at its startMs and decays confidence once', () => {
    const [result] = computeCascadeChain([item({ id: 1 })])
    expect(result.estimatedStartMs).toBe(T0)
    // The engine decays on every uncertain item — even the first — so a
    // lone scheduled event reports CONFIDENCE_DECAY, not 1.0. (The preview
    // endpoint uses a different convention; see schedules.ts cascade preview.)
    expect(result.confidenceScore).toBeCloseTo(CONFIDENCE_DECAY, 2)
  })

  it('pins a completed item to its actual times and sets 0 remaining duration', () => {
    const start = T0
    const end = T0 + 60 * 60 * 1000
    const [result] = computeCascadeChain([
      item({
        id: 1,
        status: 'completed',
        actualStartMs: start,
        actualEndMs: end,
      }),
    ])
    expect(result.estimatedStartMs).toBe(start)
    expect(result.estDurationShortMin).toBe(0)
    expect(result.estDurationLongMin).toBe(0)
    expect(result.confidenceScore).toBe(1)
  })

  it('anchors downstream items off the previous end plus changeover', () => {
    const actualStart = T0
    const actualEnd = T0 + 60 * 60 * 1000 // 13:00Z
    const results = computeCascadeChain([
      item({
        id: 1,
        status: 'completed',
        actualStartMs: actualStart,
        actualEndMs: actualEnd,
      }),
      item({ id: 2, startMs: T0 + 2 * 60 * 60 * 1000, shortMin: 60, longMin: 90 }),
    ])
    expect(results[1].estimatedStartMs).toBe(actualEnd + CHANGEOVER_MIN * 60 * 1000)
  })

  it('applies CONFIDENCE_DECAY compoundingly through the chain', () => {
    const results = computeCascadeChain([
      item({ id: 1 }),
      item({ id: 2, startMs: T0 + 2 * 60 * 60 * 1000 }),
      item({ id: 3, startMs: T0 + 4 * 60 * 60 * 1000 }),
    ])
    // Each uncertain item decays once: 1, 2, 3 exponents of CONFIDENCE_DECAY.
    expect(results[0].confidenceScore).toBeCloseTo(CONFIDENCE_DECAY, 2)
    expect(results[1].confidenceScore).toBeCloseTo(CONFIDENCE_DECAY ** 2, 2)
    expect(results[2].confidenceScore).toBeCloseTo(CONFIDENCE_DECAY ** 3, 2)
  })

  it('respects notBeforeMs when pushing a downstream item', () => {
    const prevEnd = T0 + 30 * 60 * 1000 // +30min
    const mandatoryStart = T0 + 3 * 60 * 60 * 1000 // +3h window
    const results = computeCascadeChain([
      item({
        id: 1,
        status: 'completed',
        actualStartMs: T0,
        actualEndMs: prevEnd,
      }),
      item({ id: 2, startMs: T0 + 60 * 60 * 1000, notBeforeMs: mandatoryStart }),
    ])
    // prevEnd + changeover is much earlier than mandatoryStart, so the
    // mandatory window wins.
    expect(results[1].estimatedStartMs).toBe(mandatoryStart)
  })
})

describe('addMinutes', () => {
  it('adds positive minutes', () => {
    const d = new Date('2026-04-21T12:00:00Z')
    expect(addMinutes(d, 30).toISOString()).toBe('2026-04-21T12:30:00.000Z')
  })

  it('accepts zero', () => {
    const d = new Date('2026-04-21T12:00:00Z')
    expect(addMinutes(d, 0).getTime()).toBe(d.getTime())
  })
})

describe('heuristicEstimator', () => {
  const baseEvent = {
    id: 1,
    sportMetadata: {} as Record<string, unknown>,
    sport: null,
    phase: null,
    startDateBE: new Date('2026-04-21'),
  }

  it('prefers explicit durationMin over sport heuristics, with ±10/20% padding', () => {
    const result = heuristicEstimator.estimate({
      ...baseEvent,
      durationMin: 100,
    })
    expect(result.shortMin).toBe(90)
    expect(result.longMin).toBe(120)
    expect(result.inputsUsed.source).toBe('override:durationMin')
  })

  it('falls back to football (95/140) when sport is unknown', () => {
    const { shortMin, longMin, inputsUsed } = heuristicEstimator.estimate(baseEvent)
    expect(shortMin).toBe(95)
    expect(longMin).toBe(140)
    expect(inputsUsed.source).toBe('heuristic:default')
  })

  it('uses different bounds for tennis BEST_OF_3 vs BEST_OF_5', () => {
    const bo3 = heuristicEstimator.estimate({
      ...baseEvent,
      sport: { name: 'Tennis' },
      sportMetadata: { match_format: 'BEST_OF_3' },
    })
    const bo5 = heuristicEstimator.estimate({
      ...baseEvent,
      sport: { name: 'Tennis' },
      sportMetadata: { match_format: 'BEST_OF_5' },
    })
    expect(bo5.shortMin).toBeGreaterThan(bo3.shortMin)
    expect(bo5.longMin).toBeGreaterThan(bo3.longMin)
    expect(bo3.inputsUsed.match_format).toBe('BEST_OF_3')
  })

  it('covers Athletics with a phase-aware estimate', () => {
    const heats = heuristicEstimator.estimate({
      ...baseEvent,
      sport: { name: 'Athletics' },
      phase: 'Heats',
    })
    const finals = heuristicEstimator.estimate({
      ...baseEvent,
      sport: { name: 'Athletics' },
      phase: 'Finals',
    })
    expect(heats.shortMin).toBe(120)
    expect(finals.shortMin).toBe(180)
    expect(finals.inputsUsed.phase).toBe('Finals')
  })

  it('covers Swimming with a phase-aware estimate', () => {
    const { shortMin, longMin, inputsUsed } = heuristicEstimator.estimate({
      ...baseEvent,
      sport: { name: 'Swimming' },
      phase: 'Finals',
    })
    expect(shortMin).toBe(90)
    expect(longMin).toBe(150)
    expect(inputsUsed.source).toBe('heuristic:swimming')
  })

  it('decays both bounds by elapsed minutes for live events', () => {
    const { shortMin, longMin, inputsUsed } = heuristicEstimator.estimate(
      { ...baseEvent, durationMin: 100 }, // short=90, long=120 before decay
      { elapsedMin: 30 },
    )
    expect(shortMin).toBe(60)
    expect(longMin).toBe(90)
    expect(inputsUsed.live_remaining).toBe(true)
    expect(inputsUsed.elapsed_min).toBe(30)
  })

  it('clamps remaining duration to zero when elapsed exceeds longMin', () => {
    const { shortMin, longMin } = heuristicEstimator.estimate(
      { ...baseEvent, durationMin: 100 }, // long=120
      { elapsedMin: 200 },
    )
    expect(shortMin).toBe(0)
    expect(longMin).toBe(0)
  })
})
