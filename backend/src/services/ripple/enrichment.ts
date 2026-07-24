/**
 * SV-2-T3 — creation-time ADVISORY rights enrichment for ripple proposals.
 *
 * Runs the slot-rights check (RD-4 machinery: `checkRightsForEvent`, the same
 * event→slot mapping `slot-rights v1` uses — all affected slots belong to the
 * ONE event, so they share the event-level result) over the proposal's
 * affected slots at creation time, ON THE CAPTURE TRANSACTION so the check
 * sees the just-written post-change event values.
 *
 * The annotations are ADVISORY ONLY (marked so): SV-3's apply re-runs the
 * check authoritatively (ADR-019 §3). Failure tolerance (TD-18 fail-visible
 * lesson): ANY enrichment error is caught, logged, and annotated
 * `checked:false` with a SANITIZED reason (classification + error class name —
 * never the raw message: this JSONB is served verbatim by the read surface) —
 * the proposal is never lost and the import transaction never fails because
 * rights enrichment couldn't run. (The checker performs read-only queries; a
 * server-side query failure severe enough to abort the shared tx implies a
 * connection-level failure that dooms the import regardless — the catch
 * covers every JS-level failure mode.)
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { checkRightsForEvent } from '../rightsChecker.js'
import { logger } from '../../utils/logger.js'
import type { RippleRightsAnnotations } from './capturePayloads.js'

export async function buildAdvisoryRightsAnnotations(
  db: PrismaClient | Prisma.TransactionClient,
  eventId: number,
  slots: Array<{ id: string }>,
): Promise<RippleRightsAnnotations> {
  try {
    const { ok, results } = await checkRightsForEvent(eventId, { db })
    return {
      advisory: true,
      checked: true,
      checkedAtUtc: new Date().toISOString(),
      slots: slots.map((s) => ({ slotId: s.id, ok, results })),
    }
  } catch (err) {
    logger.warn('ripple rights enrichment failed', { eventId, err })
    return {
      advisory: true,
      checked: false,
      reason: 'CHECK_FAILED',
      error: err instanceof Error ? err.name : 'UnknownError',
    }
  }
}
