import { Router, Request, Response, NextFunction } from 'express'
import jwt, { SignOptions } from 'jsonwebtoken'
import passport from 'passport'
import { Strategy as OAuth2Strategy } from 'passport-oauth2'
import { prisma } from '../db/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { getJwtSecret, getJwtExpiresIn, getFrontendUrl } from '../config/index.js'

const router = Router()

const getSignOptions = (): SignOptions => ({ expiresIn: getJwtExpiresIn() } as SignOptions)

if (process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET) {
  passport.use(new OAuth2Strategy({
    authorizationURL: process.env.OAUTH_AUTHORIZATION_URL || '',
    tokenURL: process.env.OAUTH_TOKEN_URL || '',
    clientID: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    callbackURL: process.env.OAUTH_CALLBACK_URL || ''
  }, async (accessToken: string, _refreshToken: string, _profile: unknown, done: (err: Error | null, user?: Express.User | false) => void) => {
    try {
      const response = await fetch(process.env.OAUTH_USER_INFO_URL || '', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      const profile = await response.json() as { email: string; name?: string; sub?: string }
      
      let user = await prisma.user.findUnique({
        where: { email: profile.email }
      })
      
      if (!user) {
        // For OAuth, use the tenant from the request context (set by middleware)
        // Note: req is not available here; new users inherit from default tenant
        const defaultTenant = await prisma.tenant.findFirst({ where: { slug: 'default' } })
        if (!defaultTenant) {
          return done(new Error('No default tenant configured'), false)
        }
        user = await prisma.user.create({
          data: {
            email: profile.email,
            name: profile.name || profile.email.split('@')[0],
            externalId: profile.sub,
            tenantId: defaultTenant.id,
          }
        })
      }
      
      done(null, user)
    } catch (error) {
      done(error as Error, false)
    }
  }))
}


const requireOAuth = (_req: Request, res: Response, next: NextFunction) => {
  if (!process.env.OAUTH_CLIENT_ID || !process.env.OAUTH_CLIENT_SECRET) {
    return res.status(503).json({ error: 'OAuth not configured' })
  }
  next()
}

router.get('/login', requireOAuth, passport.authenticate('oauth2'))

router.get('/callback',
  requireOAuth,
  passport.authenticate('oauth2', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const user = req.user as { id: string; email: string; role: string }
    
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      getSignOptions()
    )
    
    const frontendUrl = new URL(getFrontendUrl())
    frontendUrl.pathname = '/auth/callback'
    frontendUrl.searchParams.set('token', token)
    
    res.redirect(frontendUrl.toString())
  }
)

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user })
})

router.post('/logout', authenticate, (_req, res) => {
  res.json({ message: 'Logged out successfully' })
})

router.post('/dev-login', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next(createError(403, 'Not available in production'))
  }
  
  const { email, role } = req.body
  
  try {
    let user = await prisma.user.findUnique({ where: { email } })
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0],
          role: role || 'planner',
          tenantId: req.tenantId!,
        }
      })
    } else if (role && user.role !== role) {
      user = await prisma.user.update({
        where: { email },
        data: { role }
      })
    }
    
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      getSignOptions()
    )
    
    res.json({ token, user })
  } catch (error) {
    next(error)
  }
})

export default router
