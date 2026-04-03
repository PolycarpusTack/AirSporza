import { Router } from 'express'
import cron from 'node-cron'
import { prisma } from '../db/prisma.js'
import { createError } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validate.js'
import { authorize } from '../middleware/auth.js'
import { registerSchedule, unregisterSchedule } from '../integrations/integrationScheduler.js'
import { z } from 'zod'

const createScheduleSchema = z.object({
  cronExpression: z.string().min(1),
  jobType: z.enum(['IMPORT', 'EXPORT']),
  jobConfig: z.record(z.string(), z.unknown()).optional().default({}),
})

const updateScheduleSchema = z.object({
  cronExpression: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  jobConfig: z.record(z.string(), z.unknown()).optional(),
})

const router = Router({ mergeParams: true })

// GET /api/integrations/:id/schedules
router.get('/', authorize('admin'), async (req, res, next) => {
  try {
    const integrationId = String(req.params.id)
    const schedules = await prisma.integrationSchedule.findMany({
      where: { integrationId },
      orderBy: { createdAt: 'asc' },
    })
    res.json(schedules)
  } catch (error) { next(error) }
})

// POST /api/integrations/:id/schedules
router.post('/', authorize('admin'), validate({ body: createScheduleSchema }), async (req, res, next) => {
  try {
    const integrationId = String(req.params.id)
    const { cronExpression, jobType, jobConfig } = req.body as { cronExpression: string; jobType: string; jobConfig: Record<string, unknown> }

    if (!cron.validate(cronExpression)) {
      return next(createError(400, 'Invalid cron expression'))
    }

    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, tenantId: req.tenantId },
    })
    if (!integration) return next(createError(404, 'Integration not found'))

    const schedule = await prisma.integrationSchedule.create({
      data: { integrationId, cronExpression, jobType, jobConfig: jobConfig as any },
    })

    registerSchedule({ ...schedule, integration })

    res.status(201).json(schedule)
  } catch (error) { next(error) }
})

// PATCH /api/integrations/:id/schedules/:scheduleId
router.patch('/:scheduleId', authorize('admin'), validate({ body: updateScheduleSchema }), async (req, res, next) => {
  try {
    const scheduleId = String(req.params.scheduleId)
    const existing = await prisma.integrationSchedule.findUnique({
      where: { id: scheduleId },
      include: { integration: true },
    })
    if (!existing || existing.integration.tenantId !== req.tenantId) {
      return next(createError(404, 'Schedule not found'))
    }

    if (req.body.cronExpression && !cron.validate(req.body.cronExpression)) {
      return next(createError(400, 'Invalid cron expression'))
    }

    const updated = await prisma.integrationSchedule.update({
      where: { id: scheduleId },
      data: req.body,
      include: { integration: true },
    })

    if (updated.isActive) {
      registerSchedule(updated)
    } else {
      unregisterSchedule(scheduleId)
    }

    res.json(updated)
  } catch (error) { next(error) }
})

// DELETE /api/integrations/:id/schedules/:scheduleId
router.delete('/:scheduleId', authorize('admin'), async (req, res, next) => {
  try {
    const scheduleId = String(req.params.scheduleId)
    const existing = await prisma.integrationSchedule.findUnique({
      where: { id: scheduleId },
      include: { integration: true },
    })
    if (!existing || existing.integration.tenantId !== req.tenantId) {
      return next(createError(404, 'Schedule not found'))
    }

    unregisterSchedule(scheduleId)
    await prisma.integrationSchedule.delete({ where: { id: scheduleId } })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
