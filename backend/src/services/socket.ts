import { Server as SocketServer } from 'socket.io'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger.js'
import { getJwtSecret } from '../config/index.js'

export function setupSocket(io: SocketServer) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token

    if (!token || typeof token !== 'string') {
      return next(new Error('Unauthorized'))
    }

    try {
      const payload = jwt.verify(token, getJwtSecret()) as { sub?: string; id?: string; role?: string }
      socket.data.userId = payload.sub ?? payload.id ?? undefined
      socket.data.role = payload.role
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })
  
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`, { userId: socket.data.userId, role: socket.data.role })
    
    socket.on('subscribe:events', () => {
      socket.join('events')
      logger.debug(`Client ${socket.id} subscribed to events`)
    })
    
    socket.on('subscribe:techPlans', () => {
      socket.join('techPlans')
      logger.debug(`Client ${socket.id} subscribed to techPlans`)
    })
    
    socket.on('subscribe:encoders', () => {
      socket.join('encoders')
      logger.debug(`Client ${socket.id} subscribed to encoders`)
    })
    
    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`)
    })
  })
  
  return io
}
