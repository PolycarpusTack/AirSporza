import { env } from './config/env.js'

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { authLimiter, publicLimiter, standardLimiter } from './middleware/rateLimits.js'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { logger } from './utils/logger.js'
import { prisma } from './db/prisma.js'
import { getCorsOrigins } from './config/index.js'
import authRoutes from './routes/auth.js'
import eventsRoutes from './routes/events.js'
import sportsRoutes from './routes/sports.js'
import competitionsRoutes from './routes/competitions.js'
import techPlansRoutes from './routes/techPlans.js'
import contractsRoutes from './routes/contracts.js'
import encodersRoutes from './routes/encoders.js'
import importRoutes from './routes/import.js'
import importSchedulesRoutes from './routes/importSchedules.js'
import csvImportRoutes from './routes/csvImport.js'
import fieldConfigRoutes from './routes/fieldConfig.js'
import settingsRoutes from './routes/settings.js'
import publishRoutes from './routes/publish.js'
import auditRoutes from './routes/audit.js'
import notificationsRoutes from './routes/notifications.js'
import savedViewsRoutes from './routes/savedViews.js'
import resourcesRoutes from './routes/resources.js'
import crewMembersRoutes from './routes/crewMembers.js'
import crewTemplatesRoutes from './routes/crewTemplates.js'
import usersRouter from './routes/users.js'
import venueRoutes from './routes/venues.js'
import teamRoutes from './routes/teams.js'
import courtRoutes from './routes/courts.js'
import seasonRoutes from './routes/seasons.js'
import channelRoutes from './routes/channels.js'
import broadcastSlotRoutes from './routes/broadcastSlots.js'
import scheduleRoutes from './routes/schedules.js'
import rightsRoutes from './routes/rights.js'
import channelSwitchRoutes from './routes/channelSwitches.js'
import adapterRoutes from './routes/adapters.js'
import integrationsRoutes from './routes/integrations.js'
import { setupSocket } from './services/socket.js'
import { setSocketServer } from './services/socketInstance.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authenticate, authorize } from './middleware/auth.js'
import { setTenantContext } from './middleware/tenantContext.js'
import { publishService } from './services/publishService.js'
import { startScheduledImports } from './services/importScheduler.js'
import { startIntegrationScheduler } from './integrations/integrationScheduler.js'

// ---------------------------------------------------------------------------
// buildApp — pure Express app with routes and middleware. No HTTP server,
// no Socket.IO, no listeners, no signal handlers. Safe for tests.
// ---------------------------------------------------------------------------

export function buildApp() {
  const corsOrigins = getCorsOrigins()
  const app = express()

  app.set('trust proxy', 1)
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(cors({ origin: corsOrigins }))

  // Raw body preservation for HMAC verification.
  app.use('/api/import', express.json({
    limit: '10mb',
    verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf }
  }))
  app.use(express.json({
    limit: '1mb',
    verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf }
  }))
  app.use(express.urlencoded({ extended: true }))

  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    })
    next()
  })

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  app.use('/api/auth', authLimiter, authRoutes)

  // Public routes
  app.use('/api/sports', setTenantContext, publicLimiter, sportsRoutes)
  app.use('/api/competitions', setTenantContext, publicLimiter, competitionsRoutes)
  app.use('/api/encoders', setTenantContext, publicLimiter, encodersRoutes)
  app.use('/api/publish', setTenantContext, publicLimiter, publishRoutes)

  // Authenticated routes
  app.use('/api/events', authenticate, setTenantContext, standardLimiter, eventsRoutes)
  app.use('/api/tech-plans', authenticate, setTenantContext, standardLimiter, techPlansRoutes)
  app.use('/api/contracts', authenticate, setTenantContext, standardLimiter, contractsRoutes)
  app.use('/api/import/schedules', authenticate, setTenantContext, standardLimiter, importSchedulesRoutes)
  app.use('/api/import', authenticate, setTenantContext, standardLimiter, importRoutes)
  app.use('/api/import', authenticate, setTenantContext, standardLimiter, csvImportRoutes)
  app.use('/api/fields', authenticate, setTenantContext, standardLimiter, fieldConfigRoutes)
  app.use('/api/settings', authenticate, setTenantContext, standardLimiter, settingsRoutes)
  app.use('/api/audit', authenticate, setTenantContext, standardLimiter, auditRoutes)
  app.use('/api/notifications', authenticate, setTenantContext, standardLimiter, notificationsRoutes)
  app.use('/api/saved-views', authenticate, setTenantContext, standardLimiter, savedViewsRoutes)
  app.use('/api/resources', authenticate, setTenantContext, standardLimiter, resourcesRoutes)
  app.use('/api/crew-members', authenticate, setTenantContext, standardLimiter, crewMembersRoutes)
  app.use('/api/crew-templates', authenticate, setTenantContext, standardLimiter, crewTemplatesRoutes)
  app.use('/api/users', authenticate, setTenantContext, standardLimiter, usersRouter)
  app.use('/api/venues', authenticate, setTenantContext, standardLimiter, venueRoutes)
  app.use('/api/teams', authenticate, setTenantContext, standardLimiter, teamRoutes)
  app.use('/api/courts', authenticate, setTenantContext, standardLimiter, courtRoutes)
  app.use('/api/seasons', authenticate, setTenantContext, standardLimiter, seasonRoutes)
  app.use('/api/channels', authenticate, setTenantContext, standardLimiter, channelRoutes)
  app.use('/api/broadcast-slots', authenticate, setTenantContext, standardLimiter, broadcastSlotRoutes)
  app.use('/api/schedule-drafts', authenticate, setTenantContext, standardLimiter, scheduleRoutes)
  app.use('/api/rights', authenticate, setTenantContext, standardLimiter, rightsRoutes)
  app.use('/api/channel-switches', authenticate, setTenantContext, standardLimiter, channelSwitchRoutes)

  app.use('/api/integrations', authenticate, setTenantContext, standardLimiter, integrationsRoutes)

  // Adapter routes — CRUD has per-endpoint auth; webhook uses HMAC
  app.use('/api/adapters', adapterRoutes)

  app.use(errorHandler)

  return app
}

// ---------------------------------------------------------------------------
// createApp — full server with HTTP, Socket.IO, and debug endpoint.
// Used by the production entry point. Not used by tests.
// ---------------------------------------------------------------------------

export function createApp() {
  const app = buildApp()
  const corsOrigins = getCorsOrigins()
  const httpServer = createServer(app)
  const io = new SocketServer(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST']
    }
  })

  setSocketServer(io)
  setupSocket(io)

  const databaseUrl = env.DATABASE_URL
  const getDatabaseInfo = () => {
    try {
      const parsed = new URL(databaseUrl)
      return {
        host: parsed.hostname || 'unknown',
        port: parsed.port || '5432',
        database: parsed.pathname.replace(/^\//, '') || 'unknown',
        schema: parsed.searchParams.get('schema') || 'public',
      }
    } catch {
      return { host: 'invalid', port: 'invalid', database: 'invalid', schema: 'invalid' }
    }
  }

  app.get('/api/debug/db', authenticate, authorize('admin'), (_req, res) => {
    const db = getDatabaseInfo()
    res.json({ status: 'ok', environment: env.NODE_ENV, database: db })
  })

  return { app, httpServer, io, getDatabaseInfo }
}

// ---------------------------------------------------------------------------
// Server startup — only runs outside of tests
// ---------------------------------------------------------------------------

let app: express.Express
let httpServer: ReturnType<typeof createApp>['httpServer']

if (env.NODE_ENV !== 'test') {
  const instance = createApp()
  app = instance.app
  httpServer = instance.httpServer
  const getDatabaseInfo = instance.getDatabaseInfo

  const MS_PER_DAY = 24 * 60 * 60 * 1000
  setInterval(() => {
    publishService.checkExpiringContracts().catch(err =>
      logger.error('Contract expiry check failed', { err })
    )
  }, MS_PER_DAY)

  publishService.resumeFailedDeliveries().catch(err =>
    logger.error('Failed to resume webhook deliveries on startup', { err })
  )

  startScheduledImports().catch(err =>
    logger.error('Failed to start import scheduler', { err })
  )

  startIntegrationScheduler().catch(err =>
    logger.error('Failed to start integration scheduler', { err })
  )

  const gracefulShutdown = async () => {
    logger.info('Received shutdown signal, closing connections...')
    await prisma.$disconnect()
    httpServer.close(() => {
      logger.info('Server closed')
      process.exit(0)
    })
  }

  process.on('SIGTERM', gracefulShutdown)
  process.on('SIGINT', gracefulShutdown)

  const PORT = env.PORT
  httpServer.listen(PORT, () => {
    const db = getDatabaseInfo()
    logger.info(`Server running on port ${PORT}`)
    logger.info(`Environment: ${env.NODE_ENV}`)
    logger.info(`Database: ${db.host}:${db.port}/${db.database}?schema=${db.schema}`)
  })
}

export { app, httpServer }
