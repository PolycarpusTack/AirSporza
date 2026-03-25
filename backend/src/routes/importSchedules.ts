import { Router } from 'express'
import cron from 'node-cron'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { registerJob, stopJob } from '../services/importScheduler.js'
import * as s from '../schemas/importSchedules.js'

const router = Router()

router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const schedules = await prisma.importSchedule.findMany({
      where: { tenantId: req.tenantId },
      include: { source: { select: { code: true, name: true } } },
    })
    res.json(schedules)
  } catch (error) {
    next(error)
  }
})

router.post('/', authenticate, authorize('admin'), validate({ body: s.createSchema }), async (req, res, next) => {
  try {
    if (!cron.validate(req.body.cronExpr)) return next(createError(400, 'Invalid cron expression'))

    const schedule = await prisma.importSchedule.create({ data: { ...req.body, tenantId: req.tenantId! } })
    if (req.body.isEnabled !== false) {
      const src = await prisma.importSource.findUnique({ where: { id: req.body.sourceId }, select: { code: true } })
      if (!src) return next(createError(500, 'Import source not found after creation'))
      registerJob(schedule.id, schedule.cronExpr, src.code)
    }
    res.status(201).json(schedule)
  } catch (error) {
    next(error)
  }
})

router.patch('/:id', authenticate, authorize('admin'), validate({ params: s.scheduleIdParam, body: s.patchSchema }), async (req, res, next) => {
  try {
    const id = String(req.params.id)
    if (req.body.cronExpr !== undefined && !cron.validate(req.body.cronExpr)) {
      return next(createError(400, 'Invalid cron expression'))
    }

    const schedule = await prisma.importSchedule.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { source: true },
    })
    if (!schedule) return next(createError(404, 'Schedule not found'))

    const updated = await prisma.importSchedule.update({
      where: { id: schedule.id },
      data: req.body,
    })

    if (updated.isEnabled) {
      registerJob(updated.id, updated.cronExpr, schedule.source.code)
    } else {
      stopJob(updated.id)
    }
    res.json(updated)
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const schedule = await prisma.importSchedule.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!schedule) return next(createError(404, 'Schedule not found'))
    stopJob(schedule.id)
    await prisma.importSchedule.delete({ where: { id: schedule.id } })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
