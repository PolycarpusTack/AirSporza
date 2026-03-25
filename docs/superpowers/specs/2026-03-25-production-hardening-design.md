# Production Hardening — Design Spec

**Date:** 2026-03-25
**Scope:** Sub-project A — security fixes, env validation, input validation, auth gaps
**Status:** Approved

## Overview

Harden the Planza backend for production deployment by fixing security vulnerabilities, adding startup environment validation, closing authentication gaps, migrating to Zod for input validation, and eliminating unsafe parsing patterns.

## Out of Scope

- CSRF protection (not needed — app uses Bearer token auth via Authorization header, not cookies)
- Pagination on list endpoints (sub-project D: UX/QoL)
- N+1 query fixes (sub-project B: Code Quality)
- Database index gaps (separate concern)
- Frontend changes (backend-only pass)

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
| `DATABASE_URL` | Yes | `postgresql://sporza:sporza@localhost:5432/sporza_planner` | `url()` starting with `postgresql://` |
| `JWT_SECRET` | Yes (min 32 chars) | `dev-secret-key-change-in-production` | `string().min(32)` in production |
| `REDIS_URL` | Yes | `redis://localhost:6379` | `url()` starting with `redis://` |
| `PORT` | No | `3001` | `coerce.number().int().positive()` |
| `CORS_ORIGINS` | Yes | `http://localhost:5173` | `string()` (comma-separated URLs) |
| `OAUTH_CLIENT_ID` | No | empty | `string().optional()` |
| `OAUTH_CLIENT_SECRET` | No | empty | `string().optional()` |
| `OAUTH_AUTHORIZATION_URL` | No | empty | `string().url().optional()` |
| `OAUTH_TOKEN_URL` | No | empty | `string().url().optional()` |
| `OAUTH_CALLBACK_URL` | No | empty | `string().url().optional()` |

**Behavior:**
- In `production`: missing required vars causes process exit with a clear error listing all missing/invalid vars.
- In `development`/`test`: missing vars use defaults, log a warning.
- Exports a typed `env` object. All consumers import from `env.ts` instead of reading `process.env` directly.

**Files to change:**
- Create: `backend/src/config/env.ts`
- Update: `backend/src/config/index.ts` (import from env.ts)
- Update: `backend/src/index.ts` (use env.PORT, env.DATABASE_URL)
- Update: `backend/src/services/queue.ts` (use env.REDIS_URL)
- Update: `backend/src/routes/auth.ts` (use env.OAUTH_*)
- Update: `backend/src/middleware/auth.ts` (use env.JWT_SECRET)

---

## Section 2: SQL Injection Fix & Safe Query Patterns

### Problem

`backend/src/middleware/tenantContext.ts:30` uses `$executeRawUnsafe()` with string interpolation:
```typescript
await prisma.$executeRawUnsafe(`SELECT set_tenant_context('${defaultTenantId}')`)
```
This is a SQL injection vector.

### Design

**Fix:** Replace with Prisma's tagged template literal:
```typescript
await prisma.$executeRaw`SELECT set_tenant_context(${defaultTenantId})`
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
- Update: `backend/.eslintrc.*` (add rule)

---

## Section 3: Route Authentication & Rate Limiting

### Problem

Several routes with side effects or sensitive data lack authentication. The global rate limit (500 req/15min) is too generous for auth endpoints and too restrictive for high-traffic publish feeds.

### 3a: Authentication Fixes

| Route | Current | Fix |
|-------|---------|-----|
| `GET /fields` | No auth | Add `authenticate` middleware |
| `GET /broadcast-slots` | No auth | Add `authenticate` middleware |
| `GET /broadcast-slots/:id` | No auth | Add `authenticate` middleware |
| `POST /adapters/live-score/webhook` | No auth | HMAC signature verification |

### 3b: HMAC Webhook Verification

Create `backend/src/middleware/hmac.ts`:
- Extract `X-Signature-256` header
- Compute `HMAC-SHA256(rawBody, adapterConfig.secret)`
- Compare using `crypto.timingSafeEqual`
- Return 401 on mismatch
- Reuses the pattern already in `webhookWorker.ts`

The middleware looks up the adapter config by `configId` (from query or body) to retrieve the shared secret. If no configId is provided or the config doesn't exist, return 401.

### 3c: Per-Tier Rate Limiting

Replace the single global rate limiter with tiered limits:

| Tier | Limit | Window | Routes | Key |
|------|-------|--------|--------|-----|
| `public` | 60 req | 1 min | `/publish/*` | IP |
| `standard` | 200 req | 1 min | All authenticated routes | User ID |
| `webhook` | 30 req | 1 min | `/adapters/live-score/webhook` | IP |
| `auth` | 10 req | 1 min | `/auth/dev-login`, `/auth/callback` | IP |

Implementation: Create rate limiter instances in `backend/src/middleware/rateLimits.ts`, apply per-router.

### 3d: Security Headers (Helmet)

Add `helmet` middleware for CSP and other security headers. This prevents XSS-based token theft from localStorage.

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", ...env.CORS_ORIGINS.split(',')]
    }
  }
}))
```

**Files to change:**
- Create: `backend/src/middleware/hmac.ts`
- Create: `backend/src/middleware/rateLimits.ts`
- Update: `backend/src/routes/fieldConfig.ts` (add authenticate)
- Update: `backend/src/routes/broadcastSlots.ts` (add authenticate to GET routes)
- Update: `backend/src/routes/adapters.ts` (add HMAC middleware to webhook)
- Update: `backend/src/index.ts` (replace global limiter, add helmet)

**New dependencies:** `helmet`

---

## Section 4: Zod Migration & Input Validation

### Problem

Input validation is inconsistent: some routes use Joi, 6+ routes have no validation at all, and inline `parseInt()`/`Number()`/`as string` casts are scattered through handlers.

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
- On failure: returns 400 with `{ error: 'Validation failed', details: zodError.issues }`

#### 4b: Shared Schemas

Create `backend/src/schemas/common.ts` with reusable building blocks:

```typescript
// Pagination
const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

// Route param ID
const idParam = z.object({
  id: z.coerce.number().int().positive(),
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

One schema file per route module:

| File | Routes covered | Status |
|------|---------------|--------|
| `schemas/events.ts` | POST/PUT `/events`, POST `/events/batch` | Migrate from Joi |
| `schemas/techPlans.ts` | POST/PUT `/tech-plans` | Migrate from Joi |
| `schemas/contracts.ts` | POST/PUT `/contracts` | Migrate from Joi |
| `schemas/publish.ts` | GET `/publish/events` query, webhook CRUD | Migrate from Joi |
| `schemas/import.ts` | POST `/import/sources`, POST `/import/trigger` | Migrate from Joi |
| `schemas/broadcastSlots.ts` | POST/PUT `/broadcast-slots`, GET query | **NEW** |
| `schemas/adapters.ts` | POST/PUT `/adapters/configs` | **NEW** |
| `schemas/crewMembers.ts` | POST/PUT `/crew-members`, POST `/merge` | **NEW** |
| `schemas/crewTemplates.ts` | POST/PUT `/crew-templates` | **NEW** |
| `schemas/fieldConfig.ts` | POST/PUT `/fields` | **NEW** |
| `schemas/users.ts` | PUT `/users/:id` | **NEW** |
| `schemas/settings.ts` | PUT `/settings/autofill` | **NEW** |

#### 4d: Migration Strategy

1. Create `validate.ts` middleware and `schemas/common.ts`
2. Write new schemas for unvalidated routes (6 files)
3. Migrate existing Joi schemas one file at a time (5 files)
4. Remove Joi: `npm uninstall joi`
5. Verify all routes with existing tests

**Files to change:**
- Create: `backend/src/middleware/validate.ts`
- Create: `backend/src/schemas/*.ts` (12 files)
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
Section 3 (auth/rate limits) — imports env.ts
Section 4 (Zod migration) — largest, independent of 2-3
  ↓
Section 5 — freebie from Section 4
```

Recommended order: 1 → 2 → 3 → 4 (5 is automatic).

## New Dependencies

| Package | Purpose |
|---------|---------|
| `zod` | Input validation & env parsing |
| `helmet` | Security headers (CSP, HSTS, etc.) |

## Removed Dependencies

| Package | Reason |
|---------|--------|
| `joi` | Replaced by Zod |
