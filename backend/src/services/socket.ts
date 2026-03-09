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

  // ---- Broadcast middleware namespaces ----

  const cascadeNs = io.of('/cascade')
  cascadeNs.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token || typeof token !== 'string') return next(new Error('Unauthorized'))
    try {
      const payload = jwt.verify(token, getJwtSecret()) as { sub?: string; id?: string; role?: string }
      socket.data.userId = payload.sub ?? payload.id ?? undefined
      socket.data.role = payload.role
      next()
    } catch { next(new Error('Unauthorized')) }
  })
  cascadeNs.on('connection', (socket) => {
    socket.on('subscribe:court', (data: { tenantId: string; courtId: number }) => {
      socket.join(`tenant:${data.tenantId}:court:${data.courtId}`)
    })
  })

  const alertsNs = io.of('/alerts')
  alertsNs.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token || typeof token !== 'string') return next(new Error('Unauthorized'))
    try {
      const payload = jwt.verify(token, getJwtSecret()) as { sub?: string; id?: string; role?: string }
      socket.data.userId = payload.sub ?? payload.id ?? undefined
      socket.data.role = payload.role
      next()
    } catch { next(new Error('Unauthorized')) }
  })
  alertsNs.on('connection', (socket) => {
    socket.on('subscribe:tenant', (data: { tenantId: string }) => {
      socket.join(`tenant:${data.tenantId}`)
    })
  })

  const switchesNs = io.of('/switches')
  switchesNs.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token || typeof token !== 'string') return next(new Error('Unauthorized'))
    try {
      const payload = jwt.verify(token, getJwtSecret()) as { sub?: string; id?: string; role?: string }
      socket.data.userId = payload.sub ?? payload.id ?? undefined
      socket.data.role = payload.role
      next()
    } catch { next(new Error('Unauthorized')) }
  })
  switchesNs.on('connection', (socket) => {
    socket.on('subscribe:tenant', (data: { tenantId: string }) => {
      socket.join(`tenant:${data.tenantId}`)
    })
  })

  const scheduleNs = io.of('/schedule')
  scheduleNs.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token || typeof token !== 'string') return next(new Error('Unauthorized'))
    try {
      const payload = jwt.verify(token, getJwtSecret()) as { sub?: string; id?: string; role?: string }
      socket.data.userId = payload.sub ?? payload.id ?? undefined
      socket.data.role = payload.role
      next()
    } catch { next(new Error('Unauthorized')) }
  })
  scheduleNs.on('connection', (socket) => {
    socket.on('subscribe:channel', (data: { tenantId: string; channelId: number }) => {
      socket.join(`tenant:${data.tenantId}:channel:${data.channelId}`)
    })
  })

  return io
}
