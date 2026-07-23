/**
 * SV-2-T2 — FEED-change capture → RippleProposal (ADR-019 §2: FEED proposes,
 * MANUAL stays auto via eventSlotBridge, CASCADE stays auto to estimated*).
 *
 * Called from the ONE import seam that updates existing events
 * (`import/stages/provision.ts` → `updateImportedEvent`), INSIDE the caller's
 * transaction: the proposal + its outbox record commit or roll back with the
 * event write (ADR-001; TD-14 lesson). The event row itself is written by the
 * caller BEFORE this runs and is byte-identical flag on or off — feed stays
 * authoritative for event data; the PENDING window's event≠slot divergence IS
 * the surfaced staleness (G8), and NO slot is written here (SV-3 owns apply).
 * (Note: `updateImportedEvent`'s `db` param defaults to the root prisma client
 * — pre-existing signature; every real caller passes a tx. Make it required on
 * the next touch of that seam.)
 *
 * Flag: `SCHEDULE_RIPPLE_ENABLED` (build-time per TD-27), read at this service
 * boundary via `opts.rippleEnabled ?? env` (rightsChecker `windowsEnabled`
 * pattern). Flag OFF returns before ANY query — byte-identical DB traffic to
 * today's import path.
 *
 * Idempotency: `sourceChangeId` is the change-fingerprint composed in
 * `./capturePayloads.ts` (decision + tradeoff documented there); an existing
 * (tenantId, sourceChangeId) row is echoed unchanged — no duplicate, no
 * supersession, no second outbox row. Race note: two concurrent imports of the
 * same change can both miss the findFirst and race the unique index; the loser
 * aborts its import tx (P2002) and the NEXT FEED RUN owns the retry — its
 * re-import takes the echo path against the winner's identical row, so the
 * eventual-consistency window is one import cycle and never yields a duplicate
 * proposal (same posture as the RD-2 idempotent create).
 *
 * Supersession: a NEW change for an event marks that event's PENDING proposals
 * (ANY source — SV-3+ may add CASCADE/MANUAL sources) SUPERSEDED, keeping a
 * single PENDING proposal per event.
 */
import type { Prisma, RippleProposal, Event } from '@prisma/client'
import { env } from '../../config/env.js'
import { rippleProposalCaptureDuration, rippleProposalsCaptured } from '../../metrics.js'
import { deriveSlotSyncValues, DEFAULT_CHANNEL_TIMEZONE, type DerivedSlotSyncValues } from '../eventSlotBridge.js'
import { writeOutboxEventDeduped } from '../outbox.js'
import { buildAdvisoryRightsAnnotations } from './enrichment.js'
import {
  detectFeedScheduleChange,
  composeFeedSourceChangeId,
  buildBeforeSlots,
  buildPreview,
} from './capturePayloads.js'

export interface FeedRippleCaptureInput {
  /** The event row BEFORE the feed write (trigger-field comparison base). */
  beforeEvent: Pick<Event, 'channelId' | 'startDateBE' | 'startTimeBE' | 'durationMin' | 'status'>
  /** The event row AS WRITTEN by the feed (id/tenantId are the row's own — never client input). */
  afterEvent: Pick<
    Event,
    'id' | 'tenantId' | 'channelId' | 'startDateBE' | 'startTimeBE' | 'durationMin' | 'status'
  >
  sourceId: string
  sourceRecordId: string
}

/** Columns the payload builders need — the proposed-field subset + handles. */
const SLOT_SELECT = {
  id: true,
  autoLinked: true,
  channelId: true,
  plannedStartUtc: true,
  plannedEndUtc: true,
  expectedDurationMin: true,
  status: true,
  updatedAt: true,
} as const

/**
 * Capture a FEED schedule change as a RippleProposal. Returns the (created or
 * echoed) proposal, or null when nothing is proposable (flag off, no
 * trigger-field change, or no linked slots).
 */
export async function captureFeedRipple(
  tx: Prisma.TransactionClient,
  input: FeedRippleCaptureInput,
  opts: { rippleEnabled?: boolean } = {},
): Promise<RippleProposal | null> {
  const enabled = opts.rippleEnabled ?? env.SCHEDULE_RIPPLE_ENABLED
  if (!enabled) return null

  const { beforeEvent, afterEvent, sourceId, sourceRecordId } = input

  const { hasChanges, changedFields } = detectFeedScheduleChange(beforeEvent, afterEvent)
  if (!hasChanges) return null

  // Capture duration (ADR-019 OA1 SLO: < 5s p95 incl. enrichment) — timed
  // across the FULL capture; observed only when a proposal is created below.
  const startedAt = process.hrtime.bigint()

  // Tenant scope comes from the OWNING event row (TD-31 lesson).
  const slots = await tx.broadcastSlot.findMany({
    where: { tenantId: afterEvent.tenantId, eventId: afterEvent.id },
    select: SLOT_SELECT,
  })
  // No linked slots → nothing to ripple; the event updates as today (ADR-019 §2).
  if (slots.length === 0) return null

  const sourceChangeId = composeFeedSourceChangeId({
    eventId: afterEvent.id,
    sourceId,
    sourceRecordId,
    after: {
      channelId: afterEvent.channelId,
      startDateBE: afterEvent.startDateBE,
      startTimeBE: afterEvent.startTimeBE,
      durationMin: afterEvent.durationMin,
      status: afterEvent.status,
    },
  })

  // Idempotent echo — takes precedence over supersession: a feed retry/replay
  // of the SAME change returns the same proposal untouched.
  const echoed = await tx.rippleProposal.findFirst({
    where: { tenantId: afterEvent.tenantId, sourceChangeId },
  })
  if (echoed) {
    rippleProposalsCaptured.inc({ outcome: 'echoed' })
    return echoed
  }

  // Derive what the bridge (SV-3's apply) WOULD write — single source of truth
  // (deriveSlotSyncValues). Channel lookup mirrors syncEventToSlot: tenant-scoped
  // so a stale/foreign channelId can't leak another tenant's timezone.
  let derived: DerivedSlotSyncValues | null = null
  if (afterEvent.channelId) {
    const channel = await tx.channel.findFirst({
      where: { id: afterEvent.channelId, tenantId: afterEvent.tenantId },
      select: { timezone: true },
    })
    if (channel) {
      derived = deriveSlotSyncValues(afterEvent, channel.timezone ?? DEFAULT_CHANNEL_TIMEZONE)
    }
  }

  const beforeSlots = buildBeforeSlots(slots)
  // Advisory rights enrichment (SV-2-T3): runs on THIS tx (post-change event
  // values); never throws — failure annotates checked:false (TD-18 lesson).
  const rights = await buildAdvisoryRightsAnnotations(tx, afterEvent.id, slots)
  const preview = buildPreview(slots, derived, rights)

  // Supersession: the new change replaces the event's pending review item(s).
  await tx.rippleProposal.updateMany({
    where: { tenantId: afterEvent.tenantId, eventId: afterEvent.id, status: 'PENDING' },
    data: { status: 'SUPERSEDED' },
  })

  const proposal = await tx.rippleProposal.create({
    data: {
      tenantId: afterEvent.tenantId,
      eventId: afterEvent.id,
      source: 'FEED',
      sourceChangeId,
      beforeSlots: beforeSlots as unknown as Prisma.JsonArray,
      preview: preview as unknown as Prisma.JsonObject,
      // confidence deliberately unset: NULL in v1 (no feed-confidence source).
    },
  })

  // Outbox IN THE SAME TX (ADR-001), deterministic key WITH tenantId — the
  // idempotencyKey column is a GLOBAL unique (TD-13 settlement lesson).
  await writeOutboxEventDeduped(tx, {
    tenantId: afterEvent.tenantId,
    eventType: 'ripple_proposal.created',
    aggregateType: 'RippleProposal',
    aggregateId: proposal.id,
    payload: {
      proposalId: proposal.id,
      eventId: afterEvent.id,
      source: 'FEED',
      sourceChangeId,
      changedFields,
    },
    idempotencyKey: `ripple_proposal.created:${afterEvent.tenantId}:${sourceChangeId}`,
  })

  rippleProposalCaptureDuration.observe(Number(process.hrtime.bigint() - startedAt) / 1e9)
  rippleProposalsCaptured.inc({ outcome: 'created' })

  return proposal
}
