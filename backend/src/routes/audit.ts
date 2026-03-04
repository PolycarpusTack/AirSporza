import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'

const router = Router()

router.get('/:entityType/:entityId', authenticate, async (req, res, next) => {
  try {
    const entityType = String(req.params.entityType)
    const entityId = String(req.params.entityId)
    const entries = await prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json(entries)
  } catch (error) {
    next(error)
  }
})

function stripImmutable(data: object): object {
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = data as Record<string, unknown>
  return rest
}

const RESTORABLE: Record<string, (id: number, data: object) => Promise<unknown>> = {
  event:    (id, data) => prisma.event.update({ where: { id }, data: stripImmutable(data) }),
  techPlan: (id, data) => prisma.techPlan.update({ where: { id }, data: stripImmutable(data) }),
  contract: (id, data) => prisma.contract.update({ where: { id }, data: stripImmutable(data) }),
}

router.post('/:logId/restore', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const log = await prisma.auditLog.findUnique({ where: { id: String(req.params.logId) } })
    if (!log) return next(createError(404, 'Audit log entry not found'))
    if (!log.oldValue) return next(createError(400, 'No previous value to restore'))

    const restoreFn = RESTORABLE[log.entityType]
    if (!restoreFn) return next(createError(400, `Restore not supported for ${log.entityType}`))

    const restored = await restoreFn(Number(log.entityId), log.oldValue as object)

    const user = req.user as { id: string } | undefined
    await writeAuditLog({
      userId: user?.id,
      action: `${log.entityType}.restored`,
      entityType: log.entityType,
      entityId: log.entityId,
      oldValue: log.newValue ?? undefined,
      newValue: log.oldValue ?? undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.json(restored)
  } catch (error) {
    next(error)
  }
})

export default router
