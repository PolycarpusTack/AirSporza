import { Server as SocketServer } from 'socket.io'
import jwt from 'jsonwebtoken'
import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'
import { getJwtSecret } from '../config/index.js'

/**
 * Authenticate a socket by verifying the JWT and looking up the user in the DB.
 * Sets socket.data.userId, socket.data.role, and socket.data.tenantId.
 */
async function authenticateSocket(
  socket: { handshake: { auth?: { token?: string } }; data: Record<string, unknown> },
  next: (err?: Error) => void
) {
  const token = socket.handshake.auth?.token
  if (!token || typeof token !== 'string') {
    return next(new Error('Unauthorized'))
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub?: string; id?: string }
    const userId = payload.sub ?? payload.id
    if (!userId) return next(new Error('Unauthorized'))

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, tenantId: true } })
    if (!user) return next(new Error('Unauthorized'))

    socket.data.userId = user.id
    socket.data.role = user.role
    socket.data.tenantId = user.tenantId
    next()
  } catch {
    next(new Error('Unauthorized'))
  }
}

export function setupSocket(io: SocketServer) {
  io.use(authenticateSocket)

  io.on('connection', (socket) => {
    const tenantId = socket.data.tenantId as string
    logger.info(`Client connected: ${socket.id}`, { userId: socket.data.userId, role: socket.data.role, tenantId })

    // Auto-join tenant-scoped rooms — client cannot choose a different tenant
    socket.on('subscribe:events', () => {
      const room = tenantId ? `tenant:${tenantId}:events` : 'events'
      socket.join(room)
      logger.debug(`Client ${socket.id} subscribed to ${room}`)
    })

    socket.on('subscribe:techPlans', () => {
      const room = tenantId ? `tenant:${tenantId}:techPlans` : 'techPlans'
      socket.join(room)
      logger.debug(`Client ${socket.id} subscribed to ${room}`)
    })

    socket.on('subscribe:encoders', () => {
      const room = tenantId ? `tenant:${tenantId}:encoders` : 'encoders'
      socket.join(room)
      logger.debug(`Client ${socket.id} subscribed to ${room}`)
    })

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`)
    })
  })

  // ---- Broadcast middleware namespaces ----

  const cascadeNs = io.of('/cascade')
  cascadeNs.use(authenticateSocket)
  cascadeNs.on('connection', (socket) => {
    const tenantId = socket.data.tenantId as string
    socket.on('subscribe:court', (data: { courtId: number }) => {
      socket.join(`tenant:${tenantId}:court:${data.courtId}`)
    })
  })

  const alertsNs = io.of('/alerts')
  alertsNs.use(authenticateSocket)
  alertsNs.on('connection', (socket) => {
    const tenantId = socket.data.tenantId as string
    socket.on('subscribe:tenant', () => {
      socket.join(`tenant:${tenantId}`)
    })
  })

  const switchesNs = io.of('/switches')
  switchesNs.use(authenticateSocket)
  switchesNs.on('connection', (socket) => {
    const tenantId = socket.data.tenantId as string
    socket.on('subscribe:tenant', () => {
      socket.join(`tenant:${tenantId}`)
    })
  })

  const scheduleNs = io.of('/schedule')
  scheduleNs.use(authenticateSocket)
  scheduleNs.on('connection', (socket) => {
    const tenantId = socket.data.tenantId as string
    socket.on('subscribe:channel', (data: { channelId: number }) => {
      socket.join(`tenant:${tenantId}:channel:${data.channelId}`)
    })
  })

  return io
}
