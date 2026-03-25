import { config } from 'dotenv'
import { z } from 'zod'

config()

const devDefaults: Record<string, string> = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://sporza:sporza@localhost:5432/sporza_planner',
  JWT_SECRET: 'dev-secret-key-change-in-production',
  JWT_EXPIRES_IN: '7d',
  REDIS_URL: 'redis://localhost:6379',
  PORT: '3001',
  CORS_ORIGIN: 'http://localhost:5173',
}

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('7d'),
  REDIS_URL: z.string().startsWith('redis://'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().min(1),
  OAUTH_CLIENT_ID: z.string().optional(),
  OAUTH_CLIENT_SECRET: z.string().optional(),
  OAUTH_AUTHORIZATION_URL: z.string().url().optional().or(z.literal('')),
  OAUTH_TOKEN_URL: z.string().url().optional().or(z.literal('')),
  OAUTH_CALLBACK_URL: z.string().url().optional().or(z.literal('')),
  OAUTH_USER_INFO_URL: z.string().url().optional().or(z.literal('')),
  IMPORT_WORKER_POLL_MS: z.coerce.number().int().positive().default(5000),
  IMPORT_JOB_LEASE_MS: z.coerce.number().int().positive().default(300000),
  IMPORT_JOB_HEARTBEAT_MS: z.coerce.number().int().positive().default(30000),
  IMPORT_JOB_MAX_RETRIES: z.coerce.number().int().positive().default(3),
  IMPORT_WORKER_ID: z.string().optional(),
})

export type Env = z.infer<typeof baseSchema>

export function parseEnv(overrides?: Record<string, string | undefined>): Env {
  const raw = overrides ?? process.env

  const isProd =
    (raw.NODE_ENV ?? process.env.NODE_ENV) === 'production'

  // In non-production, fill in dev defaults for missing vars
  const input: Record<string, unknown> = { ...raw }
  if (!isProd) {
    for (const [key, value] of Object.entries(devDefaults)) {
      if (input[key] === undefined || input[key] === '') {
        input[key] = value
      }
    }
  }

  const result = baseSchema.safeParse(input)

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Environment validation failed:\n${formatted}`)
  }

  // Additional production check: JWT_SECRET must be >= 32 chars
  if (isProd && result.data.JWT_SECRET.length < 32) {
    throw new Error(
      'Environment validation failed:\n  JWT_SECRET: Must be at least 32 characters in production'
    )
  }

  return result.data
}

export const env: Env = parseEnv()
