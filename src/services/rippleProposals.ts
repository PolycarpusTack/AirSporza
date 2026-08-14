/**
 * FM1-4-T1 — minimal read-only ripple-proposal client. No frontend client
 * existed for `GET /api/ripple-proposals` (ripple v1, SV-2-T3 — backend/src/
 * routes/rippleProposals.ts) before this task. FM Home's FEED kind (FM1-3's
 * fmActionItems.ts) is the first frontend consumer, and it only needs a
 * read-only PENDING listing — no accept/reject (that's EPIC FM-2's Cascade
 * banner, per SV-2's own ADR-019 boundary comment). Kept intentionally
 * minimal: one method, first page only (ADR-009 default limit — FM Home's
 * FEED tile is a "what's pending this week" glance, not an exhaustive review
 * queue; pagination is FM-2/SV-3 scope if this call site ever needs it).
 *
 * The row type is NOT redeclared here — `RippleProposal` (fmActionItems.ts,
 * FM1-3-T1) already mirrors the backend's ripple v1 response row exactly, and
 * it's the type `deriveActionItems` requires; importing it keeps ONE
 * source of truth instead of two shapes drifting apart.
 */
import { api } from '../utils/api'
import type { RippleProposal } from '../components/fm/fmActionItems'

export const rippleProposalsApi = {
  /** GET /api/ripple-proposals?status=PENDING */
  listPending: () =>
    api.get<{ proposals: RippleProposal[]; nextCursor: string | null; hasMore: boolean }>(
      '/ripple-proposals?status=PENDING',
    ),
}
