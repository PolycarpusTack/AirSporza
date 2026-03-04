import { prisma } from '../db/prisma.js'

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  opts?: { body?: string; entityType?: string; entityId?: string }
): Promise<void> {
  await prisma.notification.create({
    data: { userId, type, title, ...opts },
  })
}
