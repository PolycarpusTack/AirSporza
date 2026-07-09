/**
 * CHARACTERIZATION test (D-2-T0) — pins ImportView.ReviewTab's CURRENT confidence
 * render BEFORE the shared-helper extraction, and proves BYTE-STABILITY after it.
 *
 * Scope is the ONE dedup'd bit only: the merge-candidate confidence→percent text
 * (`{Math.round(c.confidence * 100)}% match`). The 3-band chip class, source code,
 * KIND chip, reason codes, and actions DIVERGE from SYNC and stay per-consumer —
 * this test does NOT pin them.
 *
 * Honest-data pin: one candidate carries a Decimal-serialized STRING confidence
 * ('0.9') — the same coercion seam the fixtures document — so the extraction's
 * explicit Number() coercion is exercised through the real render path.
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

/** confidence permutations: number bands + a Decimal-serialized STRING. */
const CANDIDATES: ImportMergeCandidate[] = [
  makeMergeCandidate({ id: 'c-95', confidence: 0.95 }),
  makeMergeCandidate({ id: 'c-80', confidence: 0.8 }),
  makeMergeCandidate({ id: 'c-50', confidence: 0.5 }),
  makeMergeCandidate({ id: 'c-str90', confidence: '0.9' as unknown as number }),
  // fractional percent → pins ROUNDING DIRECTION at the render boundary (89.9→90,
  // so a floor-vs-round regression in ReviewTab is caught, not just scale drift).
  makeMergeCandidate({ id: 'c-round', confidence: 0.899 }),
]

beforeEach(() => {
  listMergeCandidates.mockReset()
  listMergeCandidates.mockResolvedValue(CANDIDATES)
})
afterEach(() => cleanup())

describe('ImportView.ReviewTab — confidence percent (characterization / byte-stable)', () => {
  it('renders each candidate confidence as a whole-number `N% match` chip', async () => {
    render(<ReviewTab />)

    // load resolves → review queue paints (was showing the loading placeholder).
    await waitFor(() => expect(screen.getByText('95% match')).toBeTruthy())

    // number bands
    expect(screen.getByText('80% match')).toBeTruthy()
    expect(screen.getByText('50% match')).toBeTruthy()
    // Decimal-serialized STRING confidence coerces to a percent (0.9 → 90%);
    // getAllByText because the fractional 0.899 ALSO rounds to 90% (round direction).
    expect(screen.getAllByText('90% match').length).toBe(2)
  })
})
