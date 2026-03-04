# SporzaPlanner → Planza Feature Merge Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port the domain-specific strengths of SporzaPlanner (server-side RBAC, audit logging, encoder locking, CSV import, and the EAV dynamic field engine) into Planza, which serves as the base.

**Architecture:** Planza keeps its existing stack (Prisma ORM, Socket.io, OAuth2, Vitest). New features are added as new Prisma models and Express routes. The EAV field engine replaces the current `customFields: Json` blob on Event/TechPlan with a proper relational structure. A shared types file is extracted to eliminate frontend/backend drift.

**Tech Stack:** Node 20, Express 4, TypeScript 5.7, Prisma 6, PostgreSQL 16, Vitest 3, Supertest 7, React 18, Socket.io 4

---

## Phase 1 — Server-Side RBAC for Contracts (Security)

> The contracts route currently returns `fee` and `notes` to all roles. Only `contracts` and `admin` should see financial fields.

### Task 1: Add role-aware field filtering to contracts route

**Files:**
- Modify: `backend/src/routes/contracts.ts`

**Step 1: Write the failing test**

Create file `backend/tests/contracts-rbac.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'

// These tests require a running DB. Use prisma.$executeRaw to seed a test contract.
// For now, unit-test the filter function directly.
import { filterContractForRole } from '../src/routes/contracts.js'

describe('filterContractForRole', () => {
  const contract = {
    id: 1,
    competitionId: 1,
    status: 'valid',
    fee: '100000',
    notes: 'Confidential payment terms',
    linearRights: true,
    maxRights: false,
    radioRights: true,
    sublicensing: false,
    geoRestriction: null,
    validFrom: null,
    validUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    competition: { id: 1, name: 'Pro League', sport: { id: 1, name: 'Football', icon: '⚽' } }
  }

  it('exposes fee and notes to contracts role', () => {
    const result = filterContractForRole(contract, 'contracts')
    expect(result.fee).toBe('100000')
    expect(result.notes).toBe('Confidential payment terms')
  })

  it('exposes fee and notes to admin role', () => {
    const result = filterContractForRole(contract, 'admin')
    expect(result.fee).toBe('100000')
  })

  it('strips fee and notes from planner role', () => {
    const result = filterContractForRole(contract, 'planner')
    expect(result.fee).toBeUndefined()
    expect(result.notes).toBeUndefined()
  })

  it('strips fee and notes from sports role', () => {
    const result = filterContractForRole(contract, 'sports')
    expect(result.fee).toBeUndefined()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- contracts-rbac
```

Expected: FAIL — `filterContractForRole` is not exported.

**Step 3: Implement the filter function**

In `backend/src/routes/contracts.ts`, add before `const router = Router()`:

```typescript
const FINANCIAL_FIELDS = ['fee', 'notes'] as const

export function filterContractForRole(
  contract: Record<string, unknown>,
  role: string
): Record<string, unknown> {
  if (role === 'contracts' || role === 'admin') return contract
  const filtered = { ...contract }
  for (const field of FINANCIAL_FIELDS) {
    delete filtered[field]
  }
  return filtered
}
```

**Step 4: Apply filter in every GET handler**

Replace the `res.json(contracts)` in the list handler:

```typescript
// Before (line ~24):
res.json(contracts)

// After:
const role = (req.user as { role: string } | undefined)?.role ?? 'planner'
res.json(contracts.map(c => filterContractForRole(c as Record<string, unknown>, role)))
```

Apply the same pattern to `GET /expiring` and `GET /:id` handlers (same one-liner transformation before `res.json`).

**Step 5: Run tests to verify they pass**

```bash
cd backend && npm test -- contracts-rbac
```

Expected: PASS (3/3)

**Step 6: Commit**

```bash
git add backend/src/routes/contracts.ts backend/tests/contracts-rbac.test.ts
git commit -m "feat: strip financial contract fields server-side for non-contracts roles"
```

---

## Phase 2 — Audit Logging on Mutations

> Planza's AuditLog model has `oldValue`, `newValue`, and `ipAddress` already. The events, techPlans, and contracts routes write zero audit entries. This phase wires them up.

### Task 2: Extract shared audit utility

**Files:**
- Create: `backend/src/utils/audit.ts`
- Modify: `backend/src/routes/settings.ts` (remove inline writeAuditLog, import from util)

**Step 1: Create the utility**

```typescript
// backend/src/utils/audit.ts
import { prisma } from '../db/prisma.js'

export async function writeAuditLog(params: {
  userId?: string | null
  action: string
  entityType: string
  entityId: string
  oldValue?: unknown
  newValue?: unknown
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<void> {
  const { userId, action, entityType, entityId, oldValue, newValue, ipAddress, userAgent } = params
  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      entityType,
      entityId,
      oldValue: oldValue == null ? undefined : (oldValue as never),
      newValue: newValue == null ? undefined : (newValue as never),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  })
}
```

**Step 2: Update settings.ts to import from util**

In `backend/src/routes/settings.ts`:
- Remove the inline `writeAuditLog` function (lines 37–61).
- Add at top: `import { writeAuditLog } from '../utils/audit.js'`

**Step 3: Run existing tests**

```bash
cd backend && npm test
```

Expected: all existing tests still pass.

**Step 4: Commit**

```bash
git add backend/src/utils/audit.ts backend/src/routes/settings.ts
git commit -m "refactor: extract writeAuditLog to shared util"
```

---

### Task 3: Add audit logging to events route

**Files:**
- Modify: `backend/src/routes/events.ts`

**Step 1: Add import at top of events.ts**

```typescript
import { writeAuditLog } from '../utils/audit.js'
```

**Step 2: Log event creation — add after `emit('event:created', event)`**

```typescript
const user = req.user as { id: string; name?: string }
await writeAuditLog({
  userId: user.id,
  action: 'event.create',
  entityType: 'event',
  entityId: String(event.id),
  newValue: event,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
})
```

**Step 3: Log event update — capture `existing` before update, log after**

The PUT handler already fetches `existing`. After `emit('event:updated', event)`, add:

```typescript
const user = req.user as { id: string }
await writeAuditLog({
  userId: user.id,
  action: 'event.update',
  entityType: 'event',
  entityId: String(event.id),
  oldValue: existing,
  newValue: event,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
})
```

**Step 4: Log event deletion — capture event before delete, log after**

After `emit('event:deleted', ...)`:

```typescript
const user = req.user as { id: string }
await writeAuditLog({
  userId: user.id,
  action: 'event.delete',
  entityType: 'event',
  entityId: String(req.params.id),
  oldValue: event,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
})
```

**Step 5: Run tests**

```bash
cd backend && npm test
```

Expected: PASS

**Step 6: Commit**

```bash
git add backend/src/routes/events.ts
git commit -m "feat: add audit logging to event create/update/delete"
```

---

### Task 4: Add audit logging to techPlans and contracts routes

**Files:**
- Modify: `backend/src/routes/techPlans.ts`
- Modify: `backend/src/routes/contracts.ts`

Follow the identical pattern from Task 3:
- Import `writeAuditLog` from `'../utils/audit.js'`
- In POST handler: log `techPlan.create` / `contract.create` with `newValue`
- In PUT handler: log `techPlan.update` / `contract.update` with `oldValue` + `newValue`
- In DELETE handler: log `techPlan.delete` with `oldValue`
- In `PATCH /:id/encoder`: log `encoder.swap` with `oldValue: existing.crew`, `newValue: updatedCrew`

Actions to use: `'techPlan.create'`, `'techPlan.update'`, `'techPlan.delete'`, `'encoder.swap'`, `'contract.create'`, `'contract.update'`.

**Step 1: Apply changes to techPlans.ts and contracts.ts**

(Follow exact same steps as Task 3 — fetch existing before mutation, log after emit.)

**Step 2: Run tests**

```bash
cd backend && npm test
```

**Step 3: Commit**

```bash
git add backend/src/routes/techPlans.ts backend/src/routes/contracts.ts
git commit -m "feat: add audit logging to techPlan and contract mutations"
```

---

## Phase 3 — Encoder Optimistic Locking

> The current `PATCH /:id/encoder` does a blind write. Two users swapping the same encoder simultaneously produce silent data loss. This adds a 30-second TTL lock.

### Task 5: Add EncoderLock model to Prisma schema

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Step 1: Add the model at end of schema.prisma**

```prisma
model EncoderLock {
  encoderName String   @id
  lockedById  String
  planId      Int
  expiresAt   DateTime

  lockedBy    User     @relation(fields: [lockedById], references: [id], onDelete: Cascade)
  plan        TechPlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  @@index([expiresAt])
}
```

Also add the back-relation to `User` and `TechPlan`:

In `model User`, add: `encoderLocks  EncoderLock[]`
In `model TechPlan`, add: `encoderLock   EncoderLock?`

**Step 2: Generate and apply migration**

```bash
cd backend && npm run db:migrate -- --name add_encoder_lock
```

Expected: new migration file created in `prisma/migrations/`, schema updated.

**Step 3: Write the failing test**

Create `backend/tests/encoder-lock.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isLockExpired, LOCK_TTL_MS } from '../src/routes/techPlans.js'

describe('encoder lock helpers', () => {
  it('considers a lock expired when expiresAt is in the past', () => {
    const past = new Date(Date.now() - 1000)
    expect(isLockExpired(past)).toBe(true)
  })

  it('considers a lock active when expiresAt is in the future', () => {
    const future = new Date(Date.now() + 10_000)
    expect(isLockExpired(future)).toBe(false)
  })

  it('LOCK_TTL_MS is 30 seconds', () => {
    expect(LOCK_TTL_MS).toBe(30_000)
  })
})
```

**Step 4: Run test to verify it fails**

```bash
cd backend && npm test -- encoder-lock
```

Expected: FAIL — `isLockExpired` not exported.

**Step 5: Implement lock logic in techPlans.ts**

Add exports near top of `backend/src/routes/techPlans.ts`:

```typescript
export const LOCK_TTL_MS = 30_000

export function isLockExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now()
}
```

Replace the `PATCH /:id/encoder` handler body with:

```typescript
router.patch('/:id/encoder', authenticate, authorize('sports', 'admin'), async (req, res, next) => {
  try {
    const { encoder } = req.body
    if (!encoder) return next(createError(400, 'Encoder is required'))

    const planId = Number(req.params.id)
    const user = req.user as { id: string }

    const existing = await prisma.techPlan.findUnique({ where: { id: planId } })
    if (!existing) return next(createError(404, 'Tech plan not found'))

    // Check for an active lock held by someone else
    const lock = await prisma.encoderLock.findUnique({
      where: { encoderName: encoder }
    })

    if (lock && !isLockExpired(lock.expiresAt) && lock.lockedById !== user.id) {
      return next(createError(409, `Encoder "${encoder}" is currently locked by another user`))
    }

    // Upsert lock with 30-second TTL
    await prisma.encoderLock.upsert({
      where: { encoderName: encoder },
      create: {
        encoderName: encoder,
        lockedById: user.id,
        planId,
        expiresAt: new Date(Date.now() + LOCK_TTL_MS),
      },
      update: {
        lockedById: user.id,
        planId,
        expiresAt: new Date(Date.now() + LOCK_TTL_MS),
      },
    })

    const crew = existing.crew as Record<string, unknown>
    const updatedCrew = { ...crew, encoder }

    const plan = await prisma.techPlan.update({
      where: { id: planId },
      data: { crew: updatedCrew },
      include: { event: { include: { sport: true, competition: true } } },
    })

    emit('encoder:swapped', { planId: plan.id, encoder, plan })

    await writeAuditLog({
      userId: user.id,
      action: 'encoder.swap',
      entityType: 'techPlan',
      entityId: String(planId),
      oldValue: crew,
      newValue: updatedCrew,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.json(plan)
  } catch (error) {
    next(error)
  }
})
```

**Step 6: Run tests**

```bash
cd backend && npm test -- encoder-lock
```

Expected: PASS

**Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/ backend/src/routes/techPlans.ts backend/tests/encoder-lock.test.ts
git commit -m "feat: add encoder optimistic locking with 30s TTL"
```

---

## Phase 4 — CSV Import Adapter

> Planza has API-based import adapters (API-Football, Football-Data, etc.). This adds a CSV file adapter so operations staff can bulk-import events from spreadsheets using Belgian/Dutch column headers (as in SporzaPlanner).

### Task 6: Write the CSV adapter

**Files:**
- Create: `backend/src/import/adapters/CsvAdapter.ts`

**Step 1: Write the failing test**

Create `backend/tests/csv-adapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseCsvRow, COLUMN_MAP } from '../src/import/adapters/CsvAdapter.js'

describe('parseCsvRow', () => {
  it('maps Dutch column headers to internal field names', () => {
    const row = {
      'Datum BE': '2026-09-14',
      'Starttijd BE': '20:30',
      'Deelnemers': 'Club Brugge - Anderlecht',
      'Kanaal': 'Sporza',
      'Sport': 'Voetbal',
    }
    const result = parseCsvRow(row)
    expect(result.startDateBE).toBe('2026-09-14')
    expect(result.startTimeBE).toBe('20:30')
    expect(result.participants).toBe('Club Brugge - Anderlecht')
    expect(result.linearChannel).toBe('Sporza')
  })

  it('returns null for a row missing required participants field', () => {
    const row = { 'Datum BE': '2026-09-14', 'Starttijd BE': '20:30' }
    const result = parseCsvRow(row)
    expect(result).toBeNull()
  })

  it('COLUMN_MAP has at least 5 entries', () => {
    expect(Object.keys(COLUMN_MAP).length).toBeGreaterThanOrEqual(5)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- csv-adapter
```

Expected: FAIL

**Step 3: Implement CsvAdapter.ts**

```typescript
// backend/src/import/adapters/CsvAdapter.ts
// Maps Belgian/Dutch CSV column headers to Planza event fields.

/** Maps Dutch/Belgian spreadsheet column names → internal Event field names */
export const COLUMN_MAP: Record<string, string> = {
  'Datum BE':           'startDateBE',
  'Starttijd BE':       'startTimeBE',
  'Datum Origin':       'startDateOrigin',
  'Starttijd Origin':   'startTimeOrigin',
  'Deelnemers':         'participants',
  'Inhoud':             'content',
  'Fase':               'phase',
  'Categorie':          'category',
  'Kanaal':             'linearChannel',
  'Radio':              'radioChannel',
  'Lineaire starttijd': 'linearStartTime',
  'Livestream datum':   'livestreamDate',
  'Livestream tijd':    'livestreamTime',
  'Complex':            'complex',
  'Live':               'isLive',
  'Uitgesteld live':    'isDelayedLive',
  'Videoref':           'videoRef',
  'Winnaar':            'winner',
  'Score':              'score',
  'Duur':               'duration',
}

export type ParsedRow = Record<string, string | boolean | null>

/**
 * Maps one raw CSV row (Dutch column headers) to internal field names.
 * Returns null if required fields are missing.
 */
export function parseCsvRow(raw: Record<string, string>): ParsedRow | null {
  const result: ParsedRow = {}

  for (const [csvCol, fieldName] of Object.entries(COLUMN_MAP)) {
    const rawVal = raw[csvCol]
    if (rawVal === undefined || rawVal === '') continue

    if (fieldName === 'isLive' || fieldName === 'isDelayedLive') {
      result[fieldName] = rawVal.toLowerCase() === 'ja' || rawVal === '1' || rawVal.toLowerCase() === 'true'
    } else {
      result[fieldName] = rawVal.trim()
    }
  }

  // Validate required fields
  if (!result['participants']) return null

  return result
}
```

**Step 4: Run tests**

```bash
cd backend && npm test -- csv-adapter
```

Expected: PASS (3/3)

---

### Task 7: Wire CSV upload endpoint

**Files:**
- Install: `multer` (file upload middleware) + `csv-parse`
- Create: `backend/src/routes/csvImport.ts`
- Modify: `backend/src/index.ts`

**Step 1: Install dependencies**

```bash
cd backend && npm install multer csv-parse
npm install --save-dev @types/multer
```

**Step 2: Create the route**

```typescript
// backend/src/routes/csvImport.ts
import { Router } from 'express'
import multer from 'multer'
import { parse } from 'csv-parse/sync'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseCsvRow } from '../import/adapters/CsvAdapter.js'
import { prisma } from '../db/prisma.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

router.post(
  '/csv',
  authenticate,
  authorize('admin', 'planner'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return next(createError(400, 'No file uploaded'))

      const rows: Record<string, string>[] = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })

      const results = { inserted: 0, skipped: 0, errors: [] as { row: number; message: string }[] }

      // Validate sportId and competitionId must be provided in query params or default
      const sportId = req.body.sportId ? Number(req.body.sportId) : null
      const competitionId = req.body.competitionId ? Number(req.body.competitionId) : null

      if (!sportId || !competitionId) {
        return next(createError(400, 'sportId and competitionId are required in request body'))
      }

      for (let i = 0; i < rows.length; i++) {
        const parsed = parseCsvRow(rows[i])
        if (!parsed) {
          results.errors.push({ row: i + 2, message: 'Missing required field: participants' })
          results.skipped++
          continue
        }

        try {
          await prisma.event.create({
            data: {
              sportId,
              competitionId,
              participants: String(parsed.participants ?? ''),
              startDateBE: new Date(String(parsed.startDateBE ?? new Date().toISOString())),
              startTimeBE: String(parsed.startTimeBE ?? '00:00'),
              startDateOrigin: parsed.startDateOrigin ? new Date(String(parsed.startDateOrigin)) : null,
              startTimeOrigin: parsed.startTimeOrigin ? String(parsed.startTimeOrigin) : null,
              content: parsed.content ? String(parsed.content) : null,
              phase: parsed.phase ? String(parsed.phase) : null,
              category: parsed.category ? String(parsed.category) : null,
              linearChannel: parsed.linearChannel ? String(parsed.linearChannel) : null,
              radioChannel: parsed.radioChannel ? String(parsed.radioChannel) : null,
              linearStartTime: parsed.linearStartTime ? String(parsed.linearStartTime) : null,
              livestreamDate: parsed.livestreamDate ? new Date(String(parsed.livestreamDate)) : null,
              livestreamTime: parsed.livestreamTime ? String(parsed.livestreamTime) : null,
              complex: parsed.complex ? String(parsed.complex) : null,
              isLive: Boolean(parsed.isLive ?? false),
              isDelayedLive: Boolean(parsed.isDelayedLive ?? false),
              videoRef: parsed.videoRef ? String(parsed.videoRef) : null,
              winner: parsed.winner ? String(parsed.winner) : null,
              score: parsed.score ? String(parsed.score) : null,
              duration: parsed.duration ? String(parsed.duration) : null,
            },
          })
          results.inserted++
        } catch (err) {
          results.errors.push({ row: i + 2, message: err instanceof Error ? err.message : 'Unknown error' })
          results.skipped++
        }
      }

      res.json(results)
    } catch (error) {
      next(error)
    }
  }
)

export default router
```

**Step 3: Register the route in index.ts**

In `backend/src/index.ts`, add:

```typescript
import csvImportRoutes from './routes/csvImport.js'
// ... after other imports

app.use('/api/import', csvImportRoutes)  // add alongside existing importRoutes
```

**Step 4: Run tests**

```bash
cd backend && npm test
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/import/adapters/CsvAdapter.ts backend/src/routes/csvImport.ts backend/src/index.ts backend/tests/csv-adapter.test.ts
git commit -m "feat: add CSV import adapter with Belgian/Dutch column header mapping"
```

---

## Phase 5 — EAV Field Engine (Backend)

> Replace the `customFields: Json` blob with a proper relational field definition system: admins can create typed fields (text, number, dropdown, etc.) with conditional show/hide/require logic. Values are stored per-entity in `CustomFieldValue`.

### Task 8: Add Prisma models for the field engine

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Step 1: Add enums**

Append to `backend/prisma/schema.prisma` before the import system section:

```prisma
// =============================================================================
// FIELD ENGINE
// =============================================================================

enum FieldType {
  text
  number
  date
  time
  dropdown
  checkbox
  textarea
}

enum FieldSection {
  event
  crew
  contract
}
```

**Step 2: Add models**

Append after the enums:

```prisma
model FieldDefinition {
  id               String        @id
  name             String        @unique
  label            String
  fieldType        FieldType
  section          FieldSection
  required         Boolean       @default(false)
  sortOrder        Int           @default(0)
  options          String[]
  dropdownSourceId String?
  defaultValue     String?
  conditionalRules Json          @default("[]")
  visibleByRoles   Role[]
  isSystem         Boolean       @default(false)
  isCustom         Boolean       @default(true)
  visible          Boolean       @default(true)
  createdById      String?

  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  dropdownSource   DropdownList?     @relation(fields: [dropdownSourceId], references: [id])
  createdBy        User?             @relation(fields: [createdById], references: [id])
  customValues     CustomFieldValue[]
  mandatoryConfigs MandatoryFieldConfig[]

  @@index([section, sortOrder])
}

model CustomFieldValue {
  id          String   @id @default(uuid())
  entityType  String   // "event" | "techPlan" | "contract"
  entityId    String
  fieldId     String
  fieldValue  String

  field       FieldDefinition @relation(fields: [fieldId], references: [id], onDelete: Cascade)

  @@unique([entityType, entityId, fieldId])
  @@index([entityType, entityId])
}

model DropdownList {
  id          String   @id
  name        String
  description String?
  managedBy   Role     @default(admin)
  createdAt   DateTime @default(now())

  options     DropdownOption[]
  fields      FieldDefinition[]
}

model DropdownOption {
  id          String   @id @default(uuid())
  listId      String
  value       String
  label       String
  parentId    String?
  sortOrder   Int      @default(0)
  active      Boolean  @default(true)
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now())

  list        DropdownList    @relation(fields: [listId], references: [id], onDelete: Cascade)
  parent      DropdownOption? @relation("DropdownOptionChildren", fields: [parentId], references: [id])
  children    DropdownOption[] @relation("DropdownOptionChildren")

  @@unique([listId, value])
  @@index([listId, sortOrder])
}

model MandatoryFieldConfig {
  id                  String   @id @default(uuid())
  sportId             Int      @unique
  fieldIds            String[]
  conditionalRequired Json     @default("[]")
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  sport               Sport    @relation(fields: [sportId], references: [id], onDelete: Cascade)
  fields              FieldDefinition[]
}
```

**Step 3: Add back-relations to User and Sport**

In `model User`, add: `fieldDefinitions  FieldDefinition[]`
In `model Sport`, add: `mandatoryFieldConfig  MandatoryFieldConfig?`

**Step 4: Generate and apply migration**

```bash
cd backend && npm run db:migrate -- --name add_field_engine
```

**Step 5: Generate Prisma client**

```bash
cd backend && npm run db:generate
```

**Step 6: Verify no TypeScript errors**

```bash
cd backend && npm run build
```

Expected: 0 errors.

**Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add EAV field engine schema (FieldDefinition, CustomFieldValue, DropdownList, MandatoryFieldConfig)"
```

---

### Task 9: Create field config API routes

**Files:**
- Create: `backend/src/routes/fieldConfig.ts`
- Modify: `backend/src/index.ts`

**Step 1: Write the failing test**

Create `backend/tests/field-config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateFieldId } from '../src/routes/fieldConfig.js'

describe('generateFieldId', () => {
  it('generates a namespaced id from section and name', () => {
    const id = generateFieldId('event', 'commentator')
    expect(id).toBe('custom_event_commentator')
  })

  it('slugifies spaces and special chars', () => {
    const id = generateFieldId('crew', 'Camera Operator 2')
    expect(id).toBe('custom_crew_camera_operator_2')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- field-config
```

Expected: FAIL

**Step 3: Create fieldConfig.ts**

```typescript
// backend/src/routes/fieldConfig.ts
import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'

const router = Router()

export function generateFieldId(section: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `custom_${section}_${slug}`
}

const fieldSchema = Joi.object({
  name: Joi.string().required(),
  label: Joi.string().required(),
  fieldType: Joi.string().valid('text', 'number', 'date', 'time', 'dropdown', 'checkbox', 'textarea').required(),
  section: Joi.string().valid('event', 'crew', 'contract').required(),
  required: Joi.boolean().default(false),
  sortOrder: Joi.number().integer().default(0),
  options: Joi.array().items(Joi.string()).default([]),
  dropdownSourceId: Joi.string().allow(null, '').default(null),
  defaultValue: Joi.string().allow(null, '').default(null),
  conditionalRules: Joi.array().default([]),
  visibleByRoles: Joi.array().items(Joi.string().valid('admin', 'planner', 'sports', 'contracts')).default([]),
  visible: Joi.boolean().default(true),
})

// GET /api/fields?section=event
router.get('/', async (req, res, next) => {
  try {
    const { section } = req.query
    const fields = await prisma.fieldDefinition.findMany({
      where: section ? { section: section as 'event' | 'crew' | 'contract' } : undefined,
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
    })
    res.json(fields)
  } catch (error) {
    next(error)
  }
})

// POST /api/fields — admin only
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = fieldSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const id = generateFieldId(value.section, value.name)

    // Validate dropdownSourceId if provided
    if (value.dropdownSourceId) {
      const list = await prisma.dropdownList.findUnique({ where: { id: value.dropdownSourceId } })
      if (!list) return next(createError(400, `Dropdown list '${value.dropdownSourceId}' not found`))
    }

    const user = req.user as { id: string }
    const field = await prisma.fieldDefinition.create({
      data: { ...value, id, isSystem: false, isCustom: true, createdById: user.id },
    })

    await writeAuditLog({
      userId: user.id,
      action: 'field.create',
      entityType: 'field_definition',
      entityId: id,
      newValue: field,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(201).json(field)
  } catch (error) {
    next(error)
  }
})

// PUT /api/fields/:id — admin only
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.fieldDefinition.findUnique({ where: { id: req.params.id } })
    if (!existing) return next(createError(404, 'Field not found'))

    const updateSchema = Joi.object({
      label: Joi.string(),
      required: Joi.boolean(),
      sortOrder: Joi.number().integer(),
      visible: Joi.boolean(),
      options: Joi.array().items(Joi.string()),
      conditionalRules: Joi.array(),
      visibleByRoles: Joi.array().items(Joi.string()),
    })

    const { error, value } = updateSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const user = req.user as { id: string }
    const field = await prisma.fieldDefinition.update({
      where: { id: req.params.id },
      data: value,
    })

    await writeAuditLog({
      userId: user.id,
      action: 'field.update',
      entityType: 'field_definition',
      entityId: req.params.id,
      oldValue: existing,
      newValue: field,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.json(field)
  } catch (error) {
    next(error)
  }
})

// DELETE /api/fields/:id — admin only, cannot delete system fields
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const field = await prisma.fieldDefinition.findUnique({ where: { id: req.params.id } })
    if (!field) return next(createError(404, 'Field not found'))
    if (field.isSystem) return next(createError(400, 'Cannot delete system fields'))

    const user = req.user as { id: string }
    await prisma.fieldDefinition.delete({ where: { id: req.params.id } })

    await writeAuditLog({
      userId: user.id,
      action: 'field.delete',
      entityType: 'field_definition',
      entityId: req.params.id,
      oldValue: field,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.json({ message: 'Field deleted' })
  } catch (error) {
    next(error)
  }
})

// PUT /api/fields/order — batch reorder
router.put('/order', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const schema = Joi.array().items(Joi.object({ id: Joi.string().required(), sortOrder: Joi.number().integer().required() }))
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    await prisma.$transaction(
      (value as { id: string; sortOrder: number }[]).map(({ id, sortOrder }) =>
        prisma.fieldDefinition.update({ where: { id }, data: { sortOrder } })
      )
    )

    res.json({ message: 'Order updated' })
  } catch (error) {
    next(error)
  }
})

// ── Dropdown Lists ──────────────────────────────────────────────────────────

router.get('/dropdowns', async (_req, res, next) => {
  try {
    const lists = await prisma.dropdownList.findMany({
      include: { options: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    })
    res.json(lists)
  } catch (error) {
    next(error)
  }
})

router.post('/dropdowns', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      description: Joi.string().allow('', null),
      managedBy: Joi.string().valid('admin', 'planner', 'sports', 'contracts').default('admin'),
    })
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const list = await prisma.dropdownList.create({ data: value })
    res.status(201).json(list)
  } catch (error) {
    next(error)
  }
})

router.post('/dropdowns/:listId/options', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const list = await prisma.dropdownList.findUnique({ where: { id: req.params.listId } })
    if (!list) return next(createError(404, 'Dropdown list not found'))

    const schema = Joi.object({
      value: Joi.string().required(),
      label: Joi.string().required(),
      parentId: Joi.string().allow(null, '').default(null),
      sortOrder: Joi.number().integer().default(0),
      metadata: Joi.object().default({}),
    })
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const option = await prisma.dropdownOption.create({
      data: { ...value, listId: req.params.listId },
    })
    res.status(201).json(option)
  } catch (error) {
    next(error)
  }
})

// ── Mandatory Field Configs (per sport) ────────────────────────────────────

router.get('/mandatory/:sportId', async (req, res, next) => {
  try {
    const config = await prisma.mandatoryFieldConfig.findUnique({
      where: { sportId: Number(req.params.sportId) },
    })
    res.json(config ?? { sportId: Number(req.params.sportId), fieldIds: [], conditionalRequired: [] })
  } catch (error) {
    next(error)
  }
})

router.put('/mandatory/:sportId', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      fieldIds: Joi.array().items(Joi.string()).required(),
      conditionalRequired: Joi.array().default([]),
    })
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const config = await prisma.mandatoryFieldConfig.upsert({
      where: { sportId: Number(req.params.sportId) },
      create: { sportId: Number(req.params.sportId), ...value },
      update: value,
    })
    res.json(config)
  } catch (error) {
    next(error)
  }
})

export default router
```

**Step 4: Run test**

```bash
cd backend && npm test -- field-config
```

Expected: PASS (generateFieldId tests pass)

**Step 5: Register route in index.ts**

In `backend/src/index.ts`, add:

```typescript
import fieldConfigRoutes from './routes/fieldConfig.js'
// ...
app.use('/api/fields', fieldConfigRoutes)
```

**Step 6: Build to check for TypeScript errors**

```bash
cd backend && npm run build
```

Expected: 0 errors.

**Step 7: Commit**

```bash
git add backend/src/routes/fieldConfig.ts backend/src/index.ts backend/tests/field-config.test.ts
git commit -m "feat: add field config API (FieldDefinition, DropdownList, MandatoryFieldConfig CRUD)"
```

---

### Task 10: Custom field values on events

**Files:**
- Modify: `backend/src/routes/events.ts`

**Step 1: Include CustomFieldValues in event GET responses**

Update `GET /` handler — add `customValues` include to `prisma.event.findMany`:

```typescript
include: {
  sport: true,
  competition: true,
  customValues: true,   // add this line
},
```

Apply same change to `GET /:id` handler.

**Step 2: Handle custom field values on POST/PUT**

In the POST handler, after `const event = await prisma.event.create(...)`, add:

```typescript
// Upsert any custom field values provided in body.customValues
const customValues = (req.body.customValues ?? []) as { fieldId: string; fieldValue: string }[]
if (customValues.length > 0) {
  await prisma.$transaction(
    customValues.map(({ fieldId, fieldValue }) =>
      prisma.customFieldValue.upsert({
        where: { entityType_entityId_fieldId: { entityType: 'event', entityId: String(event.id), fieldId } },
        create: { entityType: 'event', entityId: String(event.id), fieldId, fieldValue },
        update: { fieldValue },
      })
    )
  )
}
```

Apply the same block in the PUT handler.

**Step 3: Run tests**

```bash
cd backend && npm test
```

Expected: PASS

**Step 4: Commit**

```bash
git add backend/src/routes/events.ts
git commit -m "feat: include and persist custom field values on events"
```

---

## Phase 6 — EAV Field Engine (Frontend)

> Admin UI to manage fields, and a DynamicForm component used in event creation/editing.

### Task 11: Add FieldConfigurator admin view

**Files:**
- Create: `src/components/admin/FieldConfigurator.tsx`
- Modify: `src/views/AdminView.tsx` (add tab/section linking to FieldConfigurator)

**Step 1: Create the component**

```tsx
// src/components/admin/FieldConfigurator.tsx
import { useState, useEffect } from 'react'
import { getApi } from '../../utils/api'

type FieldDef = {
  id: string
  label: string
  fieldType: string
  section: string
  required: boolean
  visible: boolean
  sortOrder: number
  isSystem: boolean
}

export function FieldConfigurator() {
  const [fields, setFields] = useState<FieldDef[]>([])
  const [section, setSection] = useState<'event' | 'crew' | 'contract'>('event')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getApi<FieldDef[]>(`/fields?section=${section}`)
      .then(setFields)
      .finally(() => setLoading(false))
  }, [section])

  const toggleVisible = async (field: FieldDef) => {
    await getApi(`/fields/${field.id}`, {
      method: 'PUT',
      body: JSON.stringify({ visible: !field.visible }),
    })
    setFields(prev => prev.map(f => f.id === field.id ? { ...f, visible: !f.visible } : f))
  }

  const deleteField = async (field: FieldDef) => {
    if (field.isSystem) return
    if (!confirm(`Delete field "${field.label}"?`)) return
    await getApi(`/fields/${field.id}`, { method: 'DELETE' })
    setFields(prev => prev.filter(f => f.id !== field.id))
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">Field Configuration</h2>
      <div className="flex gap-2 mb-4">
        {(['event', 'crew', 'contract'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-3 py-1 rounded text-sm ${section === s ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">Label</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Required</th>
              <th className="py-2 pr-4">Visible</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(field => (
              <tr key={field.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4">
                  {field.label}
                  {field.isSystem && <span className="ml-2 text-xs text-gray-400">(system)</span>}
                </td>
                <td className="py-2 pr-4 text-gray-500">{field.fieldType}</td>
                <td className="py-2 pr-4">{field.required ? 'Yes' : 'No'}</td>
                <td className="py-2 pr-4">
                  <button
                    onClick={() => toggleVisible(field)}
                    className={`px-2 py-0.5 rounded text-xs ${field.visible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {field.visible ? 'Visible' : 'Hidden'}
                  </button>
                </td>
                <td className="py-2">
                  {!field.isSystem && (
                    <button
                      onClick={() => deleteField(field)}
                      className="text-red-500 hover:underline text-xs"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

**Step 2: Add FieldConfigurator to AdminView**

In `src/views/AdminView.tsx`, import and render `<FieldConfigurator />` inside an "Fields" tab section alongside existing admin sections.

**Step 3: Verify in browser**

```bash
# From /mnt/c/Projects/Planza
npm run dev
```

Navigate to the admin view and confirm the Fields section loads with the `/api/fields` data.

**Step 4: Commit**

```bash
git add src/components/admin/FieldConfigurator.tsx src/views/AdminView.tsx
git commit -m "feat: add FieldConfigurator admin UI for managing field definitions"
```

---

### Task 12: DynamicForm component for events

**Files:**
- Create: `src/components/forms/DynamicForm.tsx`
- Modify: `src/components/forms/DynamicEventForm.tsx` (render custom fields via DynamicForm)

**Step 1: Create DynamicForm.tsx**

```tsx
// src/components/forms/DynamicForm.tsx
// Renders a list of FieldDefinitions as form inputs.

type FieldDef = {
  id: string
  label: string
  fieldType: string
  required: boolean
  visible: boolean
  options: string[]
  defaultValue?: string
}

type Props = {
  fields: FieldDef[]
  values: Record<string, string>
  onChange: (fieldId: string, value: string) => void
}

export function DynamicForm({ fields, values, onChange }: Props) {
  const visibleFields = fields.filter(f => f.visible)

  return (
    <div className="space-y-3">
      {visibleFields.map(field => (
        <div key={field.id}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>

          {field.fieldType === 'text' && (
            <input
              type="text"
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          )}

          {field.fieldType === 'textarea' && (
            <textarea
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
              rows={3}
            />
          )}

          {field.fieldType === 'number' && (
            <input
              type="number"
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          )}

          {field.fieldType === 'date' && (
            <input
              type="date"
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          )}

          {field.fieldType === 'time' && (
            <input
              type="time"
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          )}

          {field.fieldType === 'checkbox' && (
            <input
              type="checkbox"
              checked={values[field.id] === 'true'}
              onChange={e => onChange(field.id, String(e.target.checked))}
              className="h-4 w-4"
            />
          )}

          {field.fieldType === 'dropdown' && (
            <select
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="">— select —</option>
              {field.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  )
}
```

**Step 2: Integrate into DynamicEventForm.tsx**

In `src/components/forms/DynamicEventForm.tsx`:
- Fetch custom fields via `GET /api/fields?section=event`
- Track custom field values in a `customValues: Record<string, string>` state
- Render `<DynamicForm fields={customFields} values={customValues} onChange={...} />` below the existing form fields
- Include `customValues` as an array in the form submission body: `customValues: Object.entries(customValues).map(([fieldId, fieldValue]) => ({ fieldId, fieldValue }))`

**Step 3: Commit**

```bash
git add src/components/forms/DynamicForm.tsx src/components/forms/DynamicEventForm.tsx
git commit -m "feat: add DynamicForm component and wire custom fields into event form"
```

---

## Phase 7 — Shared Types Package (Developer Experience)

> Eliminates frontend/backend drift by putting all shared interfaces in one place.

### Task 13: Extract shared types

**Files:**
- Create: `packages/shared/types.ts`
- Modify: `package.json` (add workspaces)
- Modify: `src/data/types.ts` (re-export from shared)
- Create: `packages/shared/package.json`

**Step 1: Add workspaces to root package.json**

In `/mnt/c/Projects/Planza/package.json`, add:

```json
"workspaces": ["packages/*", "backend"]
```

**Step 2: Create the shared package**

```bash
mkdir -p /mnt/c/Projects/Planza/packages/shared
```

Create `packages/shared/package.json`:

```json
{
  "name": "@planza/shared",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./types.ts"
  }
}
```

**Step 3: Create `packages/shared/types.ts`**

Copy the union of types from `src/data/types.ts` and the SporzaPlanner `shared/types/index.ts` — keeping Planza's naming conventions. Key types to include:

- `FieldType`, `FieldSection`, `ConditionalRule`, `FieldDefinition`
- `DropdownList`, `DropdownOption`
- `MandatoryFieldConfig`, `ConditionalRequiredField`
- `AuditAction` (typed union of all action strings)
- `UserRole` (typed union: `'admin' | 'planner' | 'sports' | 'contracts'`)
- `ApiResponse<T>` wrapper type

**Step 4: Update src/data/types.ts to re-export**

```typescript
// src/data/types.ts
export * from '../../packages/shared/types.js'
// Keep any Planza-specific types here that don't belong in shared
```

**Step 5: Update tsconfig.json to resolve the package**

In `tsconfig.json`, add under `compilerOptions`:

```json
"paths": {
  "@planza/shared": ["./packages/shared/types.ts"]
}
```

**Step 6: Run build to verify**

```bash
npm run build
```

Expected: 0 errors.

**Step 7: Commit**

```bash
git add packages/ package.json tsconfig.json src/data/types.ts
git commit -m "feat: extract shared types to @planza/shared workspace package"
```

---

## Summary of All Changes

| Phase | What | Impact | Effort |
|-------|------|--------|--------|
| 1 | Server-side RBAC for contracts | **Security** | 1 day |
| 2 | Audit logging on all mutations | Compliance | 1 day |
| 3 | Encoder optimistic locking | **Correctness** | 1 day |
| 4 | CSV import adapter | Operational | 2 days |
| 5 | EAV schema + field config API | **Core feature** | 2 days |
| 6 | FieldConfigurator + DynamicForm | **Core feature** | 2–3 days |
| 7 | Shared types package | DX | 0.5 days |

**Recommended order of execution:** Phases 1 → 2 → 3 → 4 → 5 → 6 → 7.
Phases 1–3 are independent and can be done in any order. Phase 5 must precede Phase 6.

**New files created:**
- `backend/tests/contracts-rbac.test.ts`
- `backend/tests/encoder-lock.test.ts`
- `backend/tests/csv-adapter.test.ts`
- `backend/tests/field-config.test.ts`
- `backend/src/utils/audit.ts`
- `backend/src/import/adapters/CsvAdapter.ts`
- `backend/src/routes/csvImport.ts`
- `backend/src/routes/fieldConfig.ts`
- `src/components/admin/FieldConfigurator.tsx`
- `src/components/forms/DynamicForm.tsx`
- `packages/shared/types.ts`
- `packages/shared/package.json`

**Files modified:**
- `backend/prisma/schema.prisma` (EncoderLock + field engine models)
- `backend/src/routes/contracts.ts` (RBAC filter)
- `backend/src/routes/events.ts` (audit + custom field values)
- `backend/src/routes/techPlans.ts` (encoder lock + audit)
- `backend/src/routes/settings.ts` (import audit util)
- `backend/src/index.ts` (register new routes)
- `src/views/AdminView.tsx` (add field config tab)
- `src/components/forms/DynamicEventForm.tsx` (integrate DynamicForm)
- `src/data/types.ts` (re-export from shared)
