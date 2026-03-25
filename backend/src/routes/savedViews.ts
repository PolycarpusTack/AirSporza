import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import * as s from '../schemas/savedViews.js'

const router = Router()

router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const { context } = req.query
    const contextStr = Array.isArray(context) ? context[0] : context
    const views = await prisma.savedView.findMany({
      where: { tenantId: req.tenantId, userId: user.id, ...(contextStr ? { context: contextStr } : {}) },
      orderBy: { createdAt: 'asc' },
    })
    res.json(views)
  } catch (error) { next(error) }
})

router.post('/', authenticate, validate({ body: s.savedViewSchema }), async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const view = await prisma.savedView.create({ data: { tenantId: req.tenantId!, userId: user.id, ...req.body } })
    res.status(201).json(view)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(createError(409, 'A saved view with that name already exists'))
    }
    next(error)
  }
})

router.delete('/:id', authenticate, validate({ params: s.savedViewIdParam }), async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const id = String(req.params.id)
    const view = await prisma.savedView.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!view) return next(createError(404, 'Saved view not found'))
    if (view.userId !== user.id) return next(createError(403, 'Forbidden'))
    await prisma.savedView.delete({ where: { id: view.id } })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
