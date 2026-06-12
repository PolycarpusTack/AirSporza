import type { Request, Response, NextFunction } from 'express'
import { v4 as uuid } from 'uuid'
import { requestContext } from '../utils/requestContext.js'

export const CORRELATION_HEADER = 'x-correlation-id'

// Guard against header abuse: anything longer than this (or empty) is replaced.
const MAX_CORRELATION_ID_LENGTH = 128

/**
 * Correlation id middleware (D-1).
 *
 * Accepts an incoming `x-correlation-id` header or generates a uuid,
 * echoes it on the response, and runs the rest of the request pipeline
 * inside an AsyncLocalStorage scope so loggers and the outbox can read
 * it via getCorrelationId() without explicit plumbing.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get(CORRELATION_HEADER)?.trim()
  const correlationId =
    incoming && incoming.length <= MAX_CORRELATION_ID_LENGTH ? incoming : uuid()

  res.setHeader(CORRELATION_HEADER, correlationId)
  requestContext.run({ correlationId }, next)
}
