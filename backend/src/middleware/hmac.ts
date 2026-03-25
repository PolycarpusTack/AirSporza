import { Request, Response, NextFunction } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '../db/prisma.js'
import { createError } from './errorHandler.js'

export function verifyHmac() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const signature = req.headers['x-signature-256'] as string | undefined
      if (!signature) {
        return next(createError(401, 'Missing X-Signature-256 header'))
      }

      const configId = (req.query.configId || req.body?.configId) as string | undefined
      if (!configId) {
        return next(createError(401, 'Missing configId'))
      }

      const adapter = await prisma.adapterConfig.findUnique({ where: { id: configId } })
      if (!adapter || !adapter.config || !(adapter.config as any).secret) {
        return next(createError(401, 'Unknown adapter or missing secret'))
      }

      const secret = (adapter.config as any).secret as string
      const rawBody = (req as any).rawBody as Buffer | undefined
      if (!rawBody) {
        return next(createError(500, 'Raw body not available for HMAC verification'))
      }

      const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
      const sigBuf = Buffer.from(signature, 'utf8')
      const expBuf = Buffer.from(expected, 'utf8')

      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        return next(createError(401, 'Invalid signature'))
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}
