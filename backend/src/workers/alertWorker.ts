import { createWorker } from '../services/queue.js'
import { evaluateAlerts } from '../services/cascade/alerts.js'
import { prisma } from '../db/prisma.js'
import { socketioQueue } from '../services/queue.js'
import { logger } from '../utils/logger.js'
import { setTenantRLS } from '../utils/setTenantRLS.js'

export const alertWorker = createWorker(
  'alerts',
  async (job) => {
    const { _tenantId: tenantId, courtId, channelId } = job.data
    if (tenantId) await setTenantRLS(tenantId)
    logger.info(`Alert evaluation triggered for tenant=${tenantId}`, { courtId, channelId })

    // Scope query to affected courts/channels instead of all tenant slots
    const where: any = {
      tenantId,
      status: { in: ['LIVE', 'PLANNED'] },
    }
    if (courtId) {
      where.sportMetadata = { path: ['court_id'], equals: courtId }
    }
    if (channelId) {
      where.channelId = channelId
    }

    const slots = await prisma.broadcastSlot.findMany({ where })
    const alerts = evaluateAlerts(slots as any[])

    if (alerts.length > 0) {
      logger.info(`Generated ${alerts.length} alerts for tenant=${tenantId}`)

      // Route directly to socketio queue for real-time delivery
      await socketioQueue.add('alerts:update', {
        eventType: 'alerts:update',
        payload: alerts,
        namespace: '/alerts',
        room: `tenant:${tenantId}`,
        _tenantId: tenantId,
      })
    }

    return { alertCount: alerts.length }
  },
  { concurrency: 2 }
)
