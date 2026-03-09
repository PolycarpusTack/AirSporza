import { prisma } from '../db/prisma.js'

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  opts?: { body?: string; entityType?: string; entityId?: string; tenantId?: string }
): Promise<void> {
  const { tenantId, ...rest } = opts ?? {}
  // Look up user's tenant if not provided
  let tid = tenantId
  if (!tid) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } })
    tid = user?.tenantId
  }
  await prisma.notification.create({
    data: { userId, type, title, tenantId: tid ?? '', ...rest },
  })
}
