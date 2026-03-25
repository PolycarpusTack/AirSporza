import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

vi.mock('dotenv', () => ({ config: () => {} }))

describe('env validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('should use defaults in development', async () => {
    process.env = { NODE_ENV: 'development' }
    const { parseEnv } = await import('../src/config/env.js')
    const env = parseEnv({ NODE_ENV: 'development' })

    expect(env.PORT).toBe(3001)
    expect(env.JWT_SECRET).toBe('dev-secret-key-change-in-production')
    expect(env.DATABASE_URL).toContain('postgresql://')
  })

  it('should throw in production without required vars', async () => {
    // Import in dev mode so module-level parseEnv() succeeds
    process.env = { NODE_ENV: 'development' }
    const { parseEnv } = await import('../src/config/env.js')

    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(
      'Environment validation failed'
    )
  })

  it('should reject JWT_SECRET shorter than 32 chars in production', async () => {
    process.env = { NODE_ENV: 'development' }
    const { parseEnv } = await import('../src/config/env.js')

    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/db',
        JWT_SECRET: 'short',
        REDIS_URL: 'redis://localhost:6379',
        CORS_ORIGIN: 'http://example.com',
      })
    ).toThrow('JWT_SECRET')
  })

  it('should parse PORT as number', async () => {
    process.env = { NODE_ENV: 'development', PORT: '4000' }
    const { parseEnv } = await import('../src/config/env.js')
    const env = parseEnv()

    expect(env.PORT).toBe(4000)
  })
})
