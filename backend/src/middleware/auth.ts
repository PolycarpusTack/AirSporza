import { Request, Response, NextFunction } from 'express'
import passport from 'passport'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import { prisma } from '../db/prisma.js'
import { createError } from './errorHandler.js'
import { getJwtSecret } from '../config/index.js'

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: getJwtSecret()
}

passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub }
    })
    if (user) {
      return done(null, user)
    }
    return done(null, false)
  } catch (error) {
    return done(error, false)
  }
}))

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: Error | null, user: Express.User | null) => {
    if (err) return next(err)
    if (!user) {
      return next(createError(401, 'Unauthorized'))
    }
    req.user = user
    next()
  })(req, res, next)
}

export const authorize = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(createError(401, 'Unauthorized'))
    }
    const user = req.user as { role: string }
    if (!roles.includes(user.role)) {
      return next(createError(403, 'Forbidden'))
    }
    next()
  }
}

export { passport }
