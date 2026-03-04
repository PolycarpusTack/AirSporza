import { config } from 'dotenv'
config()

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
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
import csvImportRoutes from './routes/csvImport.js'
import fieldConfigRoutes from './routes/fieldConfig.js'
import settingsRoutes from './routes/settings.js'
import publishRoutes from './routes/publish.js'
import auditRoutes from './routes/audit.js'
import { setupSocket } from './services/socket.js'
import { setSocketServer } from './services/socketInstance.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authenticate, authorize } from './middleware/auth.js'
import { publishService } from './services/publishService.js'

const corsOrigins = getCorsOrigins()

const app = express()
const httpServer = createServer(app)
const io = new SocketServer(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST']
  }
})

setSocketServer(io)

const PORT = process.env.PORT || 3001
const databaseUrl = process.env.DATABASE_URL || ''

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
    return {
      host: 'invalid',
      port: 'invalid',
      database: 'invalid',
      schema: 'invalid',
    }
  }
}

app.set('trust proxy', 1)

app.use(helmet())
app.use(cors({
  origin: corsOrigins,
  credentials: true
}))

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later.' }
})
app.use('/api/', limiter)

app.use(express.json({ limit: '10mb' }))
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

app.get('/api/debug/db', authenticate, authorize('admin'), (_req, res) => {
  const db = getDatabaseInfo()
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    database: db,
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/sports', sportsRoutes)
app.use('/api/competitions', competitionsRoutes)
app.use('/api/tech-plans', techPlansRoutes)
app.use('/api/contracts', contractsRoutes)
app.use('/api/encoders', encodersRoutes)
app.use('/api/import', importRoutes)
app.use('/api/import', csvImportRoutes)
app.use('/api/fields', fieldConfigRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/publish', publishRoutes)
app.use('/api/audit', auditRoutes)

app.use(errorHandler)

setupSocket(io)

// Daily cron: check for expiring contracts and dispatch webhook events
if (process.env.NODE_ENV !== 'test') {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  setInterval(() => {
    publishService.checkExpiringContracts().catch(err =>
      logger.error('Contract expiry check failed', { err })
    )
  }, MS_PER_DAY)
}

if (process.env.NODE_ENV !== 'test') {
  publishService.resumeFailedDeliveries().catch(err =>
    logger.error('Failed to resume webhook deliveries on startup', { err })
  )
}

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

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    const db = getDatabaseInfo()
    logger.info(`Server running on port ${PORT}`)
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
    logger.info(`Database: ${db.host}:${db.port}/${db.database}?schema=${db.schema}`)
  })
}

export { app, httpServer }
