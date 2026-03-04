import { Router } from 'express'
import Joi from 'joi'
import cron from 'node-cron'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { registerJob, stopJob } from '../services/importScheduler.js'

const router = Router()

const createSchema = Joi.object({
  sourceId: Joi.string().required(),
  cronExpr: Joi.string().required(),
  isEnabled: Joi.boolean(),
})

const patchSchema = Joi.object({
  cronExpr: Joi.string(),
  isEnabled: Joi.boolean(),
}).min(1)

router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const schedules = await prisma.importSchedule.findMany({
      include: { source: { select: { code: true, name: true } } },
    })
    res.json(schedules)
  } catch (error) {
    next(error)
  }
})

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    if (!cron.validate(value.cronExpr)) return next(createError(400, 'Invalid cron expression'))

    const schedule = await prisma.importSchedule.create({ data: value })
    if (value.isEnabled !== false) {
      const src = await prisma.importSource.findUnique({ where: { id: value.sourceId }, select: { code: true } })
      if (!src) return next(createError(500, 'Import source not found after creation'))
      registerJob(schedule.id, schedule.cronExpr, src.code)
    }
    res.status(201).json(schedule)
  } catch (error) {
    next(error)
  }
})

router.patch('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const { error, value } = patchSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    if (value.cronExpr !== undefined && !cron.validate(value.cronExpr)) {
      return next(createError(400, 'Invalid cron expression'))
    }

    const schedule = await prisma.importSchedule.findUnique({
      where: { id },
      include: { source: true },
    })
    if (!schedule) return next(createError(404, 'Schedule not found'))

    const updated = await prisma.importSchedule.update({
      where: { id: schedule.id },
      data: value,
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
    const schedule = await prisma.importSchedule.findUnique({ where: { id } })
    if (!schedule) return next(createError(404, 'Schedule not found'))
    stopJob(schedule.id)
    await prisma.importSchedule.delete({ where: { id: schedule.id } })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
