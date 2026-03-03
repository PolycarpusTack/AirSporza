import { logger } from '../utils/logger.js'

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production')
    }
    logger.warn('JWT_SECRET not set, using development fallback. DO NOT use in production!')
    return 'dev-secret-key-change-in-production'
  }
  return secret
}

export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '7d'
}

export function getCorsOrigins(): string[] {
  const origins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()).filter(Boolean)
  if (!origins?.length) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CORS_ORIGIN environment variable is required in production')
    }
    return ['http://localhost:5173']
  }
  return origins
}

export function getFrontendUrl(): string {
  return getCorsOrigins()[0] || 'http://localhost:5173'
}
