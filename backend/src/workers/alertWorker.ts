import { createWorker } from '../services/queue.js'
import { evaluateAlerts } from '../services/cascade/alerts.js'
import { prisma } from '../db/prisma.js'
import { getSocketServer } from '../services/socketInstance.js'
import { logger } from '../utils/logger.js'

export const alertWorker = createWorker(
  'alerts',
  async (job) => {
    const { _tenantId: tenantId } = job.data
    logger.info(`Alert evaluation triggered for tenant=${tenantId}`)

    // Fetch all LIVE and PLANNED slots for this tenant
    const slots = await prisma.broadcastSlot.findMany({
      where: {
        tenantId,
        status: { in: ['LIVE', 'PLANNED'] },
      },
    })

    const alerts = evaluateAlerts(slots as any[])

    if (alerts.length > 0) {
      logger.info(`Generated ${alerts.length} alerts for tenant=${tenantId}`)

      // Emit alerts via Socket.IO
      const io = getSocketServer()
      if (io) {
        const alertsNs = io.of('/alerts')
        alertsNs.to(`tenant:${tenantId}`).emit('alerts:update', alerts)
      }
    }

    return { alertCount: alerts.length }
  },
  { concurrency: 2 }
)
