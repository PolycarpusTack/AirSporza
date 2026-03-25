# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Planza backend for production deployment — fix security vulnerabilities, validate environment, close auth gaps, and migrate all input validation to Zod.

**Architecture:** Centralized env validation at startup (fail-fast in production), Zod-based validation middleware on all routes, tiered rate limiting, HMAC webhook verification. All changes are backend-only.

**Tech Stack:** Express, Prisma, Zod (replaces Joi), helmet, express-rate-limit, BullMQ

**Spec:** `docs/superpowers/specs/2026-03-25-production-hardening-design.md`

---

## File Structure

### New files
```
backend/src/config/env.ts              — Zod env schema, typed env export
backend/src/middleware/validate.ts      — Zod validation middleware
backend/src/middleware/hmac.ts          — HMAC signature verification for webhooks
backend/src/middleware/rateLimits.ts    — Tiered rate limiter instances
backend/src/schemas/common.ts          — Shared Zod schemas (idParam, uuidParam, pagination, dateRange)
backend/src/schemas/events.ts          — Event validation schemas (migrate from Joi)
backend/src/schemas/techPlans.ts       — Tech plan schemas (migrate from Joi)
backend/src/schemas/contracts.ts       — Contract schemas (migrate from Joi)
backend/src/schemas/publish.ts         — Publish/webhook schemas (new)
backend/src/schemas/import.ts          — Import schemas (migrate from Joi)
backend/src/schemas/broadcastSlots.ts  — Broadcast slot schemas (new)
backend/src/schemas/adapters.ts        — Adapter config schemas (new)
backend/src/schemas/crewMembers.ts     — Crew member schemas (migrate from Joi)
backend/src/schemas/crewTemplates.ts   — Crew template schemas (migrate from Joi)
backend/src/schemas/fieldConfig.ts     — Field config schemas (migrate from Joi)
backend/src/schemas/users.ts           — User schemas (migrate from Joi)
backend/src/schemas/settings.ts        — Settings schemas (migrate from Joi)
backend/src/schemas/sports.ts          — Sport schemas (new)
backend/src/schemas/competitions.ts    — Competition schemas (new)
backend/src/schemas/encoders.ts        — Encoder schemas (migrate from Joi)
backend/src/schemas/resources.ts       — Resource schemas (migrate from Joi)
backend/src/schemas/venues.ts          — Venue schemas (migrate from Joi)
backend/src/schemas/teams.ts           — Team schemas (migrate from Joi)
backend/src/schemas/courts.ts          — Court schemas (migrate from Joi)
backend/src/schemas/seasons.ts         — Season schemas (migrate from Joi)
backend/src/schemas/channels.ts        — Channel schemas (new)
backend/src/schemas/schedules.ts       — Schedule schemas (new)
backend/src/schemas/rights.ts          — Rights schemas (new)
backend/src/schemas/channelSwitches.ts — Channel switch schemas (new)
backend/src/schemas/notifications.ts   — Notification schemas (new)
backend/src/schemas/savedViews.ts      — Saved view schemas (migrate from Joi)
backend/src/schemas/importSchedules.ts — Import schedule schemas (migrate from Joi)
backend/src/schemas/audit.ts           — Audit schemas (new)
backend/src/schemas/csvImport.ts       — CSV import schemas (new, if applicable)
backend/tests/env.test.ts              — Env validation tests
backend/tests/validate.test.ts         — Validation middleware tests
backend/tests/hmac.test.ts             — HMAC middleware tests
```

### Modified files
```
backend/package.json                       — add zod, remove joi
backend/src/config/index.ts                — rewrite to use env.ts
backend/src/index.ts                       — rate limiters, auth mounts, body limit, CORS, helmet
backend/src/middleware/auth.ts              — import from env.ts
backend/src/middleware/errorHandler.ts      — import from env.ts
backend/src/middleware/tenantContext.ts      — fix $executeRawUnsafe
backend/src/services/cascade/engine.ts      — fix $executeRawUnsafe
backend/src/services/queue.ts               — import from env.ts
backend/src/routes/auth.ts                  — import from env.ts
backend/src/routes/events.ts                — replace Joi with Zod, remove parseId
backend/src/routes/techPlans.ts             — replace Joi with Zod
backend/src/routes/contracts.ts             — replace Joi with Zod
backend/src/routes/crewMembers.ts           — replace Joi with Zod
backend/src/routes/crewTemplates.ts         — replace Joi with Zod
backend/src/routes/encoders.ts              — replace Joi with Zod
backend/src/routes/resources.ts             — replace Joi with Zod
backend/src/routes/import.ts                — replace Joi with Zod
backend/src/routes/fieldConfig.ts           — replace Joi with Zod
backend/src/routes/settings.ts              — replace Joi with Zod
backend/src/routes/users.ts                 — replace Joi with Zod
backend/src/routes/savedViews.ts            — replace Joi with Zod
backend/src/routes/venues.ts                — replace Joi with Zod
backend/src/routes/teams.ts                 — replace Joi with Zod
backend/src/routes/courts.ts                — replace Joi with Zod
backend/src/routes/seasons.ts               — replace Joi with Zod
backend/src/routes/importSchedules.ts       — replace Joi with Zod
backend/src/routes/sports.ts                — add Zod validation
backend/src/routes/competitions.ts          — add Zod validation
backend/src/routes/publish.ts               — add Zod validation
backend/src/routes/broadcastSlots.ts        — add Zod validation
backend/src/routes/adapters.ts              — add Zod + HMAC
backend/src/routes/channels.ts              — add Zod validation
backend/src/routes/schedules.ts             — add Zod validation
backend/src/routes/rights.ts                — add Zod validation
backend/src/routes/channelSwitches.ts       — add Zod validation
backend/src/routes/notifications.ts         — add Zod validation
backend/src/routes/audit.ts                 — add Zod validation
backend/.eslintrc.*                         — ban $executeRawUnsafe
```

---

## Task 1: Install Zod & Create Env Validation

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/config/env.ts`
- Create: `backend/tests/env.test.ts`

- [ ] **Step 1: Install zod**

```bash
cd /mnt/c/Projects/Planza/backend && npm install zod
```

- [ ] **Step 2: Write env validation test**

```typescript
// backend/tests/env.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('env validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should use defaults in development', async () => {
    process.env.NODE_ENV = 'development'
    delete process.env.JWT_SECRET
    delete process.env.DATABASE_URL
    const { env } = await import('../src/config/env.js')
    expect(env.PORT).toBe(3001)
    expect(env.JWT_SECRET).toBe('dev-secret-key-change-in-production')
    expect(env.DATABASE_URL).toContain('postgresql://')
  })

  it('should throw in production without required vars', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.JWT_SECRET
    delete process.env.DATABASE_URL
    delete process.env.REDIS_URL
    delete process.env.CORS_ORIGIN
    // env.ts always throws on validation failure (index.ts catches and calls process.exit)
    await expect(import('../src/config/env.js')).rejects.toThrow('Environment validation failed')
  })

  it('should reject JWT_SECRET shorter than 32 chars in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'tooshort'
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db'
    process.env.REDIS_URL = 'redis://localhost:6379'
    process.env.CORS_ORIGIN = 'http://localhost:5173'
    await expect(import('../src/config/env.js')).rejects.toThrow('JWT_SECRET')
  })

  it('should parse PORT as number', async () => {
    process.env.NODE_ENV = 'development'
    process.env.PORT = '4000'
    const { env } = await import('../src/config/env.js')
    expect(env.PORT).toBe(4000)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run tests/env.test.ts
```
Expected: FAIL — `env.ts` doesn't exist yet.

- [ ] **Step 4: Create env.ts**

```typescript
// backend/src/config/env.ts
import { z } from 'zod'
import { config } from 'dotenv'

config()

const nodeEnv = process.env.NODE_ENV || 'development'
const isProd = nodeEnv === 'production'

const devDefaults = {
  DATABASE_URL: 'postgresql://sporza:sporza@localhost:5432/sporza_planner',
  JWT_SECRET: 'dev-secret-key-change-in-production',
  JWT_EXPIRES_IN: '7d',
  REDIS_URL: 'redis://localhost:6379',
  PORT: 3001,
  CORS_ORIGIN: 'http://localhost:5173',
}

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  REDIS_URL: z.string().startsWith('redis://'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().min(1),

  // OAuth (optional — only needed if SSO is configured)
  OAUTH_CLIENT_ID: z.string().optional(),
  OAUTH_CLIENT_SECRET: z.string().optional(),
  OAUTH_AUTHORIZATION_URL: z.string().url().optional().or(z.literal('')),
  OAUTH_TOKEN_URL: z.string().url().optional().or(z.literal('')),
  OAUTH_CALLBACK_URL: z.string().url().optional().or(z.literal('')),
  OAUTH_USER_INFO_URL: z.string().url().optional().or(z.literal('')),

  // Import worker (optional — defaults applied in schema)
  IMPORT_WORKER_POLL_MS: z.coerce.number().int().positive().default(5000),
  IMPORT_JOB_LEASE_MS: z.coerce.number().int().positive().default(300000),
  IMPORT_JOB_HEARTBEAT_MS: z.coerce.number().int().positive().default(30000),
  IMPORT_JOB_MAX_RETRIES: z.coerce.number().int().positive().default(3),
  IMPORT_WORKER_ID: z.string().optional(),
})

// In production, enforce stricter rules
const prodSchema = baseSchema.extend({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters in production'),
})

const schema = isProd ? prodSchema : baseSchema

function parseEnv() {
  const input = {
    ...(!isProd ? devDefaults : {}),
    ...process.env,
  }

  const result = schema.safeParse(input)
  if (!result.success) {
    const formatted = result.error.issues
      .map(i => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    const msg = `Environment validation failed:\n${formatted}`
    // Always throw — index.ts entrypoint catches and calls process.exit(1) in production
    throw new Error(msg)
  }
  return result.data
}

export const env = parseEnv()
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run tests/env.test.ts
```
Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /mnt/c/Projects/Planza/backend && git add src/config/env.ts tests/env.test.ts package.json package-lock.json
git commit -m "feat: add Zod-based env validation with fail-fast in production"
```

---

## Task 2: Wire Env Into All Consumers

**Files:**
- Modify: `backend/src/config/index.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/src/services/queue.ts`
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/middleware/errorHandler.ts`
- Modify: `backend/src/import/services/ImportJobState.ts`
- Modify: `backend/src/import/services/ImportWorkerService.ts`

- [ ] **Step 1: Rewrite config/index.ts to delegate to env.ts**

Replace the entire file with:
```typescript
// backend/src/config/index.ts
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
```

- [ ] **Step 2: Update index.ts — replace process.env reads**

In `backend/src/index.ts`:
- Remove the `config()` import and call at top (env.ts handles dotenv)
- Add: `import { env } from './config/env.js'`
- Replace `process.env.PORT || 3001` → `env.PORT`
- Replace `process.env.DATABASE_URL || ''` → `env.DATABASE_URL`
- Replace `process.env.NODE_ENV || 'development'` → `env.NODE_ENV`
- Replace `process.env.NODE_ENV !== 'test'` → `env.NODE_ENV !== 'test'`

- [ ] **Step 3: Update queue.ts**

In `backend/src/services/queue.ts`:
- Replace line 4: `const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'`
- With: `import { env } from '../config/env.js'` at top, then `const REDIS_URL = env.REDIS_URL`

- [ ] **Step 4: Update auth.ts route**

In `backend/src/routes/auth.ts`:
- Add: `import { env } from '../config/env.js'`
- Replace `process.env.OAUTH_AUTHORIZATION_URL || ''` → `env.OAUTH_AUTHORIZATION_URL || ''`
- Replace `process.env.OAUTH_TOKEN_URL || ''` → `env.OAUTH_TOKEN_URL || ''`
- Replace `process.env.OAUTH_CALLBACK_URL || ''` → `env.OAUTH_CALLBACK_URL || ''`
- Replace `process.env.OAUTH_CLIENT_ID` → `env.OAUTH_CLIENT_ID`
- Replace `process.env.OAUTH_CLIENT_SECRET` → `env.OAUTH_CLIENT_SECRET`
- Replace `process.env.OAUTH_USER_INFO_URL` → `env.OAUTH_USER_INFO_URL`

- [ ] **Step 5: Update errorHandler.ts**

In `backend/src/middleware/errorHandler.ts`:
- Add: `import { env } from '../config/env.js'`
- Replace `process.env.NODE_ENV === 'development'` → `env.NODE_ENV === 'development'`

- [ ] **Step 5b: Update ImportJobState.ts and ImportWorkerService.ts**

In `backend/src/import/services/ImportJobState.ts`:
- Add: `import { env } from '../../config/env.js'`
- Replace `Number(process.env.IMPORT_WORKER_POLL_MS) || 5000` → `env.IMPORT_WORKER_POLL_MS`
- Replace `Number(process.env.IMPORT_JOB_LEASE_MS) || 300000` → `env.IMPORT_JOB_LEASE_MS`
- Replace `Number(process.env.IMPORT_JOB_HEARTBEAT_MS) || 30000` → `env.IMPORT_JOB_HEARTBEAT_MS`
- Replace `Number(process.env.IMPORT_JOB_MAX_RETRIES) || 3` → `env.IMPORT_JOB_MAX_RETRIES`

In `backend/src/import/services/ImportWorkerService.ts`:
- Add: `import { env } from '../../config/env.js'`
- Replace `process.env.IMPORT_WORKER_ID` → `env.IMPORT_WORKER_ID`

- [ ] **Step 5c: Add process.exit catch in index.ts entrypoint**

In `backend/src/index.ts`, env.ts is imported transitively via config/index.ts. If it throws in production, wrap the startup in a try-catch:
```typescript
// At the very top of index.ts, before other imports that depend on env:
try {
  // env.ts validates on import — this will throw if invalid
  await import('./config/env.js')
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
```
Note: Since env.ts runs at import time via config/index.ts, this catch is only needed if index.ts is the entrypoint. If using `tsx watch`, the error propagates naturally.

- [ ] **Step 6: Run TypeScript check and existing tests**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit && npx vitest run
```
Expected: Zero TS errors, all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: wire all process.env reads through env.ts"
```

---

## Task 3: Fix SQL Injection & Add ESLint Ban

**Files:**
- Modify: `backend/src/middleware/tenantContext.ts:30`
- Modify: `backend/src/services/cascade/engine.ts:35`
- Modify: `backend/.eslintrc.*` or `eslint.config.*`

- [ ] **Step 1: Fix tenantContext.ts**

Replace line 30:
```typescript
// BEFORE:
await prisma.$executeRawUnsafe(`SELECT set_tenant_context('${defaultTenantId}')`)
// AFTER:
await prisma.$executeRaw`SELECT set_tenant_context(${defaultTenantId})`
```

- [ ] **Step 2: Fix cascade engine.ts**

Replace line 35:
```typescript
// BEFORE:
await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`)
// AFTER:
await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`
```

- [ ] **Step 3: Add ESLint ban rule**

Find the ESLint config file (`.eslintrc.json`, `.eslintrc.js`, or `eslint.config.*`) and add to the rules:
```json
"no-restricted-properties": ["error", {
  "object": "prisma",
  "property": "$executeRawUnsafe",
  "message": "Use $executeRaw with tagged template literals for parameterized queries"
}, {
  "property": "$executeRawUnsafe",
  "message": "Use $executeRaw with tagged template literals for parameterized queries"
}]
```
Note: The second entry without `object` catches `tx.$executeRawUnsafe` (where the variable name varies).

- [ ] **Step 4: Run lint to verify no violations remain**

```bash
cd /mnt/c/Projects/Planza/backend && npx eslint src --ext .ts
```
Expected: No errors (both usages already fixed).

- [ ] **Step 5: Run tests**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run
```
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/middleware/tenantContext.ts src/services/cascade/engine.ts .eslintrc* eslint.config*
git commit -m "fix(security): replace $executeRawUnsafe with parameterized $executeRaw"
```

---

## Task 4: Add Authentication to Unprotected Routes

**Files:**
- Modify: `backend/src/index.ts` (route mounts)

- [ ] **Step 1: Add authenticate middleware at mount level for operational routes**

In `backend/src/index.ts`, update these route mounts to add `authenticate`:

```typescript
// BEFORE:
app.use('/api/events', eventsRoutes)
app.use('/api/venues', venueRoutes)
app.use('/api/teams', teamRoutes)
app.use('/api/courts', courtRoutes)
app.use('/api/seasons', seasonRoutes)
app.use('/api/fields', fieldConfigRoutes)

// AFTER:
app.use('/api/events', authenticate, eventsRoutes)
app.use('/api/venues', authenticate, venueRoutes)
app.use('/api/teams', authenticate, teamRoutes)
app.use('/api/courts', authenticate, courtRoutes)
app.use('/api/seasons', authenticate, seasonRoutes)
app.use('/api/fields', authenticate, fieldConfigRoutes)
```

These routes already have `authenticate` on their write endpoints (POST/PUT/DELETE) inline, so adding it at the mount level protects the GET endpoints too. The inline `authenticate` calls become redundant but harmless — they can be cleaned up later.

**NOT adding mount-level auth to `/api/adapters`** — its CRUD routes already have per-endpoint `authenticate` + `authorize('admin')`, and the webhook endpoint needs HMAC verification instead of JWT auth (handled in Task 5).

Routes that stay public (no change):
- `/api/sports`, `/api/competitions`, `/api/encoders` — reference data
- `/api/publish` — external feed consumers
- `/api/adapters` — per-endpoint auth already in place; webhook uses HMAC

- [ ] **Step 2: Run existing tests**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run
```
Expected: Tests that hit these GET endpoints without auth tokens will fail. Fix test setup to include auth headers.

- [ ] **Step 3: Fix any failing tests by adding auth tokens**

For tests that hit the newly-protected routes, add an Authorization header:
```typescript
const res = await request(app)
  .get('/api/events')
  .set('Authorization', `Bearer ${testToken}`)
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts tests/
git commit -m "fix(security): add authentication to events, venues, teams, courts, seasons, fields, adapters routes"
```

---

## Task 5: HMAC Webhook Verification Middleware

**Files:**
- Create: `backend/src/middleware/hmac.ts`
- Create: `backend/tests/hmac.test.ts`
- Modify: `backend/src/index.ts` (raw body preservation)

- [ ] **Step 1: Add raw body preservation to express.json()**

In `backend/src/index.ts`, replace the existing `express.json()` line:
```typescript
// BEFORE:
app.use(express.json({ limit: '10mb' }))

// AFTER:
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { (req as any).rawBody = buf }
}))
```

For the import routes that need a higher limit, add a route-level override **inside** the import router file (`backend/src/routes/import.ts`) at the top, before any route handlers:
```typescript
// At top of import.ts router:
router.use(express.json({ limit: '10mb' }))
```
This works because Express allows route-level body parsers to override the global one when the body hasn't been parsed yet. Alternatively, the import route mount in index.ts can use:
```typescript
app.use('/api/import', express.json({ limit: '10mb' }), importRoutes)
```
placed **before** the global `express.json()` call so it takes precedence for `/api/import` paths.

- [ ] **Step 2: Write HMAC integration test**

```typescript
// backend/tests/hmac.test.ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import express from 'express'
import request from 'supertest'
import { verifyHmac } from '../src/middleware/hmac.js'

// Note: This test requires mocking prisma.adapterConfig.findUnique
// to return a config with a known secret. Use vi.mock or dependency injection.

describe('HMAC verification', () => {
  const secret = 'test-webhook-secret-32chars-min!!'

  function sign(body: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
  }

  it('should reject request without X-Signature-256 header', async () => {
    const app = express()
    app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf } }))
    app.post('/webhook', verifyHmac(), (req, res) => res.json({ ok: true }))

    const res = await request(app)
      .post('/webhook')
      .send({ event: 'test' })
    expect(res.status).toBe(401)
    expect(res.body.message).toContain('Missing X-Signature-256')
  })

  it('should reject request with invalid signature', async () => {
    const app = express()
    app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf } }))
    app.post('/webhook', verifyHmac(), (req, res) => res.json({ ok: true }))

    const res = await request(app)
      .post('/webhook?configId=test-config')
      .set('X-Signature-256', 'sha256=invalid')
      .send({ event: 'test' })
    // Will be 401 (either missing adapter or invalid sig)
    expect(res.status).toBe(401)
  })

  it('should compute correct HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ event: 'test', data: { id: 1 } })
    const signature = sign(body)
    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/)
  })
})
```

- [ ] **Step 3: Create HMAC middleware**

```typescript
// backend/src/middleware/hmac.ts
import { Request, Response, NextFunction } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '../db/prisma.js'
import { createError } from './errorHandler.js'

export function verifyHmac() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const signature = req.headers['x-signature-256'] as string | undefined
      if (!signature) {
        return next(createError(401, 'Missing X-Signature-256 header'))
      }

      const configId = (req.query.configId || req.body?.configId) as string | undefined
      if (!configId) {
        return next(createError(401, 'Missing configId'))
      }

      const adapter = await prisma.adapterConfig.findUnique({ where: { id: configId } })
      if (!adapter || !adapter.config || !(adapter.config as any).secret) {
        return next(createError(401, 'Unknown adapter or missing secret'))
      }

      const secret = (adapter.config as any).secret as string
      const rawBody = (req as any).rawBody as Buffer | undefined
      if (!rawBody) {
        return next(createError(500, 'Raw body not available for HMAC verification'))
      }

      const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')

      const sigBuf = Buffer.from(signature, 'utf8')
      const expBuf = Buffer.from(expected, 'utf8')

      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        return next(createError(401, 'Invalid signature'))
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}
```

- [ ] **Step 4: Wire HMAC into adapters route**

In `backend/src/routes/adapters.ts`, add HMAC to the live-score webhook:
```typescript
import { verifyHmac } from '../middleware/hmac.js'

// Replace the existing POST /live-score/webhook handler:
router.post('/live-score/webhook', verifyHmac(), async (req, res, next) => {
  // ... existing handler
})
```

For placeholder endpoints (`/oop/webhook`, `/live-timing/webhook`, `/as-run/webhook`), add `authenticate`:
```typescript
router.post('/oop/webhook', authenticate, (req, res) => res.status(501).json({ error: 'Not implemented' }))
router.post('/live-timing/webhook', authenticate, (req, res) => res.status(501).json({ error: 'Not implemented' }))
router.post('/as-run/webhook', authenticate, (req, res) => res.status(501).json({ error: 'Not implemented' }))
```

- [ ] **Step 5: Run tests**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/middleware/hmac.ts src/index.ts src/routes/adapters.ts tests/hmac.test.ts
git commit -m "feat(security): add HMAC signature verification for inbound webhooks"
```

---

## Task 6: Tiered Rate Limiting

**Files:**
- Create: `backend/src/middleware/rateLimits.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create rate limiter instances**

```typescript
// backend/src/middleware/rateLimits.ts
import rateLimit from 'express-rate-limit'

/** Public endpoints (publish feeds) — 60 req/min per IP */
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

/** Authenticated endpoints — 200 req/min per user ID */
export const standardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user as any)?.id || req.ip || 'unknown',
  message: { error: 'Too many requests, please try again later.' },
})

/** Inbound webhooks — 30 req/min per IP */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests.' },
})

/** Auth endpoints — 10 req/min per IP */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
})
```

- [ ] **Step 2: Wire into index.ts**

Replace the existing global rate limiter block (lines 94-99) with per-route application:

```typescript
import { publicLimiter, standardLimiter, webhookLimiter, authLimiter } from './middleware/rateLimits.js'

// Remove old:
// const limiter = rateLimit({ ... })
// app.use('/api/', limiter)

// Add per-route (after auth middleware, before route handlers):
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/publish', publicLimiter, publishRoutes)

// For authenticated routes, standardLimiter goes AFTER authenticate:
app.use('/api/events', authenticate, standardLimiter, eventsRoutes)
// ... repeat for all other authenticated route mounts
```

The webhook limiter is applied within the adapters route file directly.

- [ ] **Step 3: Run tests**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/middleware/rateLimits.ts src/index.ts
git commit -m "feat(security): add tiered rate limiting (public/standard/webhook/auth)"
```

---

## Task 7: Helmet, CORS, Body Limit Hardening

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Configure helmet — disable CSP for API-only server**

```typescript
// BEFORE:
app.use(helmet())

// AFTER:
app.use(helmet({ contentSecurityPolicy: false }))
```

- [ ] **Step 2: Remove credentials: true from CORS**

```typescript
// BEFORE:
app.use(cors({ origin: corsOrigins, credentials: true }))

// AFTER:
app.use(cors({ origin: corsOrigins }))
```

- [ ] **Step 3: Add trust proxy documentation comment**

```typescript
// Number of proxy layers between client and this server.
// Must match production deployment topology for correct IP extraction in rate limiting.
// Set to 1 for single reverse proxy (nginx/ALB), 2 for two layers, etc.
app.set('trust proxy', 1)
```

- [ ] **Step 4: Run tests**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "fix(security): harden helmet config, remove CORS credentials, lower body limit"
```

---

## Task 8: Create Zod Validation Middleware & Common Schemas

**Files:**
- Create: `backend/src/middleware/validate.ts`
- Create: `backend/src/schemas/common.ts`
- Create: `backend/tests/validate.test.ts`

- [ ] **Step 1: Write validation middleware test**

```typescript
// backend/tests/validate.test.ts
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { z } from 'zod'
import { validate } from '../src/middleware/validate.js'

function createApp() {
  const app = express()
  app.use(express.json())

  app.post('/test/:id',
    validate({
      params: z.object({ id: z.coerce.number().int().positive() }),
      body: z.object({ name: z.string().min(1) }),
    }),
    (req, res) => {
      res.json({ id: req.params.id, name: req.body.name })
    }
  )

  app.get('/search',
    validate({
      query: z.object({
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
    }),
    (req, res) => {
      res.json({ q: req.query.q, limit: req.query.limit })
    }
  )

  return app
}

describe('validate middleware', () => {
  it('should parse valid params and body', async () => {
    const res = await request(createApp())
      .post('/test/42')
      .send({ name: 'Hello' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 42, name: 'Hello' })
  })

  it('should reject invalid param', async () => {
    const res = await request(createApp())
      .post('/test/abc')
      .send({ name: 'Hello' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Validation failed')
    expect(res.body.details).toHaveProperty('params')
  })

  it('should reject missing required body field', async () => {
    const res = await request(createApp())
      .post('/test/1')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.details).toHaveProperty('body')
  })

  it('should apply query defaults', async () => {
    const res = await request(createApp())
      .get('/search')
    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(20)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run tests/validate.test.ts
```
Expected: FAIL — `validate` doesn't exist.

- [ ] **Step 3: Create validate middleware**

```typescript
// backend/src/middleware/validate.ts
import { Request, Response, NextFunction, RequestHandler } from 'express'
import { ZodSchema, ZodError } from 'zod'

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
        req.params = result.data
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
```

- [ ] **Step 4: Create common schemas**

```typescript
// backend/src/schemas/common.ts
import { z } from 'zod'

/** Numeric ID route param (e.g., /events/:id) */
export const idParam = z.object({
  id: z.coerce.number().int().positive(),
})

/** UUID route param (e.g., /adapters/:id, /webhooks/:id) */
export const uuidParam = z.object({
  id: z.string().uuid(),
})

/** Standard pagination query params */
export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

/** Date range filter */
export const dateRangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

/** Sort query params */
export const sortQuery = z.object({
  sortBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
})

/** Event status enum — used across events, bulk ops, publish */
export const eventStatusEnum = z.enum([
  'draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled'
])

/** Positive integer — reusable for FK references */
export const positiveInt = z.coerce.number().int().positive()

/** Optional positive integer (nullable FK) */
export const optionalPositiveInt = z.coerce.number().int().positive().nullable().optional()

/** Time string HH:MM */
export const timeString = z.string().regex(/^\d{2}:\d{2}$/)

/** ISO date string (YYYY-MM-DD) */
export const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Bulk IDs array (1-100 items) */
export const bulkIds = z.array(positiveInt).min(1).max(100)
```

- [ ] **Step 5: Run tests**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run tests/validate.test.ts
```
Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/middleware/validate.ts src/schemas/common.ts tests/validate.test.ts
git commit -m "feat: add Zod validation middleware and common schemas"
```

---

## Task 9: Migrate Events Route — Joi to Zod

This is the largest route file. All other migrations follow this pattern.

**Files:**
- Create: `backend/src/schemas/events.ts`
- Modify: `backend/src/routes/events.ts`

- [ ] **Step 1: Create events schema file**

```typescript
// backend/src/schemas/events.ts
import { z } from 'zod'
import {
  positiveInt, optionalPositiveInt, eventStatusEnum,
  timeString, isoDateString, bulkIds, idParam
} from './common.js'

export const eventBody = z.object({
  sportId: positiveInt,
  competitionId: positiveInt,
  phase: z.string().optional().default(''),
  category: z.string().optional().default(''),
  participants: z.string().min(1),
  content: z.string().optional().default(''),
  startDateBE: isoDateString,
  startTimeBE: timeString,
  startDateOrigin: isoDateString.optional().default(''),
  startTimeOrigin: timeString.optional().or(z.literal('')).default(''),
  complex: z.string().optional().default(''),
  livestreamDate: isoDateString.optional().or(z.literal('')).default(''),
  livestreamTime: timeString.optional().or(z.literal('')).default(''),
  channelId: optionalPositiveInt,
  radioChannelId: optionalPositiveInt,
  onDemandChannelId: optionalPositiveInt,
  linearChannel: z.string().optional().default(''),
  radioChannel: z.string().optional().default(''),
  onDemandChannel: z.string().optional().default(''),
  linearStartTime: timeString.optional().or(z.literal('')).default(''),
  durationMin: z.coerce.number().int().min(1).nullable().optional(),
  isLive: z.boolean().optional(),
  isDelayedLive: z.boolean().optional(),
  videoRef: z.string().optional().default(''),
  winner: z.string().optional().default(''),
  score: z.string().optional().default(''),
  duration: z.string().optional().default(''),
  customFields: z.record(z.unknown()).optional(),
  customValues: z.array(z.object({
    fieldId: z.string(),
    fieldValue: z.string(),
  })).default([]),
  status: eventStatusEnum.optional(),
  seriesId: z.string().nullable().optional(),
})

export const statusUpdateBody = z.object({
  status: eventStatusEnum,
})

export const conflictCheckBody = z.object({
  id: positiveInt.optional(),
  competitionId: positiveInt.optional(),
  channelId: positiveInt.optional(),
  radioChannelId: positiveInt.optional(),
  onDemandChannelId: positiveInt.optional(),
  linearChannel: z.string().optional(),
  onDemandChannel: z.string().optional(),
  radioChannel: z.string().optional(),
  startDateBE: isoDateString.optional(),
  startTimeBE: timeString.optional(),
  status: eventStatusEnum.optional(),
})

export const bulkDeleteBody = z.object({ ids: bulkIds })

export const bulkStatusBody = z.object({
  ids: bulkIds,
  status: eventStatusEnum,
})

export const bulkRescheduleBody = z.object({
  ids: bulkIds,
  shiftDays: z.number().int().min(-365).max(365),
})

export const bulkAssignBody = z.object({
  ids: bulkIds,
  field: z.enum(['linearChannel', 'channelId', 'sportId', 'competitionId']),
  value: z.union([z.string(), z.number()]),
})

export const eventsQuery = z.object({
  sportId: z.coerce.number().int().positive().optional(),
  competitionId: z.coerce.number().int().positive().optional(),
  channel: z.string().optional(),
  channelId: z.coerce.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
})

export { idParam }
```

- [ ] **Step 2: Update events.ts route — remove Joi, wire Zod**

In `backend/src/routes/events.ts`:
1. Remove `import Joi from 'joi'`
2. Remove all Joi schema definitions (lines 31-113)
3. Remove the `parseId()` function (lines 26-29)
4. Add imports:
   ```typescript
   import { validate } from '../middleware/validate.js'
   import * as s from '../schemas/events.js'
   ```
5. Add `validate()` middleware to each route:
   - `router.get('/', validate({ query: s.eventsQuery }), ...)`
   - `router.get('/:id', validate({ params: s.idParam }), ...)`
   - `router.post('/', authenticate, authorize('sports', 'admin'), validate({ body: s.eventBody }), ...)`
   - `router.put('/:id', authenticate, ..., validate({ params: s.idParam, body: s.eventBody }), ...)`
   - `router.put('/:id/status', authenticate, ..., validate({ params: s.idParam, body: s.statusUpdateBody }), ...)`
   - `router.post('/conflicts', authenticate, validate({ body: s.conflictCheckBody }), ...)`
   - `router.post('/conflicts/bulk', authenticate, validate({ body: ... }), ...)`
   - `router.delete('/bulk', authenticate, ..., validate({ body: s.bulkDeleteBody }), ...)`
   - `router.patch('/bulk/status', authenticate, ..., validate({ body: s.bulkStatusBody }), ...)`
   - `router.patch('/bulk/reschedule', authenticate, ..., validate({ body: s.bulkRescheduleBody }), ...)`
   - `router.patch('/bulk/assign', authenticate, ..., validate({ body: s.bulkAssignBody }), ...)`

6. Inside handlers, replace all `Joi.validate()` patterns:
   ```typescript
   // BEFORE:
   const { error, value } = eventSchema.validate(req.body)
   if (error) return next(createError(400, error.details[0].message))

   // AFTER: (remove — validate middleware already parsed req.body)
   const value = req.body
   ```

7. Replace `parseId(req.params.id)` → `req.params.id` (already a number from Zod).

- [ ] **Step 3: Run tests**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run tests/events.test.ts tests/eventsBulk.test.ts tests/eventStatus.test.ts tests/eventTransitions.test.ts
```
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/schemas/events.ts src/routes/events.ts
git commit -m "refactor: migrate events route from Joi to Zod validation"
```

---

## Task 10: Migrate Remaining Joi Routes (Batch)

Each route follows the same pattern as Task 9. Group by similarity for efficiency.

**Files:**
- Create: `backend/src/schemas/{techPlans,contracts,crewMembers,crewTemplates,encoders,resources,import,fieldConfig,settings,users,savedViews,venues,teams,courts,seasons,importSchedules}.ts`
- Modify: Corresponding route files

- [ ] **Step 1: Create schema files for all Joi-using routes**

For each route with existing Joi schemas, create a corresponding schema file in `backend/src/schemas/`. Translate each Joi schema to Zod mechanically:

| Joi | Zod equivalent |
|-----|---------------|
| `Joi.string().required()` | `z.string().min(1)` |
| `Joi.string().allow('')` | `z.string().default('')` |
| `Joi.string().allow('').optional()` | `z.string().optional().default('')` |
| `Joi.number().integer().min(1).required()` | `positiveInt` (from common) |
| `Joi.number().integer().min(1).allow(null)` | `optionalPositiveInt` (from common) |
| `Joi.boolean()` | `z.boolean().optional()` |
| `Joi.string().isoDate()` | `isoDateString` (from common) |
| `Joi.string().valid('a', 'b')` | `z.enum(['a', 'b'])` |
| `Joi.array().items(...)` | `z.array(...)` |
| `Joi.object({...})` | `z.object({...})` |
| `Joi.alternatives().try(...)` | `z.union([...])` |

- [ ] **Step 2: Update each route file**

For each route file:
1. Remove `import Joi from 'joi'`
2. Remove inline Joi schema definitions
3. Add `import { validate } from '../middleware/validate.js'`
4. Add schema import
5. Wire `validate()` middleware on each endpoint
6. Remove inline `schema.validate()` calls and `parseId()` usages

- [ ] **Step 3: Run full test suite after each batch of 3-4 routes**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run
```

- [ ] **Step 4: Commit per batch (3-4 routes per commit)**

```bash
# Example for first batch:
git add src/schemas/techPlans.ts src/schemas/contracts.ts src/schemas/crewMembers.ts src/schemas/crewTemplates.ts
git add src/routes/techPlans.ts src/routes/contracts.ts src/routes/crewMembers.ts src/routes/crewTemplates.ts
git commit -m "refactor: migrate techPlans, contracts, crewMembers, crewTemplates from Joi to Zod"

# Second batch:
git add src/schemas/encoders.ts src/schemas/resources.ts src/schemas/import.ts src/schemas/fieldConfig.ts
git add src/routes/encoders.ts src/routes/resources.ts src/routes/import.ts src/routes/fieldConfig.ts
git commit -m "refactor: migrate encoders, resources, import, fieldConfig from Joi to Zod"

# Third batch:
git add src/schemas/settings.ts src/schemas/users.ts src/schemas/savedViews.ts src/schemas/importSchedules.ts
git add src/routes/settings.ts src/routes/users.ts src/routes/savedViews.ts src/routes/importSchedules.ts
git commit -m "refactor: migrate settings, users, savedViews, importSchedules from Joi to Zod"

# Fourth batch:
git add src/schemas/venues.ts src/schemas/teams.ts src/schemas/courts.ts src/schemas/seasons.ts
git add src/routes/venues.ts src/routes/teams.ts src/routes/courts.ts src/routes/seasons.ts
git commit -m "refactor: migrate venues, teams, courts, seasons from Joi to Zod"
```

---

## Task 11: Add Zod Schemas to Previously Unvalidated Routes

**Files:**
- Create: `backend/src/schemas/{sports,competitions,publish,broadcastSlots,channels,schedules,rights,channelSwitches,notifications,audit,adapters}.ts`
- Modify: Corresponding route files

- [ ] **Step 1: Create schemas for unvalidated routes**

These routes currently have no Joi schemas. Read each route file, identify the body/query/params shape from the handler code, and write corresponding Zod schemas.

For example, `sports.ts` currently does:
```typescript
const { name, icon, color } = req.body
if (!name || !icon) return next(createError(400, 'Name and icon are required'))
```

Replace with schema:
```typescript
// backend/src/schemas/sports.ts
import { z } from 'zod'
import { idParam } from './common.js'

export const sportBody = z.object({
  name: z.string().min(1),
  icon: z.string().min(1),
  color: z.string().optional(),
})

export { idParam }
```

Repeat for each unvalidated route. Key schemas to create:

- **sports.ts**: `sportBody` (name, icon, color)
- **competitions.ts**: `competitionBody` (name, sportId, season, etc.)
- **publish.ts**: `publishEventsQuery` (channel, sport, from, to, cursor, limit, format)
- **broadcastSlots.ts**: `slotBody` (channelId, eventId, schedulingMode, dates, etc.), `slotQuery` (channelId, status, dateStart, dateEnd)
- **channels.ts**: `channelBody` (name, type, color, parentId, etc.)
- **schedules.ts**: `draftBody`, `draftQuery`
- **rights.ts**: `policyBody`
- **channelSwitches.ts**: `switchBody`, `confirmBody`
- **notifications.ts**: `notificationParams` (id)
- **audit.ts**: `auditQuery` (filters), `restoreParams`
- **adapters.ts**: `adapterConfigBody`
- **csvImport.ts**: `csvUploadQuery` (if it has query/body params — check file first; if purely file-upload based with multer, add Zod validation for any non-file fields)

- [ ] **Step 2: Wire validate() into each route**

Same pattern as Task 9-10: add `validate()` middleware, remove inline validation.

- [ ] **Step 3: Run full test suite**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run
```

- [ ] **Step 4: Commit per batch**

```bash
# Batch 1:
git add src/schemas/sports.ts src/schemas/competitions.ts src/schemas/channels.ts
git add src/routes/sports.ts src/routes/competitions.ts src/routes/channels.ts
git commit -m "feat: add Zod validation to sports, competitions, channels routes"

# Batch 2:
git add src/schemas/broadcastSlots.ts src/schemas/schedules.ts src/schemas/rights.ts
git add src/routes/broadcastSlots.ts src/routes/schedules.ts src/routes/rights.ts
git commit -m "feat: add Zod validation to broadcastSlots, schedules, rights routes"

# Batch 3:
git add src/schemas/channelSwitches.ts src/schemas/notifications.ts src/schemas/audit.ts
git add src/routes/channelSwitches.ts src/routes/notifications.ts src/routes/audit.ts
git commit -m "feat: add Zod validation to channelSwitches, notifications, audit routes"

# Batch 4:
git add src/schemas/publish.ts src/schemas/adapters.ts
git add src/routes/publish.ts src/routes/adapters.ts
git commit -m "feat: add Zod validation to publish and adapters routes"
```

---

## Task 12: Remove Joi & Final Verification

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Verify no Joi references remain**

```bash
cd /mnt/c/Projects/Planza/backend && grep -r "from 'joi'" src/ && echo "FAIL: Joi still referenced" || echo "OK: No Joi references"
grep -r "import Joi" src/ && echo "FAIL: Joi still imported" || echo "OK: No Joi imports"
```
Expected: Both print "OK".

- [ ] **Step 2: Uninstall Joi**

```bash
cd /mnt/c/Projects/Planza/backend && npm uninstall joi
```

- [ ] **Step 3: Run full test suite**

```bash
cd /mnt/c/Projects/Planza/backend && npx vitest run
```
Expected: All tests pass.

- [ ] **Step 4: Run TypeScript check**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
```
Expected: Zero errors.

- [ ] **Step 5: Run ESLint**

```bash
cd /mnt/c/Projects/Planza/backend && npx eslint src --ext .ts
```
Expected: No errors (including no `$executeRawUnsafe` violations).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove Joi dependency — fully replaced by Zod"
```

---

## Task 13: Final Integration Smoke Test

- [ ] **Step 1: Start the backend**

```bash
cd /mnt/c/Projects/Planza/backend && npm run dev
```
Expected: Server starts with no warnings about missing env vars (development mode).

- [ ] **Step 2: Test protected route without auth**

```bash
curl -s http://localhost:3001/api/events | jq .
```
Expected: `{ "status": "fail", "message": "Unauthorized" }` with 401 status.

- [ ] **Step 3: Test public route still works**

```bash
curl -s http://localhost:3001/api/sports | jq .
```
Expected: Array of sports (200 OK, no auth required).

- [ ] **Step 4: Test validation error**

```bash
curl -s -X POST http://localhost:3001/api/events -H "Content-Type: application/json" -H "Authorization: Bearer <test-token>" -d '{"sportId": "abc"}' | jq .
```
Expected: 400 with `{ "error": "Validation failed", "details": { "body": [...] } }`.

- [ ] **Step 5: Test rate limiting**

```bash
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/auth/dev-login -H "Content-Type: application/json" -d '{"email":"test@test.com","role":"admin"}'; done
```
Expected: First 10 return 200, last 2 return 429 (auth rate limit: 10 req/min).

- [ ] **Step 6: Stop server and commit any fixes**

If any smoke test revealed issues, fix and commit. Otherwise, create a final summary commit:

```bash
git add -A && git commit -m "docs: production hardening complete — all 12 tasks implemented"
```
