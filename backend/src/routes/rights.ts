import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { checkRightsForEvent, checkRightsForEvents, getRightsMatrix } from '../services/rightsChecker.js'
import * as s from '../schemas/rights.js'

const router = Router()

// RD-4 check-slots pagination/day-window constants.
const MS_PER_DAY = 86_400_000
const DEFAULT_SLOT_PAGE = 100
const MAX_SLOT_PAGE = 200
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── RIGHTS POLICIES ────────────────────────────────────────────────────────

// GET /policies — list rights policies (filter by competitionId, territory)
router.get('/policies', authenticate, async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.competitionId) {
      where.competitionId = Number(req.query.competitionId)
    }
    if (req.query.territory) {
      where.territory = { has: req.query.territory as string }
    }

    const policies = await prisma.rightsPolicy.findMany({
      where,
      include: {
        competition: { select: { id: true, name: true, sportId: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(policies)
  } catch (error) {
    next(error)
  }
})

// POST /policies — create policy (admin)
router.post('/policies', authenticate, authorize('admin'), validate({ body: s.policyCreateSchema }), async (req, res, next) => {
  try {
    const {
      competitionId,
      seasonId,
      territory,
      platforms,
      coverageType,
      maxLiveRuns,
      maxPickRunsPerRound,
      windowStartUtc,
      windowEndUtc,
      tapeDelayHoursMin
    } = req.body

    const policy = await prisma.rightsPolicy.create({
      data: {
        tenantId: req.tenantId!,
        competitionId: Number(competitionId),
        seasonId: seasonId ? Number(seasonId) : null,
        territory: territory || [],
        platforms: platforms || [],
        coverageType: coverageType || 'LIVE',
        maxLiveRuns: maxLiveRuns != null ? Number(maxLiveRuns) : null,
        maxPickRunsPerRound: maxPickRunsPerRound != null ? Number(maxPickRunsPerRound) : null,
        windowStartUtc: windowStartUtc ? new Date(windowStartUtc) : null,
        windowEndUtc: windowEndUtc ? new Date(windowEndUtc) : null,
        tapeDelayHoursMin: tapeDelayHoursMin != null ? Number(tapeDelayHoursMin) : null
      },
      include: {
        competition: { select: { id: true, name: true, sportId: true } }
      }
    })

    res.status(201).json(policy)
  } catch (error) {
    next(error)
  }
})

// PUT /policies/:id — update policy (admin)
router.put('/policies/:id', authenticate, authorize('admin'), validate({ params: s.policyIdParam, body: s.policyUpdateSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.rightsPolicy.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId }
    })

    if (!existing) {
      return next(createError(404, 'Rights policy not found'))
    }

    const {
      competitionId,
      seasonId,
      territory,
      platforms,
      coverageType,
      maxLiveRuns,
      maxPickRunsPerRound,
      windowStartUtc,
      windowEndUtc,
      tapeDelayHoursMin
    } = req.body

    const policy = await prisma.rightsPolicy.update({
      where: { id: req.params.id as string },
      data: {
        ...(competitionId != null && { competitionId: Number(competitionId) }),
        ...(seasonId !== undefined && { seasonId: seasonId ? Number(seasonId) : null }),
        ...(territory !== undefined && { territory }),
        ...(platforms !== undefined && { platforms }),
        ...(coverageType !== undefined && { coverageType }),
        ...(maxLiveRuns !== undefined && { maxLiveRuns: maxLiveRuns != null ? Number(maxLiveRuns) : null }),
        ...(maxPickRunsPerRound !== undefined && { maxPickRunsPerRound: maxPickRunsPerRound != null ? Number(maxPickRunsPerRound) : null }),
        ...(windowStartUtc !== undefined && { windowStartUtc: windowStartUtc ? new Date(windowStartUtc) : null }),
        ...(windowEndUtc !== undefined && { windowEndUtc: windowEndUtc ? new Date(windowEndUtc) : null }),
        ...(tapeDelayHoursMin !== undefined && { tapeDelayHoursMin: tapeDelayHoursMin != null ? Number(tapeDelayHoursMin) : null })
      },
      include: {
        competition: { select: { id: true, name: true, sportId: true } }
      }
    })

    res.json(policy)
  } catch (error) {
    next(error)
  }
})

// DELETE /policies/:id — delete policy (admin)
router.delete('/policies/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.rightsPolicy.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId }
    })

    if (!existing) {
      return next(createError(404, 'Rights policy not found'))
    }

    await prisma.rightsPolicy.delete({ where: { id: req.params.id as string } })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

// ─── RUN LEDGER ─────────────────────────────────────────────────────────────

// GET /run-ledger — list runs (filter by eventId, channelId, date range)
router.get('/run-ledger', authenticate, async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.eventId) {
      where.eventId = Number(req.query.eventId)
    }
    if (req.query.channelId) {
      where.channelId = Number(req.query.channelId)
    }
    if (req.query.broadcastSlotId) {
      where.broadcastSlotId = req.query.broadcastSlotId as string
    }
    if (req.query.status) {
      where.status = req.query.status as string
    }

    // Date range filter on startedAtUtc
    if (req.query.dateStart || req.query.dateEnd) {
      const startedAtUtc: Record<string, Date> = {}
      if (req.query.dateStart) {
        startedAtUtc.gte = new Date(req.query.dateStart as string)
      }
      if (req.query.dateEnd) {
        startedAtUtc.lte = new Date(req.query.dateEnd as string)
      }
      where.startedAtUtc = startedAtUtc
    }

    const runs = await prisma.runLedger.findMany({
      where,
      include: {
        broadcastSlot: {
          select: { id: true, channelId: true, eventId: true, plannedStartUtc: true, status: true }
        },
        parentRun: { select: { id: true, runType: true } },
        childRuns: { select: { id: true, runType: true, status: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(runs)
  } catch (error) {
    next(error)
  }
})

// POST /run-ledger — record a run
router.post('/run-ledger', authenticate, authorize('planner', 'admin'), validate({ body: s.runLedgerCreateSchema }), async (req, res, next) => {
  try {
    const {
      broadcastSlotId,
      eventId,
      channelId,
      runType,
      parentRunId,
      startedAtUtc,
      endedAtUtc,
      durationMin,
      status
    } = req.body

    // Validate broadcast slot exists and belongs to tenant
    const slot = await prisma.broadcastSlot.findFirst({
      where: { id: broadcastSlotId, tenantId: req.tenantId }
    })
    if (!slot) {
      return next(createError(404, 'Broadcast slot not found'))
    }

    // If parentRunId is provided, validate it exists
    if (parentRunId) {
      const parent = await prisma.runLedger.findFirst({
        where: { id: parentRunId, tenantId: req.tenantId }
      })
      if (!parent) {
        return next(createError(404, 'Parent run not found'))
      }
    }

    const run = await prisma.runLedger.create({
      data: {
        tenantId: req.tenantId!,
        broadcastSlotId,
        eventId: Number(eventId),
        channelId: Number(channelId),
        runType: runType || 'LIVE',
        parentRunId: parentRunId || null,
        startedAtUtc: startedAtUtc ? new Date(startedAtUtc) : null,
        endedAtUtc: endedAtUtc ? new Date(endedAtUtc) : null,
        durationMin: durationMin != null ? Number(durationMin) : null,
        status: status || 'PENDING'
      },
      include: {
        broadcastSlot: {
          select: { id: true, channelId: true, eventId: true, plannedStartUtc: true }
        }
      }
    })

    res.status(201).json(run)
  } catch (error) {
    next(error)
  }
})

// GET /run-ledger/count/:eventId — get effective run count
// LIVE = 1 each, TAPE_DELAY = 1 each, HIGHLIGHTS = 1 each, CLIP = 1 each
// CONTINUATION runs linked to a parent do NOT count separately
router.get('/run-ledger/count/:eventId', authenticate, async (req, res, next) => {
  try {
    const eventId = Number(req.params.eventId)

    const runs = await prisma.runLedger.findMany({
      where: {
        tenantId: req.tenantId,
        eventId
      },
      select: {
        id: true,
        runType: true,
        parentRunId: true,
        status: true
      }
    })

    // Count effective runs: exclude CONTINUATION runs that have a parentRunId
    let effectiveCount = 0
    const byType: Record<string, number> = {}

    for (const run of runs) {
      // CONTINUATION with a parent is part of the parent run — skip
      if (run.runType === 'CONTINUATION' && run.parentRunId) {
        continue
      }

      effectiveCount++
      const key = run.runType
      byType[key] = (byType[key] || 0) + 1
    }

    res.json({
      eventId,
      effectiveRunCount: effectiveCount,
      byType,
      totalEntries: runs.length
    })
  } catch (error) {
    next(error)
  }
})

// ─── RIGHTS VALIDATION ──────────────────────────────────────────────────────

/**
 * GET /api/rights/check?eventId=123[&territory=BE]
 * Single-event rights evaluation. Resolves contracts, tallies RunLedger,
 * returns ValidationResult[].
 */
router.get('/check', authenticate, async (req, res, next) => {
  try {
    const eventId = Number(req.query.eventId)
    if (!Number.isFinite(eventId) || eventId <= 0) {
      throw createError(400, 'eventId query param is required and must be a positive integer')
    }
    const territory = typeof req.query.territory === 'string' ? req.query.territory : undefined

    // Tenant scope: guard against checking an event that doesn't belong to
    // this tenant. The event lookup inside checkRightsForEvent doesn't
    // filter by tenantId (it's called from workers too), so we verify here.
    const event = await prisma.event.findFirst({
      where: { id: eventId, tenantId: req.tenantId },
      select: { id: true },
    })
    if (!event) throw createError(404, 'Event not found')

    const result = await checkRightsForEvent(eventId, { territory })
    res.json(result)
  } catch (error) { next(error) }
})

/**
 * GET /api/rights/check/batch?eventIds=1,2,3[&territory=BE]
 * Batched variant for list views (planner, dashboard widgets).
 */
router.get('/check/batch', authenticate, async (req, res, next) => {
  try {
    const raw = typeof req.query.eventIds === 'string' ? req.query.eventIds : ''
    const eventIds = raw.split(',')
      .map(s => Number(s.trim()))
      .filter(n => Number.isFinite(n) && n > 0)
    if (eventIds.length === 0) {
      return res.json({})
    }
    if (eventIds.length > 200) {
      throw createError(400, 'Up to 200 eventIds per request')
    }
    const territory = typeof req.query.territory === 'string' ? req.query.territory : undefined

    // Tenant scope: fetch the subset of requested ids that actually belong
    // to this tenant; silently drop the rest rather than leaking existence.
    const owned = await prisma.event.findMany({
      where: { id: { in: eventIds }, tenantId: req.tenantId },
      select: { id: true },
    })
    const ownedIds = owned.map(e => e.id)
    const results = await checkRightsForEvents(ownedIds, { territory })
    res.json(results)
  } catch (error) { next(error) }
})

/**
 * GET /api/rights/check-slots?channelId=&date=YYYY-MM-DD[&territory=&limit=&cursor=]
 * (RD-4) Channel-day rights check: for each BroadcastSlot on the channel that day,
 * return { slotId, ok, results }. Event-less slots emit an INFO note; a linked but
 * unresolvable event emits a WARNING (neither is ever silently dropped as CLEAR).
 * Paginated per ADR-009 (limit + opaque base64url cursor over slot id). Flag parity:
 * window-aware vs legacy results come from the checker's own default
 * (`env.RIGHTS_WINDOWS_ENABLED` inside checkRightsForEvents) — response SHAPE identical.
 */
router.get('/check-slots', authenticate, async (req, res, next) => {
  try {
    const channelId = Number(req.query.channelId)
    if (!Number.isFinite(channelId) || channelId <= 0) {
      throw createError(400, 'channelId query param is required and must be a positive integer')
    }

    const dateStr = typeof req.query.date === 'string' ? req.query.date : ''
    if (!DATE_ONLY_RE.test(dateStr)) {
      throw createError(400, 'date query param is required (YYYY-MM-DD)')
    }
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
    if (Number.isNaN(dayStart.getTime())) {
      throw createError(400, 'date query param is required (YYYY-MM-DD)')
    }
    // Half-open day window: [date, date + 1 day) on plannedStartUtc.
    const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY)

    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_SLOT_PAGE, 1), MAX_SLOT_PAGE)

    // Opaque cursor = base64url(slot uuid). A corrupt cursor is a client error (400),
    // not a Prisma uuid-syntax 500 — decode defensively and validate the shape.
    let cursorId: string | undefined
    const cursorRaw = typeof req.query.cursor === 'string' ? req.query.cursor : undefined
    if (cursorRaw) {
      let decoded: string
      try {
        decoded = Buffer.from(cursorRaw, 'base64url').toString()
      } catch {
        throw createError(400, 'invalid cursor')
      }
      if (!UUID_RE.test(decoded)) throw createError(400, 'invalid cursor')
      cursorId = decoded
    }

    const territory = typeof req.query.territory === 'string' ? req.query.territory : undefined

    const slots = await prisma.broadcastSlot.findMany({
      where: { tenantId: req.tenantId, channelId, plannedStartUtc: { gte: dayStart, lt: dayEnd } },
      orderBy: [{ plannedStartUtc: 'asc' }, { id: 'asc' }],
      take: limit + 1, // fetch one extra to detect hasMore
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: { id: true, eventId: true },
    })

    const hasMore = slots.length > limit
    if (hasMore) slots.pop()

    // Batch the distinct linked eventIds through the checker (window-aware by its own
    // env default), then map back to slots. No windowsEnabled plumbing here — matches
    // the sibling /check and /check/batch routes.
    const eventIds = [...new Set(slots.map(sl => sl.eventId).filter((e): e is number => e != null))]
    const byEvent = eventIds.length > 0
      ? await checkRightsForEvents(eventIds, { territory })
      : {}

    const slotResults = slots.map(slot => {
      if (slot.eventId == null) {
        // Event-less slot: surfaced as an INFO note, never silently dropped.
        return {
          slotId: slot.id,
          ok: true,
          results: [{
            code: 'SLOT_EVENT_MISSING',
            severity: 'INFO' as const,
            scope: ['rights', 'slot'],
            message: `Slot ${slot.id} has no linked event — no rights to check`,
          }],
        }
      }
      const r = byEvent[slot.eventId]
      if (!r) {
        // Linked but unresolvable (event not found / cross-tenant / dropped) — a
        // rights-verification endpoint must NOT report this as a false all-clear.
        return {
          slotId: slot.id,
          ok: false,
          results: [{
            code: 'SLOT_EVENT_UNRESOLVED',
            severity: 'WARNING' as const,
            scope: ['rights', 'slot'],
            message: `Linked event ${slot.eventId} could not be resolved for rights verification`,
          }],
        }
      }
      return { slotId: slot.id, ok: r.ok, results: r.results }
    })

    // After pop(), hasMore guarantees ≥1 remaining slot.
    const nextCursor = hasMore
      ? Buffer.from(slots[slots.length - 1].id).toString('base64url')
      : null

    res.json({ slots: slotResults, nextCursor, hasMore })
  } catch (error) { next(error) }
})

/**
 * GET /api/rights/matrix
 * Per-contract summary for the Rights Matrix page: runs used, days until
 * expiry, platforms, territory, severity bucket.
 */
router.get('/matrix', authenticate, async (req, res, next) => {
  try {
    const rows = await getRightsMatrix(req.tenantId!)
    res.json(rows)
  } catch (error) { next(error) }
})

export default router
