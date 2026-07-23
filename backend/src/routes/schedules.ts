import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { validateSchedule, type ValidationContext, type RightsPolicy } from '../services/validation/index.js'
import { loadContractRunTally } from '../services/validation/runTally.js'
import type { ListedFtaEvent } from '../services/validation/listedEventFta.js'
import type { AccessibilityUnplannedEvent } from '../services/validation/accessibilityUnplanned.js'
import { loadTenantAccessibilityConfig } from '../services/accessibility/tenantConfig.js'
import { beClockToUtc } from '../utils/beClock.js'
import { env } from '../config/env.js'
import { writeOutboxEvent } from '../services/outbox.js'
import { applyOperations, executeOperations, type ScheduleOperation, type SlotState } from '../services/scheduleOperations.js'
import { CHANGEOVER_MIN, CONFIDENCE_DECAY } from '../services/cascade/compute.js'
import * as s from '../schemas/schedules.js'

const router = Router()

/** Load contracts as RightsPolicy DTOs for schedule validation */
async function loadRightsPolicies(tenantId: string, competitionIds: number[]): Promise<RightsPolicy[]> {
  if (competitionIds.length === 0) return []
  const contracts = await prisma.contract.findMany({
    where: {
      tenantId,
      competitionId: { in: competitionIds },
      status: { in: ['valid', 'expiring'] },
    },
  })
  return contracts.map(c => ({
    competitionId: c.competitionId,
    territory: c.territory.length > 0 ? c.territory[0] : undefined,
    // RD-1F: preserve null ("no limit set") — `?? 0` falsely turned it into an explicit limit of 0
    maxLiveRuns: c.maxLiveRuns,
    windowStart: c.windowStartUtc?.toISOString(),
    windowEnd: c.windowEndUtc?.toISOString(),
  }))
}

/** eventId → CONFIRMED|RECONCILED LIVE run `endedAtUtc` (ISO) — ledger-actual live end
 *  for holdback resolution (ADR-015 §4 step 1). */
async function loadLiveRunEndUtcByEventId(tenantId: string, eventIds: number[]): Promise<Record<number, string>> {
  if (eventIds.length === 0) return {}
  const runs = await prisma.runLedger.findMany({
    where: {
      tenantId,
      eventId: { in: eventIds },
      runType: 'LIVE',
      status: { in: ['CONFIRMED', 'RECONCILED'] },
      endedAtUtc: { not: null },
    },
    select: { eventId: true, endedAtUtc: true },
  })
  const map: Record<number, string> = {}
  for (const r of runs) if (r.endedAtUtc) map[r.eventId] = r.endedAtUtc.toISOString()
  return map
}

/**
 * RD-3-T2 (flag ON only): the four window-aware ValidationContext fields — applicable
 * contracts WITH rights windows (status valid|expiring, matching checkRightsForEvent),
 * the per-CATEGORY CONFIRMED|RECONCILED ledger tally (defect-(b): `existingRuns` from
 * the ledger, not `[]`), the per-event ledger live-end, and the flag. One place so the
 * validate + publish routes stay in lock-step.
 */
async function buildWindowContext(
  tenantId: string, competitionIds: number[], eventIds: number[],
): Promise<Partial<ValidationContext>> {
  const contracts = competitionIds.length === 0 ? [] : await prisma.contract.findMany({
    where: { tenantId, competitionId: { in: competitionIds }, status: { in: ['valid', 'expiring'] } },
    include: { rightsWindows: true },
  })
  const contractRunTally = await loadContractRunTally(prisma, tenantId, contracts.map(c => c.id))
  const liveRunEndUtcByEventId = await loadLiveRunEndUtcByEventId(tenantId, eventIds)
  return { contracts, contractRunTally, liveRunEndUtcByEventId, windowsEnabled: true }
}

/**
 * Slot include, gated by BOTH feature flags so flag-OFF shapes stay byte-identical:
 *  - both off → `{ event: true }` (unchanged baseline).
 *  - rights on only → adds `channel { id, types }` (RD-3, unchanged).
 *  - regulatory on → also selects `channel.isFreeToAir` + includes `event.listedCategory`
 *    (RC-1-T3). `channel.timezone` is deliberately NOT selected, so the watershed check
 *    keeps its UTC default and the regulatory flag does not perturb watershed output.
 */
function slotInclude(opts: { windowsEnabled: boolean; regulatoryEnabled: boolean }) {
  if (opts.regulatoryEnabled) {
    return { event: { include: { listedCategory: true } }, channel: { select: { id: true, types: true, isFreeToAir: true } } }
  }
  if (opts.windowsEnabled) {
    return { event: true as const, channel: { select: { id: true, types: true } } }
  }
  return { event: true as const }
}

const MS_PER_MINUTE = 60_000

/** Map DB events (with listedCategory) → the pure LISTED_EVENT_FTA input (flag ON only).
 *  Window uses the shared `beClockToUtc` — same derivation as the rights checker (a fact). */
function buildListedFtaEvents(events: any[]): ListedFtaEvent[] {
  const out: ListedFtaEvent[] = []
  for (const e of events) {
    if (e.listedCategoryId == null || e.listedCategory == null) continue
    const startUtc = e.startDateBE && e.startTimeBE ? beClockToUtc(e.startDateBE, e.startTimeBE) : null
    const endUtc = startUtc && e.durationMin != null
      ? new Date(startUtc.getTime() + e.durationMin * MS_PER_MINUTE)
      : null
    out.push({ id: e.id, isLive: e.isLive, startUtc, endUtc, fullLiveRequired: e.listedCategory.fullLiveRequired === true })
  }
  return out
}

/**
 * RC-2-T3 (flag ON only): events + their AccessibilityDeliverable rows for the
 * stage-4 ACCESSIBILITY_UNPLANNED lead-time check. Tenant-scoped read; `now` is
 * injected HERE so the pure check never reads the clock. Lead time N is threaded by
 * the caller from the per-tenant config loader (RC-5-T2; constant fallback) — still
 * no per-REQUEST override.
 */
async function buildAccessibilityUnplannedInput(
  tenantId: string, eventIds: number[],
): Promise<{ events: AccessibilityUnplannedEvent[]; now: Date }> {
  const now = new Date()
  if (eventIds.length === 0) return { events: [], now }
  const rows = await prisma.accessibilityDeliverable.findMany({
    where: { tenantId, eventId: { in: eventIds } },
    select: { eventId: true, type: true, status: true },
  })
  const byEvent = new Map<number, AccessibilityUnplannedEvent>()
  for (const row of rows) {
    const bucket = byEvent.get(row.eventId)
    if (bucket) bucket.deliverables.push({ type: row.type, status: row.status })
    else byEvent.set(row.eventId, { id: row.eventId, deliverables: [{ type: row.type, status: row.status }] })
  }
  return { events: [...byEvent.values()], now }
}

/**
 * Build the stage 1-5 ValidationContext for the validate + publish routes — ONE place
 * so the two routes stay in lock-step (was hand-duplicated). Flag OFF for both flags →
 * base context only (rightsPolicies + `existingRuns: []`), byte-identical to baseline.
 */
async function buildScheduleValidationContext(
  tenantId: string,
  events: any[],
  flags: { windowsEnabled: boolean; regulatoryEnabled: boolean },
): Promise<ValidationContext> {
  const competitionIds = [...new Set(events.map(e => e.competitionId).filter(Boolean))] as number[]
  const rightsPolicies = await loadRightsPolicies(tenantId, competitionIds)
  const context: ValidationContext = { rightsPolicies, existingRuns: [], events }

  // Flag ON: window-aware rights (contracts+windows+tally). Flag OFF: skipped — unchanged.
  if (flags.windowsEnabled) {
    Object.assign(context, await buildWindowContext(tenantId, competitionIds, events.map(e => e.id)))
  }
  // Flag ON: stage-4 listed-events FTA + accessibility lead-time. Flag OFF: skipped —
  // stage 4 byte-identical (no extra query either).
  if (flags.regulatoryEnabled) {
    context.listedFtaEvents = buildListedFtaEvents(events)
    // RC-5-T2: lead time N via the per-tenant config loader (constant fallback when no
    // row — passing the effective value is parity with the check's own default).
    const accessibilityConfig = await loadTenantAccessibilityConfig(prisma, tenantId)
    context.accessibilityUnplanned = {
      ...(await buildAccessibilityUnplannedInput(tenantId, events.map(e => e.id))),
      leadTimeDays: accessibilityConfig.unplannedLeadTimeDays,
    }
    context.regulatoryEnabled = true
  }
  return context
}

// ─── SCHEDULE DRAFTS ─────────────────────────────────────────────────────────

// POST /api/schedule-drafts — create draft
router.post('/', authenticate, authorize('planner', 'admin'), validate({ body: s.draftCreateSchema }), async (req, res, next) => {
  try {
    const { channelId, dateRangeStart, dateRangeEnd } = req.body

    // Verify channel belongs to tenant
    const channel = await prisma.channel.findFirst({
      where: { id: channelId, tenantId: req.tenantId }
    })
    if (!channel) return next(createError(404, 'Channel not found'))

    const draft = await prisma.scheduleDraft.create({
      data: {
        tenantId: req.tenantId!,
        channelId,
        dateRangeStart: new Date(dateRangeStart),
        dateRangeEnd: new Date(dateRangeEnd),
        operations: [],
        version: 1,
        status: 'EDITING'
      },
      include: {
        channel: { select: { id: true, name: true, color: true } }
      }
    })

    res.status(201).json(draft)
  } catch (error: any) {
    // Unique constraint violation — draft already exists for this channel+range
    if (error.code === 'P2002') {
      return next(createError(409, 'A draft already exists for this channel and date range'))
    }
    next(error)
  }
})

// GET /api/schedule-drafts — list drafts (filter by channelId, status)
router.get('/', validate({ query: s.draftsQuery }), async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.channelId) {
      where.channelId = Number(req.query.channelId)
    }
    if (req.query.status) {
      where.status = req.query.status as string
    }

    const drafts = await prisma.scheduleDraft.findMany({
      where,
      include: {
        channel: { select: { id: true, name: true, color: true } },
        _count: { select: { versions: true } }
      },
      orderBy: { updatedAt: 'desc' }
    })

    res.json(drafts)
  } catch (error) {
    next(error)
  }
})

// GET /api/schedule-drafts/:id — get draft with materialized slots
router.get('/:id', async (req, res, next) => {
  try {
    const draft = await prisma.scheduleDraft.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId },
      include: {
        channel: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 5,
          select: {
            id: true,
            versionNumber: true,
            publishedAt: true,
            publishedBy: true,
            isEmergency: true,
            reasonCode: true
          }
        }
      }
    })

    if (!draft) return next(createError(404, 'Schedule draft not found'))

    // Materialize slots: load BroadcastSlots for this channel in the date range
    const slots = await prisma.broadcastSlot.findMany({
      where: {
        tenantId: req.tenantId,
        channelId: draft.channelId,
        plannedStartUtc: {
          gte: new Date(draft.dateRangeStart),
          lte: new Date(new Date(draft.dateRangeEnd).getTime() + 24 * 60 * 60 * 1000)
        }
      },
      include: {
        event: { select: { id: true, participants: true, sportId: true, competitionId: true } },
        channel: { select: { id: true, name: true, color: true } }
      },
      orderBy: { plannedStartUtc: 'asc' }
    })

    res.json({ ...draft, slots })
  } catch (error) {
    next(error)
  }
})

// PATCH /api/schedule-drafts/:id — append operations (optimistic locking via version)
router.patch('/:id', authenticate, authorize('planner', 'admin'), validate({ params: s.draftIdParam, body: s.draftPatchSchema }), async (req, res, next) => {
  try {
    const { version, operations } = req.body

    const draft = await prisma.scheduleDraft.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId }
    })

    if (!draft) return next(createError(404, 'Schedule draft not found'))

    if (draft.status === 'PUBLISHED') {
      return next(createError(400, 'Cannot modify a published draft'))
    }

    // Atomic optimistic lock: version check + update in one query
    const existingOps = (draft.operations as any[]) || []
    const result = await prisma.scheduleDraft.updateMany({
      where: { id: draft.id, version },
      data: {
        operations: [...existingOps, ...operations] as any,
        version: { increment: 1 },
        status: 'EDITING'
      }
    })

    if (result.count === 0) {
      // Re-fetch to get current version for the error response
      const current = await prisma.scheduleDraft.findFirst({ where: { id: draft.id } })
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${version}, but current version is ${current?.version}`,
        currentVersion: current?.version,
        currentDraft: current
      })
    }

    const updated = await prisma.scheduleDraft.findFirst({
      where: { id: draft.id },
      include: {
        channel: { select: { id: true, name: true, color: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    next(error)
  }
})

// POST /api/schedule-drafts/:id/validate — dry-run validation
router.post('/:id/validate', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const draft = await prisma.scheduleDraft.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId }
    })

    if (!draft) return next(createError(404, 'Schedule draft not found'))

    const windowsEnabled = env.RIGHTS_WINDOWS_ENABLED
    const regulatoryEnabled = env.REGULATORY_COMPLIANCE_ENABLED

    // Load slots for validation
    const slots = await prisma.broadcastSlot.findMany({
      where: {
        tenantId: req.tenantId,
        channelId: draft.channelId,
        plannedStartUtc: {
          gte: new Date(draft.dateRangeStart),
          lte: new Date(new Date(draft.dateRangeEnd).getTime() + 24 * 60 * 60 * 1000)
        }
      },
      include: slotInclude({ windowsEnabled, regulatoryEnabled }),
      orderBy: { plannedStartUtc: 'asc' }
    })

    // Build validation context (rights policies + flag-gated window / regulatory data).
    const events = slots.map(s => s.event).filter((e): e is NonNullable<typeof e> => e != null)
    const context = await buildScheduleValidationContext(req.tenantId!, events, { windowsEnabled, regulatoryEnabled })

    const results = validateSchedule(slots as any[], context)

    res.json({
      draftId: draft.id,
      slotCount: slots.length,
      results,
      errorCount: results.filter(r => r.severity === 'ERROR').length,
      warningCount: results.filter(r => r.severity === 'WARNING').length
    })
  } catch (error) {
    next(error)
  }
})

// POST /api/schedule-drafts/:id/validate-slot — inline single-slot validation
router.post('/:id/validate-slot', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const draft = await prisma.scheduleDraft.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId },
    })
    if (!draft) return next(createError(404, 'Draft not found'))

    const { slot } = req.body as { slot: any }
    if (!slot) return next(createError(400, 'slot is required'))

    // Only load temporal neighbors — a single-slot validation can't care about
    // slots outside the draft's date window.
    const allSlots = await prisma.broadcastSlot.findMany({
      where: {
        tenantId: req.tenantId,
        channelId: draft.channelId,
        plannedStartUtc: {
          gte: new Date(draft.dateRangeStart),
          lte: new Date(new Date(draft.dateRangeEnd).getTime() + 24 * 60 * 60 * 1000),
        },
      },
      include: { event: true, channel: true },
    })

    const slotsForValidation = allSlots.filter(s => s.id !== slot.id).concat([slot])
    const results = validateSchedule(slotsForValidation, { rightsPolicies: [], events: [] })
    const slotResults = results.filter(r => r.scope.includes(slot.id))

    res.json({ results: slotResults })
  } catch (err) { next(err) }
})

// POST /api/schedule-drafts/:id/preview-cascade — read-only cascade what-if preview
router.post('/:id/preview-cascade', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const draft = await prisma.scheduleDraft.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId }
    })

    if (!draft) return next(createError(404, 'Schedule draft not found'))

    const draftOps = ((draft.operations as any[]) || []) as ScheduleOperation[]
    if (draftOps.length === 0) {
      return res.json({ courts: [] })
    }

    // Load base slots for this channel in the date range
    const baseSlots = await prisma.broadcastSlot.findMany({
      where: {
        tenantId: req.tenantId,
        channelId: draft.channelId,
        plannedStartUtc: {
          gte: new Date(draft.dateRangeStart),
          lte: new Date(new Date(draft.dateRangeEnd).getTime() + 24 * 60 * 60 * 1000)
        }
      },
      orderBy: { plannedStartUtc: 'asc' }
    })

    // Convert DB slots to SlotState for applyOperations
    const slotStates: SlotState[] = baseSlots.map(s => ({
      id: s.id,
      channelId: s.channelId ?? 0,
      eventId: s.eventId ?? undefined,
      schedulingMode: s.schedulingMode,
      plannedStartUtc: s.plannedStartUtc?.toISOString() ?? '',
      plannedEndUtc: s.plannedEndUtc?.toISOString() ?? '',
      estimatedStartUtc: s.estimatedStartUtc?.toISOString(),
      estimatedEndUtc: s.estimatedEndUtc?.toISOString(),
      bufferBeforeMin: s.bufferBeforeMin ?? 15,
      bufferAfterMin: s.bufferAfterMin ?? 10,
      expectedDurationMin: s.expectedDurationMin ?? undefined,
      overrunStrategy: s.overrunStrategy,
      anchorType: s.anchorType,
      contentSegment: s.contentSegment,
      status: s.status,
      sportMetadata: (s.sportMetadata as Record<string, unknown>) ?? {},
    }))

    // Apply pending operations (pure, no DB writes)
    const computed = applyOperations(slotStates, draftOps)

    // Group by court_id from sportMetadata
    const courtGroups = new Map<number, SlotState[]>()
    for (const slot of computed) {
      const courtId = (slot.sportMetadata?.court_id as number) ?? 0
      if (!courtGroups.has(courtId)) courtGroups.set(courtId, [])
      courtGroups.get(courtId)!.push(slot)
    }

    const courts = Array.from(courtGroups.entries()).map(([courtId, slots]) => {
      // Sort by order_on_court or plannedStartUtc
      slots.sort((a, b) => {
        const orderA = (a.sportMetadata?.order_on_court as number) ?? Infinity
        const orderB = (b.sportMetadata?.order_on_court as number) ?? Infinity
        if (orderA !== orderB) return orderA - orderB
        return new Date(a.plannedStartUtc).getTime() - new Date(b.plannedStartUtc).getTime()
      })

      // Preview semantics: first slot is certain (confidence = 1.0); downstream
      // slots decay by CONFIDENCE_DECAY — the authoritative convention
      // (ADR-008 Decision 1; engine parity behind CASCADE_PREVIEW_PARITY).
      // Constants come from the shared compute module so they can't drift.
      let confidence = 1.0
      let prevEndMs: number | null = null

      const estimates = slots.map(slot => {
        const plannedStart = new Date(slot.plannedStartUtc).getTime()
        const plannedEnd = new Date(slot.plannedEndUtc).getTime()
        const durationMs = slot.expectedDurationMin
          ? slot.expectedDurationMin * 60_000
          : plannedEnd - plannedStart

        let estimatedStartMs: number
        if (prevEndMs !== null) {
          estimatedStartMs = prevEndMs + CHANGEOVER_MIN * 60_000
          confidence *= CONFIDENCE_DECAY
        } else {
          estimatedStartMs = plannedStart
        }

        const estimatedEndMs = estimatedStartMs + durationMs
        prevEndMs = estimatedEndMs

        return {
          slotId: slot.id,
          estimatedStartUtc: new Date(estimatedStartMs).toISOString(),
          estimatedEndUtc: new Date(estimatedEndMs).toISOString(),
          confidence: Math.round(confidence * 100) / 100,
        }
      })

      return { courtId, estimates }
    })

    res.json({ courts })
  } catch (error) {
    next(error)
  }
})

// POST /api/schedule-drafts/:id/publish — validate + create ScheduleVersion
router.post('/:id/publish', authenticate, authorize('planner', 'admin'), validate({ params: s.draftIdParam, body: s.draftPublishSchema }), async (req, res, next) => {
  try {
    const { acknowledgeWarnings, isEmergency, reasonCode } = req.body

    const draft = await prisma.scheduleDraft.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId }
    })

    if (!draft) return next(createError(404, 'Schedule draft not found'))
    if (draft.status === 'PUBLISHED') {
      return next(createError(400, 'Draft is already published'))
    }

    const windowsEnabled = env.RIGHTS_WINDOWS_ENABLED
    const regulatoryEnabled = env.REGULATORY_COMPLIANCE_ENABLED

    // Load slots for validation and snapshot
    let slots = await prisma.broadcastSlot.findMany({
      where: {
        tenantId: req.tenantId,
        channelId: draft.channelId,
        plannedStartUtc: {
          gte: new Date(draft.dateRangeStart),
          lte: new Date(new Date(draft.dateRangeEnd).getTime() + 24 * 60 * 60 * 1000)
        }
      },
      include: slotInclude({ windowsEnabled, regulatoryEnabled }),
      orderBy: { plannedStartUtc: 'asc' }
    })

    // Validate with contracts as rights policies (+ flag-gated window / regulatory data).
    const pubEvents = slots.map(s => s.event).filter((e): e is NonNullable<typeof e> => e != null)
    const context = await buildScheduleValidationContext(req.tenantId!, pubEvents, { windowsEnabled, regulatoryEnabled })

    const results = validateSchedule(slots as any[], context)
    const errors = results.filter(r => r.severity === 'ERROR')
    const warnings = results.filter(r => r.severity === 'WARNING')

    // Block on errors (unless emergency override)
    if (errors.length > 0 && !isEmergency) {
      return res.status(422).json({
        error: 'Validation failed',
        results,
        errorCount: errors.length,
        warningCount: warnings.length
      })
    }

    // Block on unacknowledged warnings
    if (warnings.length > 0 && !acknowledgeWarnings && !isEmergency) {
      return res.status(422).json({
        error: 'Unacknowledged warnings',
        message: 'Set acknowledgeWarnings: true to publish with warnings, or isEmergency: true to override all.',
        results,
        errorCount: errors.length,
        warningCount: warnings.length
      })
    }

    // Determine next version number
    const lastVersion = await prisma.scheduleVersion.findFirst({
      where: { draftId: draft.id },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true }
    })
    const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1

    // Execute pending operations to materialize slot changes
    const draftOps = ((draft.operations as any[]) || []) as ScheduleOperation[]
    if (draftOps.length > 0) {
      await prisma.$transaction(async (tx) => {
        await executeOperations(tx, req.tenantId!, draftOps)
      })
      // Re-fetch slots after operations applied
      slots = await prisma.broadcastSlot.findMany({
        where: {
          tenantId: req.tenantId,
          channelId: draft.channelId,
          plannedStartUtc: {
            gte: new Date(draft.dateRangeStart),
            lte: new Date(new Date(draft.dateRangeEnd).getTime() + 24 * 60 * 60 * 1000)
          }
        },
        include: slotInclude({ windowsEnabled, regulatoryEnabled }),
        orderBy: { plannedStartUtc: 'asc' }
      })
    }

    // Create snapshot and version in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the immutable version
      const version = await tx.scheduleVersion.create({
        data: {
          tenantId: req.tenantId!,
          channelId: draft.channelId,
          draftId: draft.id,
          versionNumber: nextVersionNumber,
          snapshot: slots as any,
          publishedBy: (req.user as any)?.email || 'unknown',
          isEmergency: isEmergency || false,
          reasonCode: reasonCode || null,
          acknowledgedWarnings: warnings.map(w => w.code)
        }
      })

      // Update BroadcastSlot.scheduleVersionId for all slots in this draft
      await tx.broadcastSlot.updateMany({
        where: {
          id: { in: slots.map(s => s.id) }
        },
        data: {
          scheduleVersionId: version.id
        }
      })

      // Mark draft as published
      await tx.scheduleDraft.update({
        where: { id: draft.id },
        data: {
          status: 'PUBLISHED',
          version: draft.version + 1
        }
      })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: isEmergency ? 'schedule.emergency_published' : 'schedule.published',
        aggregateType: 'ScheduleVersion',
        aggregateId: version.id,
        payload: { versionId: version.id, draftId: draft.id, channelId: draft.channelId, slotCount: slots.length, isEmergency: isEmergency || false },
        priority: isEmergency ? 'HIGH' : 'NORMAL',
      })

      return version
    })

    res.status(201).json({
      version: result,
      slotCount: slots.length,
      validationResults: results
    })
  } catch (error) {
    next(error)
  }
})

// Schedule version routes live at /api/schedule-versions — see routes/scheduleVersions.ts

export default router
