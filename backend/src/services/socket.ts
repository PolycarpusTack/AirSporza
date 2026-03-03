import { Server as SocketServer } from 'socket.io'
import { logger } from '../utils/logger.js'

interface AuthenticatedSocket {
  id: string
  userId?: string
  role?: string
}

export function setupSocket(io: SocketServer) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    
    if (!token) {
      logger.debug('Socket connection without token')
    }
    
    next()
  })
  
  io.on('connection', (socket) => {
    const auth = socket.handshake.auth as AuthenticatedSocket
    logger.info(`Client connected: ${socket.id}`, { userId: auth.userId })
    
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
