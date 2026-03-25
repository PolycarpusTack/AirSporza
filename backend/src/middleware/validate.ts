import { Request, Response, NextFunction, RequestHandler } from 'express'
import { ZodSchema } from 'zod'

interface ValidationSchemas {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Record<string, unknown[]> = {}

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params)
      if (result.success) {
        req.params = result.data as any
      } else {
        errors.params = result.error.issues
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query)
      if (result.success) {
        (req as any).query = result.data
      } else {
        errors.query = result.error.issues
      }
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body)
      if (result.success) {
        req.body = result.data
      } else {
        errors.body = result.error.issues
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed', details: errors })
      return
    }

    next()
  }
}
