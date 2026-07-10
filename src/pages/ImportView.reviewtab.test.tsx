/**
 * ImportView.ReviewTab confidence-percent render test (D-2-T0 extraction; scale
 * CORRECTED at the D-2-T1 pull-gate). Pins ReviewTab's confidence→percent text
 * (`{mergeConfidencePercent(c.confidence)}% match`) — now on the VERIFIED 0..100
 * scale (the raw value IS the percent). This asserts the CORRECTED display: the
 * legacy inline `* 100` rendered e.g. 9500% for a real 95-confidence candidate (a
 * latent bug); the shared helper fixes it to `95% match`.
 *
 * Scope is the confidence-percent text only: the 3-band chip class, source code,
 * KIND chip, reason codes, and actions DIVERGE from SYNC and stay per-consumer.
 *
 * Honest-data pin: one candidate carries a Decimal-serialized STRING confidence
 * ('90') so the helper's explicit Number() coercion is exercised through the render.
 *
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportMergeCandidate } from '../services'
import { makeMergeCandidate } from '../components/ops/__fixtures__/opsFixtureWeek'

const listMergeCandidates = vi.fn()

vi.mock('../services', () => ({
  importsApi: {
    listMergeCandidates: (...a: unknown[]) => listMergeCandidates(...a),
    approveMergeCandidate: vi.fn(),
    createMergeCandidateEntity: vi.fn(),
    ignoreMergeCandidate: vi.fn(),
  },
}))

vi.mock('../components/Toast', () => ({
  useToast: () => ({}),
}))

vi.mock('../utils/apiError', () => ({
  handleApiError: () => {},
}))

import { ReviewTab } from './ImportView'

/** confidence permutations (0..100 scale): numbers + a Decimal-serialized STRING. */
const CANDIDATES: ImportMergeCandidate[] = [
  makeMergeCandidate({ id: 'c-95', confidence: 95 }),
  makeMergeCandidate({ id: 'c-80', confidence: 80 }),
  makeMergeCandidate({ id: 'c-50', confidence: 50 }),
  makeMergeCandidate({ id: 'c-str90', confidence: '90' as unknown as number }),
  // fractional percent → pins ROUNDING DIRECTION at the render boundary (89.6→90,
  // so a floor-vs-round regression in ReviewTab is caught, not just scale drift).
  makeMergeCandidate({ id: 'c-round', confidence: 89.6 }),
]

beforeEach(() => {
  listMergeCandidates.mockReset()
  listMergeCandidates.mockResolvedValue(CANDIDATES)
})
afterEach(() => cleanup())

describe('ImportView.ReviewTab — confidence percent (0..100 scale, corrected)', () => {
  it('renders each candidate confidence as a whole-number `N% match` chip', async () => {
    render(<ReviewTab />)

    // load resolves → review queue paints (was showing the loading placeholder).
    await waitFor(() => expect(screen.getByText('95% match')).toBeTruthy())

    // raw 0..100 value IS the percent (was buggily *100 → 9500% before the fix)
    expect(screen.getByText('80% match')).toBeTruthy()
    expect(screen.getByText('50% match')).toBeTruthy()
    // Decimal-serialized STRING coerces via Number() ('90' → 90%); getAllByText
    // because the fractional 89.6 ALSO rounds to 90% (pins round direction).
    expect(screen.getAllByText('90% match').length).toBe(2)
  })
})
