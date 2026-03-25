import { env } from './env.js'

export function getJwtSecret(): string {
  return env.JWT_SECRET
}

export function getJwtExpiresIn(): string {
  return env.JWT_EXPIRES_IN
}

export function getCorsOrigins(): string[] {
  return env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
}

export function getFrontendUrl(): string {
  return getCorsOrigins()[0] || 'http://localhost:5173'
}
