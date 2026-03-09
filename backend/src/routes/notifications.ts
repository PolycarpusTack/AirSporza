import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()

router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const items = await prisma.notification.findMany({
      where: { tenantId: req.tenantId, userId: user.id },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    })
    res.json(items)
  } catch (error) { next(error) }
})

router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const result = await prisma.notification.updateMany({
      where: { tenantId: req.tenantId, userId: user.id, isRead: false },
      data: { isRead: true },
    })
    res.json({ count: result.count })
  } catch (error) { next(error) }
})

router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const note = await prisma.notification.findFirst({ where: { id: String(req.params.id), tenantId: req.tenantId } })
    if (!note) return next(createError(404, 'Notification not found'))
    if (note.userId !== user.id) return next(createError(403, 'Forbidden'))
    await prisma.notification.update({ where: { id: note.id }, data: { isRead: true } })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
