import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Config Module', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('getJwtSecret', () => {
    it('should return dev fallback when JWT_SECRET is not set in development', async () => {
      delete process.env.JWT_SECRET
      process.env.NODE_ENV = 'development'
      
      const module = await import('../src/config/index.js')
      expect(module.getJwtSecret()).toBe('dev-secret-key-change-in-production')
    })
  })

  describe('getCorsOrigins', () => {
    it('should parse multiple CORS origins', async () => {
      process.env.CORS_ORIGIN = 'http://localhost:5173,https://example.com'
      process.env.NODE_ENV = 'development'
      
      const module = await import('../src/config/index.js')
      expect(module.getCorsOrigins()).toEqual(['http://localhost:5173', 'https://example.com'])
    })

    it('should return localhost fallback in development when not set', async () => {
      delete process.env.CORS_ORIGIN
      process.env.NODE_ENV = 'development'
      
      const module = await import('../src/config/index.js')
      expect(module.getCorsOrigins()).toEqual(['http://localhost:5173'])
    })
  })
})
