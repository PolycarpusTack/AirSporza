# Production Hardening — Design Spec

**Date:** 2026-03-25
**Scope:** Sub-project A — security fixes, env validation, input validation, auth gaps
**Status:** Approved (rev 2 — post spec review)

## Overview

Harden the Planza backend for production deployment by fixing security vulnerabilities, adding startup environment validation, closing authentication gaps, migrating to Zod for input validation, and eliminating unsafe parsing patterns.

## Out of Scope

- CSRF protection (not needed — app uses Bearer token auth via Authorization header, not cookies)
- Pagination on list endpoints (sub-project D: UX/QoL)
- N+1 query fixes (sub-project B: Code Quality)
- Database index gaps (separate concern)
- Frontend changes (backend-only pass)
- Socket.IO authentication/rate limiting (separate concern — requires different approach than HTTP middleware)

---

## Section 1: Startup Environment Validation

### Problem

Environment variables are read with silent fallbacks scattered across 6+ files (`config/index.ts`, `queue.ts`, `index.ts`, `auth.ts`). In production, missing `DATABASE_URL` falls back to an empty string; missing `JWT_SECRET` falls back to a hardcoded dev key. No failure, no warning — just broken behavior.

### Design

Create `backend/src/config/env.ts` with a Zod schema that parses `process.env` at import time.

**Schema:**

| Variable | Required in prod | Dev default | Validation |
|----------|-----------------|-------------|------------|
| `NODE_ENV` | No | `development` | `enum('development', 'production', 'test')` |
| `DATABASE_URL` | Yes | `postgresql://sporza:sporza@localhost:5432/sporza_planner` | `string().startsWith('postgresql://')` |
| `JWT_SECRET` | Yes (min 32 chars) | `dev-secret-key-change-in-production` | `string().min(32)` in production |
| `JWT_EXPIRES_IN` | No | `24h` | `string().optional()` |
| `REDIS_URL` | Yes | `redis://localhost:6379` | `string().startsWith('redis://')` |
| `PORT` | No | `3001` | `coerce.number().int().positive()` |
| `CORS_ORIGIN` | Yes | `http://localhost:5173` | `string()` (comma-separated URLs) |
| `OAUTH_CLIENT_ID` | No | empty | `string().optional()` |
| `OAUTH_CLIENT_SECRET` | No | empty | `string().optional()` |
| `OAUTH_AUTHORIZATION_URL` | No | empty | `string().url().optional()` |
| `OAUTH_TOKEN_URL` | No | empty | `string().url().optional()` |
| `OAUTH_CALLBACK_URL` | No | empty | `string().url().optional()` |
| `OAUTH_USER_INFO_URL` | No | empty | `string().url().optional()` |
| `IMPORT_WORKER_POLL_MS` | No | `5000` | `coerce.number().int().positive().optional()` |
| `IMPORT_JOB_LEASE_MS` | No | `300000` | `coerce.number().int().positive().optional()` |
| `IMPORT_JOB_HEARTBEAT_MS` | No | `30000` | `coerce.number().int().positive().optional()` |
| `IMPORT_JOB_MAX_RETRIES` | No | `3` | `coerce.number().int().positive().optional()` |
| `IMPORT_WORKER_ID` | No | auto-generated | `string().optional()` |

> **Note:** The env var is `CORS_ORIGIN` (singular) — matching existing code in `config/index.ts:20`. The original spec had `CORS_ORIGINS` (plural) which was a typo.

**Behavior:**
- In `production`: missing required vars causes process exit with a clear error listing all missing/invalid vars.
- In `development`/`test`: missing vars use defaults, log a warning.
- Exports a typed `env` object. All consumers import from `env.ts` instead of reading `process.env` directly.
- `backend/src/middleware/errorHandler.ts` should use `env.NODE_ENV` (not raw `process.env.NODE_ENV`) to control stack trace exposure.

**Files to change:**
- Create: `backend/src/config/env.ts`
- Update: `backend/src/config/index.ts` (import from env.ts)
- Update: `backend/src/index.ts` (use env.PORT, env.DATABASE_URL)
- Update: `backend/src/services/queue.ts` (use env.REDIS_URL)
- Update: `backend/src/routes/auth.ts` (use env.OAUTH_*)
- Update: `backend/src/middleware/auth.ts` (use env.JWT_SECRET)
- Update: `backend/src/middleware/errorHandler.ts` (use env.NODE_ENV)
- Update: `backend/src/import/services/ImportJobState.ts` (use env.IMPORT_WORKER_*)
- Update: `backend/src/import/services/ImportWorkerService.ts` (use env.IMPORT_WORKER_ID)

---

## Section 2: SQL Injection Fix & Safe Query Patterns

### Problem

Two files use `$executeRawUnsafe()` — one with string interpolation (SQL injection vector), one with a numeric value (lower risk but still unsafe pattern):

1. `backend/src/middleware/tenantContext.ts:30` — string interpolation with tenant ID
2. `backend/src/services/cascade/engine.ts:35` — numeric advisory lock key from `hashCode()`

### Design

**Fix both:**
```typescript
// tenantContext.ts — BEFORE:
await prisma.$executeRawUnsafe(`SELECT set_tenant_context('${defaultTenantId}')`)
// AFTER:
await prisma.$executeRaw`SELECT set_tenant_context(${defaultTenantId})`

// engine.ts — BEFORE:
await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`)
// AFTER:
await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`
```

**Prevention:** Add ESLint rule to ban `$executeRawUnsafe`:
```json
{
  "no-restricted-properties": ["error", {
    "object": "prisma",
    "property": "$executeRawUnsafe",
    "message": "Use $executeRaw with tagged template literals for parameterized queries"
  }]
}
```

**Files to change:**
- Fix: `backend/src/middleware/tenantContext.ts`
- Fix: `backend/src/services/cascade/engine.ts`
- Update: `backend/.eslintrc.*` (add rule)

---

## Section 3: Route Authentication & Rate Limiting

### Problem

Several routes with side effects or sensitive data lack authentication. The global rate limit (500 req/15min) is too generous for auth endpoints and too restrictive for high-traffic publish feeds.

### 3a: Authentication Fixes

**Routes needing auth added:**

| Route | Current | Fix |
|-------|---------|-----|
| `GET /fields` | No auth | Add `authenticate` at router level |
| `GET /fields/dropdowns` | No auth | Covered by router-level auth |
| `GET /fields/mandatory/:sportId` | No auth | Covered by router-level auth |
| `POST /adapters/live-score/webhook` | No auth | HMAC signature verification (see 3b) |
| Placeholder webhooks (`/oop`, `/live-timing`, `/as-run`) | No auth, return 501 | Add `authenticate` or remove until implemented |

> **Note:** `GET /broadcast-slots` and `GET /broadcast-slots/:id` were originally listed but are already protected — `index.ts` mounts the router with `authenticate` at the router level. No fix needed.

**Intentionally public routes (no auth needed):**

| Route | Reason |
|-------|--------|
| `GET /publish/*` | External feed consumers (EPG, widgets, third-party integrations) |
| `GET /sports`, `GET /sports/:id` | Reference data needed for public-facing UIs |
| `GET /competitions`, `GET /competitions/:id` | Reference data needed for public-facing UIs |
| `GET /encoders` | Reference data |

**Routes that need auth added (operational data):**

| Route | Fix |
|-------|-----|
| `GET /events`, `GET /events/:id` | Add `authenticate` at router level |
| `GET /venues`, `GET /venues/:id` | Add `authenticate` at router level |
| `GET /teams`, `GET /teams/:id`, `GET /teams/autocomplete` | Add `authenticate` at router level |
| `GET /courts`, `GET /courts/:id` | Add `authenticate` at router level |
| `GET /seasons`, `GET /seasons/:id` | Add `authenticate` at router level |

### 3b: HMAC Webhook Verification

Create `backend/src/middleware/hmac.ts`:
- Extract `X-Signature-256` header
- Compute `HMAC-SHA256(rawBody, adapterConfig.secret)` using the **raw request body bytes**
- Compare using `crypto.timingSafeEqual`
- Return 401 on mismatch
- Reuses the pattern already in `webhookWorker.ts`

**Raw body preservation:** `express.json()` parses the body before route handlers, destroying the original bytes. To preserve them for HMAC verification:
```typescript
// In index.ts, add verify callback to express.json():
app.use(express.json({
  limit: '1mb',  // lowered from 10mb (see Section 3e)
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf
  }
}))
```
The HMAC middleware reads `req.rawBody` for signature computation. This adds negligible memory overhead (the buffer is already in memory during parsing).

The middleware looks up the adapter config by `configId` (from query or body) to retrieve the shared secret. If no configId is provided or the config doesn't exist, return 401.

### 3c: Per-Tier Rate Limiting

Replace the single global rate limiter with tiered limits:

| Tier | Limit | Window | Routes | Key |
|------|-------|--------|--------|-----|
| `public` | 60 req | 1 min | `/publish/*` | IP |
| `standard` | 200 req | 1 min | All authenticated routes | User ID |
| `webhook` | 30 req | 1 min | `/adapters/live-score/webhook` | IP |
| `auth` | 10 req | 1 min | `/auth/dev-login`, `/auth/callback` | IP |

**Middleware ordering:** The `standard` tier uses User ID as the rate limit key. This requires `authenticate` to run first (to populate `req.user`). The rate limiter must be placed **after** `authenticate` in the middleware chain:
```typescript
// Correct ordering:
app.use('/api/events', authenticate, standardLimiter, eventRoutes)
// NOT:
app.use('/api/events', standardLimiter, authenticate, eventRoutes)
```

Implementation: Create rate limiter instances in `backend/src/middleware/rateLimits.ts`, apply per-router in `index.ts`.

### 3d: Security Headers (Helmet)

Helmet is **already installed** (`helmet: ^8.0.0` in `package.json`, applied at `index.ts:88` with default config). This is NOT a new dependency.

Since this is a **JSON API server** (not serving HTML), custom CSP directives are unnecessary — browsers don't enforce CSP on XHR/fetch responses. Keep helmet's defaults (which include `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.) but **disable CSP** since it's inert for an API:

```typescript
app.use(helmet({
  contentSecurityPolicy: false
}))
```

### 3e: Additional Hardening

**Lower global body size limit:**
```typescript
// Default: 1mb (down from 10mb)
app.use(express.json({ limit: '1mb', verify: ... }))

// Per-route override for CSV import:
app.use('/api/import', express.json({ limit: '10mb' }), importRoutes)
```

**Remove unnecessary `credentials: true` from CORS:**
The app uses Bearer token auth (not cookies). `credentials: true` allows browsers to send cookies cross-origin, which is unnecessary and slightly increases attack surface.
```typescript
// BEFORE:
app.use(cors({ origin: ..., credentials: true }))
// AFTER:
app.use(cors({ origin: ... }))
```

**Validate `trust proxy` setting:**
`index.ts:86` sets `app.set('trust proxy', 1)`. Document that this must match the number of proxy layers in the production deployment topology (critical for correct IP extraction in rate limiting).

**Files to change:**
- Create: `backend/src/middleware/hmac.ts`
- Create: `backend/src/middleware/rateLimits.ts`
- Update: `backend/src/index.ts` (route-level auth, rate limiters, helmet config, body limit, CORS, raw body verify)
- Update: `backend/src/routes/fieldConfig.ts` (add authenticate at router level)
- Update: `backend/src/routes/events.ts` (auth at router level in index.ts)
- Update: `backend/src/routes/venues.ts` (auth at router level in index.ts)
- Update: `backend/src/routes/teams.ts` (auth at router level in index.ts)
- Update: `backend/src/routes/courts.ts` (auth at router level in index.ts)
- Update: `backend/src/routes/seasons.ts` (auth at router level in index.ts)
- Update: `backend/src/routes/adapters.ts` (HMAC middleware on webhook, auth on placeholders)

---

## Section 4: Zod Migration & Input Validation

### Problem

Input validation is inconsistent: some routes use Joi, many routes have no validation at all, and inline `parseInt()`/`Number()`/`as string` casts are scattered through handlers.

### Design

#### 4a: Validation Middleware

Create `backend/src/middleware/validate.ts`:
```typescript
import { ZodSchema } from 'zod'

interface ValidationSchemas {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
}

function validate(schemas: ValidationSchemas): RequestHandler
```

- Parses `req.body`, `req.query`, `req.params` through provided Zod schemas
- Replaces the original values with parsed (typed, coerced) output
- On failure: returns 400 with structured error indicating which part failed:
  ```json
  {
    "error": "Validation failed",
    "details": {
      "body": [...zodIssues],
      "query": [...zodIssues],
      "params": [...zodIssues]
    }
  }
  ```
  Only keys with errors are included in `details`.

#### 4b: Shared Schemas

Create `backend/src/schemas/common.ts` with reusable building blocks:

```typescript
// Pagination
const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

// Route param with numeric ID
const idParam = z.object({
  id: z.coerce.number().int().positive(),
})

// Route param with UUID ID (for AdapterConfig, Tenant, WebhookEndpoint, OutboxEvent)
const uuidParam = z.object({
  id: z.string().uuid(),
})

// Date range filter
const dateRangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

// Sort
const sortQuery = z.object({
  sortBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
})
```

#### 4c: Schema Files

One schema file per route module. Complete list covering ALL routes with mutations:

| File | Routes covered | Status |
|------|---------------|--------|
| **Migrate from Joi:** | | |
| `schemas/events.ts` | POST/PUT `/events`, POST `/events/batch` | Migrate |
| `schemas/techPlans.ts` | POST/PUT `/tech-plans` | Migrate |
| `schemas/contracts.ts` | POST/PUT `/contracts` | Migrate |
| `schemas/publish.ts` | GET `/publish/events` query, webhook CRUD | Migrate |
| `schemas/import.ts` | POST `/import/sources`, POST `/import/trigger` | Migrate |
| **New schemas:** | | |
| `schemas/broadcastSlots.ts` | POST/PUT `/broadcast-slots`, GET query | NEW |
| `schemas/adapters.ts` | POST/PUT `/adapters/configs` | NEW |
| `schemas/crewMembers.ts` | POST/PUT `/crew-members`, POST `/merge` | NEW |
| `schemas/crewTemplates.ts` | POST/PUT `/crew-templates` | NEW |
| `schemas/fieldConfig.ts` | POST/PUT `/fields` | NEW |
| `schemas/users.ts` | PUT `/users/:id` | NEW |
| `schemas/settings.ts` | PUT `/settings/autofill` | NEW |
| `schemas/sports.ts` | POST/PUT `/sports` | NEW |
| `schemas/competitions.ts` | POST `/competitions` | NEW |
| `schemas/encoders.ts` | POST/PUT `/encoders` | NEW |
| `schemas/venues.ts` | POST/PUT/DELETE `/venues` | NEW |
| `schemas/teams.ts` | POST/PUT/DELETE `/teams` | NEW |
| `schemas/courts.ts` | POST/PUT/DELETE `/courts` | NEW |
| `schemas/seasons.ts` | POST/PUT/DELETE `/seasons`, stages, rounds | NEW |
| `schemas/channels.ts` | POST/PUT/DELETE `/channels` | NEW |
| `schemas/schedules.ts` | POST/PUT `/schedules` (if mutations exist) | NEW |
| `schemas/channelSwitches.ts` | POST/PUT `/channel-switches` | NEW |
| `schemas/notifications.ts` | PATCH `/notifications` | NEW |
| `schemas/savedViews.ts` | POST/DELETE `/saved-views` | NEW |
| `schemas/audit.ts` | POST `/audit/:logId/restore` | NEW |

#### 4d: Migration Strategy

1. Create `validate.ts` middleware and `schemas/common.ts`
2. Write new schemas for currently unvalidated routes (20 files)
3. Migrate existing Joi schemas one file at a time (5 files)
4. **Verification step:** Run `grep -r "from 'joi'" backend/src/` and confirm zero matches
5. Remove Joi: `npm uninstall joi`
6. Verify all routes with existing tests

**Files to change:**
- Create: `backend/src/middleware/validate.ts`
- Create: `backend/src/schemas/*.ts` (25 files)
- Update: All route files (add `validate()` middleware calls)
- Remove: Existing Joi schema definitions (inline or in route files)
- Update: `backend/package.json` (remove joi, add zod)

---

## Section 5: Unsafe Parsing Elimination

### Problem

Inline `parseInt()`, `Number()`, `as string` casts, and `new Date()` on untrusted input throughout route handlers.

### Design

This section requires no separate implementation. All unsafe patterns are eliminated by Section 4's `validate()` middleware:

| Pattern | Location | Replaced by |
|---------|----------|-------------|
| `parseId()` returning 0 on invalid input | `events.ts:26-29` | `idParam` schema (`z.coerce.number().int().positive()`) |
| `parseInt(req.params.id)` | `publish.ts:229` | `idParam` schema |
| `req.query.status as string` | `broadcastSlots.ts:21` | `z.enum([...])` in query schema |
| `section as 'event' \| 'crew'` | `fieldConfig.ts:35` | `z.enum(['event', 'crew', 'contract'])` |
| `Number(req.query.limit) \|\| 20` | `import.ts:377` | `paginationQuery` schema |
| `new Date(req.query.dateStart as string)` | `broadcastSlots.ts:28` | `z.coerce.date()` in query schema |
| `new Date(String(cursor))` | `publish.ts:390` | `z.coerce.date()` in query schema |

Once all routes use `validate()`, the `parseId()` helper in `events.ts` can be deleted.

---

## Dependency Summary

```
Section 1 (env.ts)
  ↓
Section 2 (SQL fix) — independent
Section 3 (auth/rate limits) — imports env.ts for CORS_ORIGIN
Section 4 (Zod migration) — largest, uses zod (shared with Section 1)
  ↓
Section 5 — freebie from Section 4
```

Recommended order: 1 → 2 → 3 → 4 (5 is automatic).

## New Dependencies

| Package | Purpose |
|---------|---------|
| `zod` | Input validation & env parsing |

## Removed Dependencies

| Package | Reason |
|---------|--------|
| `joi` | Replaced by Zod |

## Existing Dependencies (no changes)

| Package | Note |
|---------|------|
| `helmet` | Already installed (`^8.0.0`), just reconfiguring |
| `express-rate-limit` | Already installed, adding tiered instances |
