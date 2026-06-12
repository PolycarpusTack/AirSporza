import winston from 'winston'
import { getCorrelationId } from './requestContext.js'

const { combine, timestamp, printf, colorize } = winston.format

const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`
  }
  // D-1: suffix the correlation id when the log happens inside a
  // request/job context. Output shape is unchanged otherwise.
  const correlationId = getCorrelationId()
  if (correlationId) {
    msg += ` [cid=${correlationId}]`
  }
  return msg
})

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat)
    }),
  ],
})

if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }))
  logger.add(new winston.transports.File({ filename: 'logs/combined.log' }))
}
