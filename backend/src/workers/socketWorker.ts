import { createWorker } from '../services/queue.js'
import { emit, getSocketServer } from '../services/socketInstance.js'
import { logger } from '../utils/logger.js'

/** Map outbox event type to the Socket.IO room (matches subscribe channels) */
function deriveRoomFromEventType(eventType: string): string | undefined {
  if (eventType.startsWith('event.')) return 'events'
  if (eventType.startsWith('techPlan.')) return 'techPlans'
  if (eventType.startsWith('encoder.')) return 'encoders'
  if (eventType.startsWith('contract.')) return 'events' // contracts affect event views
  if (eventType.startsWith('setting.')) return 'settings' // tenant-scoped admin notification
  if (eventType.startsWith('slot.')) return 'events'
  return undefined
}

/**
 * Socket.IO Worker
 *
 * Processes outbox events routed to the 'socketio' queue and broadcasts
 * them via Socket.IO. Replaces direct emit() calls in route handlers.
 */
export function startSocketWorker() {
  return createWorker('socketio', async (job) => {
    const { eventType, payload, room, namespace, _tenantId: tenantId } = job.data

    if (namespace) {
      // Namespaced emit (cascade, alerts, switches, schedule)
      const io = getSocketServer()
      if (io) {
        const targetRoom = room || (tenantId ? `tenant:${tenantId}` : undefined)
        if (targetRoom) {
          io.of(namespace).to(targetRoom).emit(eventType, payload)
        } else {
          io.of(namespace).emit(eventType, payload)
        }
      }
    } else {
      // Default namespace emit — use tenant-scoped room when tenantId is available
      const entityRoom = room || deriveRoomFromEventType(eventType)
      const targetRoom = tenantId && entityRoom
        ? `tenant:${tenantId}:${entityRoom}`
        : entityRoom
      emit(eventType, payload, targetRoom)
    }

    logger.debug('Socket.IO emit via worker', { eventType, room, namespace })
    return { emitted: true }
  }, { concurrency: 5 })
}
