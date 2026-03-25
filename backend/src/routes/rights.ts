import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import * as s from '../schemas/rights.js'

const router = Router()

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

export default router
