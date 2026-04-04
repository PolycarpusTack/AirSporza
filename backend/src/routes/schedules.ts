import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { validateSchedule, type ValidationContext, type RightsPolicy } from '../services/validation/index.js'
import { writeOutboxEvent } from '../services/outbox.js'
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
    maxLiveRuns: c.maxLiveRuns ?? 0,
    windowStart: c.windowStartUtc?.toISOString(),
    windowEnd: c.windowEndUtc?.toISOString(),
  }))
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
      include: {
        event: true
      },
      orderBy: { plannedStartUtc: 'asc' }
    })

    // Build validation context with contracts as rights policies
    const events = slots.map(s => s.event).filter((e): e is NonNullable<typeof e> => e != null)
    const competitionIds = [...new Set(events.map(e => e.competitionId).filter(Boolean))]
    const rightsPolicies = await loadRightsPolicies(req.tenantId!, competitionIds)
    const context: ValidationContext = {
      rightsPolicies,
      existingRuns: [],
      events,
    }

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

    const allSlots = await prisma.broadcastSlot.findMany({
      where: { tenantId: req.tenantId, channelId: draft.channelId },
      include: { event: true, channel: true },
    })

    const slotsForValidation = allSlots.filter(s => s.id !== slot.id).concat([slot])
    const results = validateSchedule(slotsForValidation, { rightsPolicies: [], events: [] })
    const slotResults = results.filter(r => r.scope.includes(slot.id))

    res.json({ results: slotResults })
  } catch (err) { next(err) }
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

    // Load slots for validation and snapshot
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
        event: true
      },
      orderBy: { plannedStartUtc: 'asc' }
    })

    // Validate with contracts as rights policies
    const pubEvents = slots.map(s => s.event).filter((e): e is NonNullable<typeof e> => e != null)
    const pubCompetitionIds = [...new Set(pubEvents.map(e => e.competitionId).filter(Boolean))]
    const pubRightsPolicies = await loadRightsPolicies(req.tenantId!, pubCompetitionIds)
    const context: ValidationContext = {
      rightsPolicies: pubRightsPolicies,
      existingRuns: [],
      events: pubEvents,
    }

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

// ─── SCHEDULE VERSIONS ───────────────────────────────────────────────────────

// GET /api/schedule-drafts/versions/list — list published versions
router.get('/versions/list', async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.channelId) {
      where.channelId = Number(req.query.channelId)
    }
    if (req.query.draftId) {
      where.draftId = req.query.draftId as string
    }

    const versions = await prisma.scheduleVersion.findMany({
      where,
      include: {
        channel: { select: { id: true, name: true, color: true } },
        draft: { select: { id: true, dateRangeStart: true, dateRangeEnd: true } }
      },
      orderBy: { publishedAt: 'desc' }
    })

    res.json(versions)
  } catch (error) {
    next(error)
  }
})

// GET /api/schedule-drafts/versions/:id — get version snapshot
router.get('/versions/:id', async (req, res, next) => {
  try {
    const version = await prisma.scheduleVersion.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId },
      include: {
        channel: true,
        draft: { select: { id: true, dateRangeStart: true, dateRangeEnd: true, channelId: true } },
        broadcastSlots: {
          include: {
            event: { select: { id: true, participants: true, sportId: true } }
          },
          orderBy: { plannedStartUtc: 'asc' }
        }
      }
    })

    if (!version) return next(createError(404, 'Schedule version not found'))

    res.json(version)
  } catch (error) {
    next(error)
  }
})

export default router
