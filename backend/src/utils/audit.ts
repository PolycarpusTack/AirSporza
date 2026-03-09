// backend/src/utils/audit.ts
import { prisma } from '../db/prisma.js'

export async function writeAuditLog(params: {
  userId?: string | null
  action: string
  entityType: string
  entityId: string
  oldValue?: unknown
  newValue?: unknown
  ipAddress?: string | null
  userAgent?: string | null
  tenantId?: string | null
}): Promise<void> {
  const { userId, action, entityType, entityId, oldValue, newValue, ipAddress, userAgent, tenantId } = params
  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      entityType,
      entityId,
      oldValue: oldValue == null ? undefined : (oldValue as never),
      newValue: newValue == null ? undefined : (newValue as never),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      tenantId: tenantId ?? '',
    },
  })
}
