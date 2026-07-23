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

  describe('RIGHTS_WINDOWS_ENABLED flag (RD-3-T2 — safe boolean parse)', () => {
    const base = {
      NODE_ENV: 'development' as const,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      CORS_ORIGIN: 'http://localhost:5173',
    }
    it("'true' → ON", () => {
      expect(parseEnv({ ...base, RIGHTS_WINDOWS_ENABLED: 'true' }).RIGHTS_WINDOWS_ENABLED).toBe(true)
    })
    it("'false' → OFF (the footgun: z.coerce.boolean would make this TRUE)", () => {
      expect(parseEnv({ ...base, RIGHTS_WINDOWS_ENABLED: 'false' }).RIGHTS_WINDOWS_ENABLED).toBe(false)
    })
    it("'0' → OFF", () => {
      expect(parseEnv({ ...base, RIGHTS_WINDOWS_ENABLED: '0' }).RIGHTS_WINDOWS_ENABLED).toBe(false)
    })
    it('unset → OFF (default)', () => {
      expect(parseEnv({ ...base }).RIGHTS_WINDOWS_ENABLED).toBe(false)
    })
  })

  describe('REGULATORY_COMPLIANCE_ENABLED flag (RC-1-T3 — safe boolean parse)', () => {
    const base = {
      NODE_ENV: 'development' as const,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      CORS_ORIGIN: 'http://localhost:5173',
    }
    it("'true' → ON", () => {
      expect(parseEnv({ ...base, REGULATORY_COMPLIANCE_ENABLED: 'true' }).REGULATORY_COMPLIANCE_ENABLED).toBe(true)
    })
    it("'false' → OFF", () => {
      expect(parseEnv({ ...base, REGULATORY_COMPLIANCE_ENABLED: 'false' }).REGULATORY_COMPLIANCE_ENABLED).toBe(false)
    })
    it('unset → OFF (default)', () => {
      expect(parseEnv({ ...base }).REGULATORY_COMPLIANCE_ENABLED).toBe(false)
    })
  })

  describe('CASCADE_PREVIEW_PARITY flag (AS-8 / ADR-008 — safe boolean parse)', () => {
    const base = {
      NODE_ENV: 'development' as const,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      CORS_ORIGIN: 'http://localhost:5173',
    }
    it("'true' → ON", () => {
      expect(parseEnv({ ...base, CASCADE_PREVIEW_PARITY: 'true' }).CASCADE_PREVIEW_PARITY).toBe(true)
    })
    it("'false' → OFF (z.coerce.boolean footgun guard)", () => {
      expect(parseEnv({ ...base, CASCADE_PREVIEW_PARITY: 'false' }).CASCADE_PREVIEW_PARITY).toBe(false)
    })
    it("'1' → OFF (only the literal 'true' enables)", () => {
      expect(parseEnv({ ...base, CASCADE_PREVIEW_PARITY: '1' }).CASCADE_PREVIEW_PARITY).toBe(false)
    })
    it('unset → OFF (default)', () => {
      expect(parseEnv({ ...base }).CASCADE_PREVIEW_PARITY).toBe(false)
    })
  })

  describe('SCHEDULE_RIPPLE_ENABLED flag (SV-2 / ADR-019 — safe boolean parse)', () => {
    const base = {
      NODE_ENV: 'development' as const,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      CORS_ORIGIN: 'http://localhost:5173',
    }
    it("'true' → ON", () => {
      expect(parseEnv({ ...base, SCHEDULE_RIPPLE_ENABLED: 'true' }).SCHEDULE_RIPPLE_ENABLED).toBe(true)
    })
    it("'false' → OFF (the footgun: z.coerce.boolean would make this TRUE)", () => {
      expect(parseEnv({ ...base, SCHEDULE_RIPPLE_ENABLED: 'false' }).SCHEDULE_RIPPLE_ENABLED).toBe(false)
    })
    it("'1' → OFF (only the literal 'true' enables)", () => {
      expect(parseEnv({ ...base, SCHEDULE_RIPPLE_ENABLED: '1' }).SCHEDULE_RIPPLE_ENABLED).toBe(false)
    })
    it('unset → OFF (default)', () => {
      expect(parseEnv({ ...base }).SCHEDULE_RIPPLE_ENABLED).toBe(false)
    })
  })
})
