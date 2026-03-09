import { createWorker } from '../services/queue.js'
import { emit, getSocketServer } from '../services/socketInstance.js'
import { logger } from '../utils/logger.js'

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
      // Default namespace emit
      emit(eventType, payload, room)
    }

    logger.debug('Socket.IO emit via worker', { eventType, room, namespace })
    return { emitted: true }
  }, { concurrency: 5 })
}
