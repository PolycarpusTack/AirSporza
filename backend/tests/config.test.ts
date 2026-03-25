import { describe, it, expect } from 'vitest'
import { parseEnv } from '../src/config/env.js'

describe('Config Module', () => {
  describe('getJwtSecret via parseEnv', () => {
    it('should return dev fallback when JWT_SECRET is not set in development', () => {
      const env = parseEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        CORS_ORIGIN: 'http://localhost:5173',
      })
      expect(env.JWT_SECRET).toBe('dev-secret-key-change-in-production')
    })
  })

  describe('getCorsOrigins', () => {
    it('should parse multiple CORS origins', () => {
      const env = parseEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        CORS_ORIGIN: 'http://localhost:5173,https://example.com',
      })
      const origins = env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
      expect(origins).toEqual(['http://localhost:5173', 'https://example.com'])
    })

    it('should return localhost fallback in development when not set', () => {
      const env = parseEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
      })
      const origins = env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
      expect(origins).toEqual(['http://localhost:5173'])
    })
  })
})
