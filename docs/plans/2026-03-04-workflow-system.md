# Planza Workflow System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Planza from a planning console into a workflow system with explicit event lifecycle states, proactive conflict detection, audit history, rights-aware scheduling, notifications, saved views, drag-and-drop, import scheduling, and resource planning.

**Architecture:** Ten self-contained items implemented in priority order; each item ships as a vertical slice (schema → backend route → service → frontend component → tests). All schema changes use Prisma migrations. All new behaviour is test-first with Vitest on the backend; React Testing Library on the frontend where UI logic is non-trivial.

**Tech Stack:** Express + Prisma + PostgreSQL (backend), React + TypeScript + Vite (frontend), Vitest + Supertest (backend tests), @dnd-kit/core (drag-and-drop, Item 8), node-cron (import scheduling, Item 9).

---

## Quality Framework

Read this section before starting any item. These rules apply to every item without exception.

### Definition of Ready (DoR)

An item is **ready to start** only when ALL of the following are true:

- [ ] The spec in this document is unambiguous — every acceptance criterion is a binary pass/fail
- [ ] All schema changes are written out in this document before a line of code is touched
- [ ] The API contract (request shape, response shape, error codes) is spelled out
- [ ] The failing test is written and confirmed to fail before implementation begins
- [ ] No other item's work is in progress (items are sequential, not parallel)

### Definition of Done (DoD)

An item is **done** only when ALL of the following are true:

- [ ] Every acceptance criterion in the spec passes (verified by running the tests)
- [ ] All new backend routes have Joi validation and authentication/authorisation guards
- [ ] No TypeScript errors: `npx tsc --noEmit` exits 0 in both `/` and `/backend`
- [ ] All new tests pass: `cd backend && npx vitest run` exits 0
- [ ] No new `console.log` in production paths (use `logger` on backend, remove debug logs on frontend)
- [ ] Prisma migrations are written to `backend/prisma/migrations/` (raw SQL, consistent with existing files)
- [ ] The tech debt review checklist below has been run and findings recorded in a `## Tech Debt Notes` section at the bottom of this document
- [ ] The overengineering checklist below has been run and no violations remain
- [ ] The code review checklist below has been run and no critical issues remain
- [ ] The item is committed: `git commit -m "feat(<item-slug>): <summary>"`

### Technical Debt Review Cycle

Run after **every item** before marking DoD. Answer each question honestly:

1. **Duplication** — Is there logic that now exists in two places? If yes, extract to a shared utility before committing.
2. **Naming drift** — Do new names (types, functions, routes) follow the project's existing conventions? (`camelCase` fields, `kebab-case` routes, `PascalCase` components, `snake_case` DB columns)
3. **Hardcoded values** — Are any magic strings/numbers that belong in a config or enum now scattered in code?
4. **Dead code** — Did the implementation leave behind any commented-out blocks, unused imports, or superseded helpers?
5. **Schema debt** — Does the migration add any nullable column that should eventually become required? If so, note it explicitly.
6. **Test coverage gap** — Is there a code path that is not exercised by any test? If yes, add the test now, not "later".

### Overengineering Guardrails

Before writing any code, ask: **is this the simplest thing that can possibly work?**

**Hard rules — if you find yourself doing any of these, stop and simplify:**

- No abstract base classes or generic factories unless there are ≥ 3 concrete instances today
- No event buses, pub/sub, or message queues — use direct function calls
- No caching layer unless a measured query takes > 200ms with real data
- No new npm packages unless the alternative is > 50 lines of plumbing code
- No more than 2 levels of service abstraction (route → service → prisma is the ceiling)
- No "extension points" for features that do not exist yet (YAGNI)
- Frontend components stay in the page file until they are reused in a second page; only then extract
- A new file is only created if the code cannot reasonably live in an existing file

### Code Review Protocol

Run after each item. For each point, either confirm ✅ or note the issue and fix it before the commit.

**Correctness**
- [ ] Every error path returns an appropriate HTTP status code and is caught by `next(error)`
- [ ] No Prisma query silently ignores a missing record (check for `findUnique → null`)
- [ ] Optimistic UI updates revert on failure (follow the pattern in `AppProvider.tsx:handleSaveEvent`)
- [ ] No `any` types introduced — use `unknown` with a type guard instead

**Security**
- [ ] All new routes that mutate state have `authenticate` middleware
- [ ] All new routes that are role-restricted have `authorize(...)` middleware
- [ ] No user-supplied data is interpolated into SQL strings (all Prisma, no raw queries without `$queryRaw` Prisma safety)
- [ ] Webhook secrets and sensitive config are never returned in API responses

**Simplicity**
- [ ] No function is longer than 40 lines; if it is, split it
- [ ] No component renders more than 150 lines of JSX; if it does, extract a sub-component
- [ ] No file is longer than 300 lines; if it is, split it

**Tests**
- [ ] Tests assert on outcomes, not on implementation details (no testing private functions)
- [ ] No test uses `setTimeout` or arbitrary waits — use explicit assertions
- [ ] Each test is independent: no shared mutable state between test cases

---

## Items

---

### Item 1: Event Workflow States

**Spec**
Events gain an explicit status field moving through: `draft → ready → approved → published → live → completed | cancelled`.
- Only certain roles may make certain transitions (see transition map below)
- Attempting an illegal transition returns 422 with a message naming the blocked transition
- The current status is stored on the Event row; every transition is written to AuditLog
- Status is visible as a badge everywhere an event appears
- Users can filter events by status in PlannerView

**Transition map** (from → to: roles allowed):
```
draft     → ready:     planner, admin
ready     → approved:  admin
ready     → draft:     planner, admin        (send back)
approved  → published: admin
approved  → ready:     admin                 (send back)
published → live:      sports, admin
published → approved:  admin                 (unpublish)
live      → completed: sports, admin
live      → cancelled: admin
published → cancelled: admin
approved  → cancelled: admin
ready     → cancelled: admin
draft     → cancelled: planner, admin
```

**Acceptance Criteria**
1. `GET /api/events` includes `status` on each event object
2. `POST /api/events` creates an event with `status: 'draft'` by default
3. `PATCH /api/events/:id/status` with `{ status: 'ready' }` by a planner succeeds (200)
4. `PATCH /api/events/:id/status` with `{ status: 'approved' }` by a planner returns 422
5. `PATCH /api/events/:id/status` with `{ status: 'approved' }` by an admin succeeds
6. Every transition writes an AuditLog entry with `action: 'event.statusTransition'`
7. Frontend: PlannerView event cards show a status badge
8. Frontend: Event detail has a "Change status" control that only shows valid next states for the current user's role

---

#### Task 1.1 — Write migration SQL and update Prisma schema

**Files:**
- Create: `backend/prisma/migrations/add_event_status.sql`
- Modify: `backend/prisma/schema.prisma`

**Step 1: Write the migration SQL**

```sql
-- backend/prisma/migrations/add_event_status.sql
CREATE TYPE "EventStatus" AS ENUM (
  'draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled'
);

ALTER TABLE "Event"
  ADD COLUMN "status" "EventStatus" NOT NULL DEFAULT 'draft';

CREATE INDEX "Event_status_idx" ON "Event"("status");
```

**Step 2: Add to `backend/prisma/schema.prisma`**

After the existing `ContractStatus` enum (line 10), add:

```prisma
enum EventStatus {
  draft
  ready
  approved
  published
  live
  completed
  cancelled
}
```

On the `Event` model (after `customFields` field, line 117), add:

```prisma
  status            EventStatus @default(draft)
```

And add the index inside the `Event` model:

```prisma
  @@index([status])
```

**Step 3: Regenerate Prisma client**

```bash
cd backend && npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

**Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/add_event_status.sql
git commit -m "chore(event-status): add EventStatus enum and status column migration"
```

---

#### Task 1.2 — Write the failing transition-rule unit test

**Files:**
- Create: `backend/src/services/eventTransitions.ts`
- Create: `backend/tests/eventTransitions.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/tests/eventTransitions.test.ts
import { describe, it, expect } from 'vitest'
import { canTransition, TRANSITIONS } from '../src/services/eventTransitions.js'

describe('canTransition', () => {
  it('planner can move draft → ready', () => {
    expect(canTransition('draft', 'ready', 'planner')).toBe(true)
  })

  it('planner cannot move ready → approved', () => {
    expect(canTransition('ready', 'approved', 'planner')).toBe(false)
  })

  it('admin can move ready → approved', () => {
    expect(canTransition('ready', 'approved', 'admin')).toBe(true)
  })

  it('sports can move published → live', () => {
    expect(canTransition('published', 'live', 'sports')).toBe(true)
  })

  it('contracts role cannot make any transition', () => {
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      for (const { to } of targets) {
        expect(canTransition(from as never, to, 'contracts')).toBe(false)
      }
    }
  })

  it('same-status transition is always false', () => {
    expect(canTransition('draft', 'draft', 'admin')).toBe(false)
  })
})
```

**Step 2: Run test — confirm FAIL**

```bash
cd backend && npx vitest run tests/eventTransitions.test.ts
```

Expected: `Cannot find module '../src/services/eventTransitions.js'`

---

#### Task 1.3 — Implement the transition rule engine

**Files:**
- Modify: `backend/src/services/eventTransitions.ts` (create)

**Step 1: Write minimal implementation**

```typescript
// backend/src/services/eventTransitions.ts
import type { EventStatus, Role } from '@prisma/client'

type Transition = { to: EventStatus; roles: Role[] }

export const TRANSITIONS: Record<EventStatus, Transition[]> = {
  draft:     [
    { to: 'ready',     roles: ['planner', 'admin'] },
    { to: 'cancelled', roles: ['planner', 'admin'] },
  ],
  ready:     [
    { to: 'approved',  roles: ['admin'] },
    { to: 'draft',     roles: ['planner', 'admin'] },
    { to: 'cancelled', roles: ['admin'] },
  ],
  approved:  [
    { to: 'published', roles: ['admin'] },
    { to: 'ready',     roles: ['admin'] },
    { to: 'cancelled', roles: ['admin'] },
  ],
  published: [
    { to: 'live',      roles: ['sports', 'admin'] },
    { to: 'approved',  roles: ['admin'] },
    { to: 'cancelled', roles: ['admin'] },
  ],
  live:      [
    { to: 'completed', roles: ['sports', 'admin'] },
    { to: 'cancelled', roles: ['admin'] },
  ],
  completed: [],
  cancelled: [],
}

export function canTransition(from: EventStatus, to: EventStatus, role: Role): boolean {
  if (from === to) return false
  const allowed = TRANSITIONS[from] ?? []
  return allowed.some(t => t.to === to && t.roles.includes(role))
}
```

**Step 2: Run test — confirm PASS**

```bash
cd backend && npx vitest run tests/eventTransitions.test.ts
```

Expected: `6 tests passed`

---

#### Task 1.4 — Write failing integration test for status transition endpoint

**Files:**
- Create: `backend/tests/eventStatus.test.ts`

**Step 1: Write the test**

```typescript
// backend/tests/eventStatus.test.ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

// Mock prisma and auth for unit-level route testing (no real DB needed)
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    event: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
  authorize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

const mockPrisma = prisma as unknown as {
  event: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  auditLog: { create: ReturnType<typeof vi.fn> }
}

describe('PATCH /api/events/:id/status', () => {
  it('returns 422 when transition is not allowed for role', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ id: 1, status: 'draft' })
    // req.user will be planner (set by mocked authenticate below)
    const res = await request(app)
      .patch('/api/events/1/status')
      .set('x-test-role', 'planner')
      .send({ status: 'approved' })
    expect(res.status).toBe(422)
    expect(res.body.message).toMatch(/not allowed/i)
  })

  it('returns 200 and updated event when transition is valid', async () => {
    const updated = { id: 1, status: 'ready' }
    mockPrisma.event.findUnique.mockResolvedValue({ id: 1, status: 'draft' })
    mockPrisma.event.update.mockResolvedValue(updated)
    mockPrisma.auditLog.create.mockResolvedValue({})
    const res = await request(app)
      .patch('/api/events/1/status')
      .set('x-test-role', 'planner')
      .send({ status: 'ready' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
  })

  it('returns 404 when event does not exist', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/events/999/status')
      .send({ status: 'ready' })
    expect(res.status).toBe(404)
  })
})
```

**Step 2: Run — confirm FAIL**

```bash
cd backend && npx vitest run tests/eventStatus.test.ts
```

Expected: `Cannot find route PATCH /api/events/:id/status` → 404

---

#### Task 1.5 — Add the status transition endpoint

**Files:**
- Modify: `backend/src/routes/events.ts`

**Step 1: Add import and route** (add before `export default router`)

```typescript
import { canTransition } from '../services/eventTransitions.js'
import type { EventStatus } from '@prisma/client'

router.patch('/:id/status', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    const { status } = req.body as { status: EventStatus }
    if (!status) return next(createError(400, 'status is required'))

    const event = await prisma.event.findUnique({ where: { id } })
    if (!event) return next(createError(404, 'Event not found'))

    const user = req.user as { id: string; role: string }
    if (!canTransition(event.status, status, user.role as never)) {
      return next(createError(422, `Transition ${event.status} → ${status} is not allowed for role ${user.role}`))
    }

    const updated = await prisma.event.update({ where: { id }, data: { status } })

    await writeAuditLog({
      userId: user.id,
      action: 'event.statusTransition',
      entityType: 'event',
      entityId: String(id),
      oldValue: { status: event.status },
      newValue: { status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    emit('event:statusChanged', updated, 'events')
    res.json(updated)
  } catch (error) {
    next(error)
  }
})
```

Also add `status: Joi.string()` to `eventSchema` (after `customValues` field) so it is accepted on create/update:

```typescript
  status: Joi.string().valid('draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled'),
```

**Step 2: Run tests — confirm PASS**

```bash
cd backend && npx vitest run tests/eventStatus.test.ts tests/eventTransitions.test.ts
```

Expected: all tests pass.

---

#### Task 1.6 — Add `status` to frontend types and event service

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/services/events.ts` (if it exists) or verify `src/services/index.ts`

**Step 1: Add EventStatus type to `src/data/types.ts`** (after `ContractStatus` on line 84)

```typescript
export type EventStatus = 'draft' | 'ready' | 'approved' | 'published' | 'live' | 'completed' | 'cancelled'
```

**Step 2: Add `status` field to the `Event` interface** (after `duration` field)

```typescript
  status?: EventStatus
```

**Step 3: Check `src/services/events.ts` exports `transitionStatus`**

If the file doesn't have it, add:

```typescript
transitionStatus: (id: number, status: EventStatus) =>
  api.patch<Event>(`/events/${id}/status`, { status }),
```

**Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

---

#### Task 1.7 — Status badge in PlannerView event cards

**Files:**
- Modify: `src/pages/PlannerView.tsx`
- Modify: `src/components/ui/Badge.tsx`

**Step 1: Confirm Badge supports new variants**

Open `src/components/ui/Badge.tsx`. If `approved`, `published`, `live`, `completed`, `cancelled` variants are missing, add them to the variant map (following the existing colour pattern — use existing token classes like `text-success`, `text-warning`, etc.).

Status → badge variant map:
```
draft      → 'draft'    (already exists)
ready      → 'warning'
approved   → 'success'
published  → 'live'     (already exists)
live       → 'live'
completed  → 'default'
cancelled  → 'danger'   (already exists)
```

**Step 2: In PlannerView event card render** (wherever the event title/participants is shown), add:

```tsx
{event.status && event.status !== 'draft' && (
  <Badge variant={statusVariant(event.status)} size="xs">{event.status}</Badge>
)}
```

Add the helper above the component:

```typescript
function statusVariant(s: EventStatus): BadgeVariant {
  const map: Record<EventStatus, BadgeVariant> = {
    draft: 'draft', ready: 'warning', approved: 'success',
    published: 'live', live: 'live', completed: 'default', cancelled: 'danger',
  }
  return map[s] ?? 'default'
}
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

---

#### Task 1.8 — Status filter chip in PlannerView

**Files:**
- Modify: `src/pages/PlannerView.tsx`

**Step 1: Add filter state** (inside `PlannerView` component, near other filter state)

```typescript
const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all')
```

**Step 2: Filter events before rendering calendar**

```typescript
const visibleEvents = useMemo(() =>
  statusFilter === 'all'
    ? filteredEvents
    : filteredEvents.filter(e => e.status === statusFilter),
  [filteredEvents, statusFilter]
)
```

**Step 3: Render filter chips** (add near the top of the PlannerView JSX, next to existing controls)

```tsx
<div className="flex gap-1 flex-wrap">
  {(['all', 'draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled'] as const).map(s => (
    <button
      key={s}
      onClick={() => setStatusFilter(s)}
      className={`btn btn-sm ${statusFilter === s ? 'btn-p' : 'btn-g'}`}
    >
      {s}
    </button>
  ))}
</div>
```

**Step 4: TypeScript check + run tests**

```bash
npx tsc --noEmit && cd backend && npx vitest run
```

Expected: 0 TS errors, all tests pass.

**Step 5: Commit**

```bash
git add -p
git commit -m "feat(event-status): event lifecycle states, transition engine, status badge and filter"
```

---

### Item 2: Conflict Detection

**Spec**
Before saving an event, the system detects and surfaces conflicts. Conflicts are non-blocking (warnings, not hard errors) except for encoder double-booking, which is a hard error.

**Conflict types:**
1. **Channel overlap** — another event on the same `linearChannel` within 30 minutes of start time
2. **Encoder double-booking** — the encoder assigned in the active TechPlan is locked by another plan (hard error)
3. **Missing tech plan** — a `published` or `approved` event has no associated TechPlan
4. **Rights window** — the event's `startDateBE` falls outside any active contract for the competition (warning)

**Acceptance Criteria**
1. `POST /api/events/conflicts` accepts a partial event shape and returns `{ warnings: ConflictWarning[], errors: ConflictError[] }`
2. Channel overlap warning fires when two events share `linearChannel` within 30 min
3. Missing tech plan warning fires for `approved`/`published` events with no tech plan
4. Rights window warning fires when no valid contract covers the event date for the competition
5. Frontend: DynamicEventForm calls this endpoint on save and shows inline warnings; hard errors block the save

---

#### Task 2.1 — Write the failing conflict service unit test

**Files:**
- Create: `backend/src/services/conflictService.ts`
- Create: `backend/tests/conflictService.test.ts`

**Step 1: Write the test**

```typescript
// backend/tests/conflictService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectConflicts } from '../src/services/conflictService.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    event: { findMany: vi.fn() },
    contract: { findFirst: vi.fn() },
    techPlan: { findFirst: vi.fn() },
    encoderLock: { findUnique: vi.fn() },
  },
}))

const mockPrisma = prisma as unknown as {
  event: { findMany: ReturnType<typeof vi.fn> }
  contract: { findFirst: ReturnType<typeof vi.fn> }
  techPlan: { findFirst: ReturnType<typeof vi.fn> }
  encoderLock: { findUnique: ReturnType<typeof vi.fn> }
}

beforeEach(() => vi.clearAllMocks())

describe('detectConflicts', () => {
  const base = {
    id: undefined as number | undefined,
    competitionId: 10,
    linearChannel: 'VRT MAX',
    startDateBE: '2026-04-01',
    startTimeBE: '20:00',
    status: 'ready' as const,
  }

  it('returns channel overlap warning when another event is within 30 min', async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      { id: 99, linearChannel: 'VRT MAX', startDateBE: new Date('2026-04-01'), startTimeBE: '20:15', participants: 'X vs Y' }
    ])
    mockPrisma.contract.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.techPlan.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.encoderLock.findUnique.mockResolvedValue(null)

    const result = await detectConflicts(base)
    expect(result.warnings.some(w => w.type === 'channel_overlap')).toBe(true)
  })

  it('returns rights_window warning when no contract covers the date', async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.contract.findFirst.mockResolvedValue(null)
    mockPrisma.techPlan.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.encoderLock.findUnique.mockResolvedValue(null)

    const result = await detectConflicts(base)
    expect(result.warnings.some(w => w.type === 'rights_window')).toBe(true)
  })

  it('returns missing_tech_plan warning for approved event with no plan', async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.contract.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.techPlan.findFirst.mockResolvedValue(null)
    mockPrisma.encoderLock.findUnique.mockResolvedValue(null)

    const result = await detectConflicts({ ...base, status: 'approved' })
    expect(result.warnings.some(w => w.type === 'missing_tech_plan')).toBe(true)
  })

  it('returns no warnings for a clean event', async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.contract.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.techPlan.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.encoderLock.findUnique.mockResolvedValue(null)

    const result = await detectConflicts(base)
    expect(result.warnings).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })
})
```

**Step 2: Run — confirm FAIL**

```bash
cd backend && npx vitest run tests/conflictService.test.ts
```

---

#### Task 2.2 — Implement conflict service

**Files:**
- Create: `backend/src/services/conflictService.ts`

```typescript
// backend/src/services/conflictService.ts
import { prisma } from '../db/prisma.js'
import type { EventStatus } from '@prisma/client'

export type ConflictWarning = { type: 'channel_overlap' | 'rights_window' | 'missing_tech_plan'; message: string }
export type ConflictError   = { type: 'encoder_locked'; message: string }

type EventDraft = {
  id?: number
  competitionId: number
  linearChannel?: string
  startDateBE: string
  startTimeBE: string
  status?: EventStatus
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export async function detectConflicts(draft: EventDraft): Promise<{ warnings: ConflictWarning[]; errors: ConflictError[] }> {
  const warnings: ConflictWarning[] = []
  const errors: ConflictError[]     = []

  const dayStart = new Date(draft.startDateBE)
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(draft.startDateBE)
  dayEnd.setUTCHours(23, 59, 59, 999)

  // 1. Channel overlap
  if (draft.linearChannel) {
    const sameDay = await prisma.event.findMany({
      where: {
        linearChannel: draft.linearChannel,
        startDateBE: { gte: dayStart, lte: dayEnd },
        ...(draft.id ? { NOT: { id: draft.id } } : {}),
      },
      select: { id: true, startTimeBE: true, participants: true },
    })
    const draftMin = timeToMin(draft.startTimeBE)
    for (const ev of sameDay) {
      if (Math.abs(timeToMin(ev.startTimeBE) - draftMin) < 30) {
        warnings.push({
          type: 'channel_overlap',
          message: `Channel ${draft.linearChannel} already has "${ev.participants}" within 30 min`,
        })
      }
    }
  }

  // 2. Rights window
  const contract = await prisma.contract.findFirst({
    where: {
      competitionId: draft.competitionId,
      status: { in: ['valid', 'expiring'] },
      validFrom: { lte: dayEnd },
      validUntil: { gte: dayStart },
    },
  })
  if (!contract) {
    warnings.push({
      type: 'rights_window',
      message: 'No active contract covers this competition on this date',
    })
  }

  // 3. Missing tech plan (only warn for approved/published)
  if (draft.id && (draft.status === 'approved' || draft.status === 'published')) {
    const plan = await prisma.techPlan.findFirst({ where: { eventId: draft.id } })
    if (!plan) {
      warnings.push({ type: 'missing_tech_plan', message: 'No tech plan assigned for this event' })
    }
  }

  return { warnings, errors }
}
```

**Step 3: Run — confirm PASS**

```bash
cd backend && npx vitest run tests/conflictService.test.ts
```

---

#### Task 2.3 — Add conflict check endpoint

**Files:**
- Modify: `backend/src/routes/events.ts`

Add before `export default router`:

```typescript
import { detectConflicts } from '../services/conflictService.js'

router.post('/conflicts', authenticate, async (req, res, next) => {
  try {
    const result = await detectConflicts(req.body)
    res.json(result)
  } catch (error) {
    next(error)
  }
})
```

---

#### Task 2.4 — Frontend: conflict warnings in DynamicEventForm

**Files:**
- Create: `src/services/conflicts.ts`
- Modify: `src/components/forms/DynamicEventForm.tsx`

**Step 1: Create `src/services/conflicts.ts`**

```typescript
import { api } from '../utils/api'
import type { EventStatus } from '../data/types'

export type ConflictWarning = { type: 'channel_overlap' | 'rights_window' | 'missing_tech_plan'; message: string }
export type ConflictError   = { type: 'encoder_locked'; message: string }
export type ConflictResult  = { warnings: ConflictWarning[]; errors: ConflictError[] }

export const conflictsApi = {
  check: (draft: {
    id?: number
    competitionId: number
    linearChannel?: string
    startDateBE: string
    startTimeBE: string
    status?: EventStatus
  }) => api.post<ConflictResult>('/events/conflicts', draft),
}
```

**Step 2: In `DynamicEventForm.tsx`**, add a conflict check call on submit (before the existing `handleSaveEvent` call):

```tsx
import { conflictsApi, type ConflictResult } from '../../services/conflicts'

// Add state:
const [conflicts, setConflicts] = useState<ConflictResult | null>(null)

// In handleSubmit, before calling onSave:
const result = await conflictsApi.check({
  id: editEvent?.id,
  competitionId: Number(form.competitionId),
  linearChannel: form.linearChannel,
  startDateBE: form.startDateBE,
  startTimeBE: form.startTimeBE,
  status: editEvent?.status,
}).catch(() => null)

setConflicts(result)
if (result?.errors.length) return // block save on hard errors
```

**Step 3: Render warnings above the submit button:**

```tsx
{conflicts && (
  <div className="space-y-1 mb-3">
    {conflicts.errors.map((e, i) => (
      <div key={i} className="text-xs text-danger bg-danger/10 rounded px-2 py-1">{e.message}</div>
    ))}
    {conflicts.warnings.map((w, i) => (
      <div key={i} className="text-xs text-warning bg-warning/10 rounded px-2 py-1">{w.message}</div>
    ))}
  </div>
)}
```

**Step 4: TypeScript check + tests**

```bash
npx tsc --noEmit && cd backend && npx vitest run
```

**Step 5: Commit**

```bash
git add -p
git commit -m "feat(conflicts): conflict detection service, endpoint, and form warnings"
```

---

### Item 3: Audit / History UI

**Spec**
Every event, tech plan, and contract has a history panel showing all changes (from the existing AuditLog table), with actor, timestamp, before/after values. Admins can restore a non-destructive rollback from any log entry.

**Acceptance Criteria**
1. `GET /api/audit/event/:id` returns a list of AuditLog entries for that event, newest first
2. `GET /api/audit/techPlan/:id` and `GET /api/audit/contract/:id` work identically
3. `POST /api/audit/:logId/restore` replays `oldValue` as a Prisma update and writes a new AuditLog entry with `action: 'event.restored'`
4. Restore is admin-only
5. Frontend: a "History" tab/panel shows entries with actor name, relative time, and a collapsible before/after diff
6. Frontend: each entry has a "Restore" button (admin only) that calls the restore endpoint and refreshes the event

---

#### Task 3.1 — Write failing test for audit route

**Files:**
- Create: `backend/tests/audit.test.ts`
- Create: `backend/src/routes/audit.ts`

**Step 1: Write test**

```typescript
// backend/tests/audit.test.ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    event: { update: vi.fn() },
    techPlan: { update: vi.fn() },
    contract: { update: vi.fn() },
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (_: unknown, __: unknown, next: () => void) => next(),
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mockPrisma = prisma as unknown as {
  auditLog: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  event: { update: ReturnType<typeof vi.fn> }
}

describe('GET /api/audit/:entityType/:entityId', () => {
  it('returns 200 with list of audit entries', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: 'abc', action: 'event.update', oldValue: {}, newValue: {}, createdAt: new Date() }
    ])
    const res = await request(app).get('/api/audit/event/1')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/audit/:logId/restore', () => {
  it('returns 200 and calls update with oldValue', async () => {
    mockPrisma.auditLog.findUnique.mockResolvedValue({
      id: 'abc', entityType: 'event', entityId: '1',
      oldValue: { participants: 'Old Name' }, newValue: { participants: 'New Name' }
    })
    mockPrisma.event.update.mockResolvedValue({ id: 1, participants: 'Old Name' })
    mockPrisma.auditLog.create.mockResolvedValue({})

    const res = await request(app).post('/api/audit/abc/restore')
    expect(res.status).toBe(200)
  })
})
```

**Step 2: Run — confirm FAIL**

```bash
cd backend && npx vitest run tests/audit.test.ts
```

---

#### Task 3.2 — Implement audit route

**Files:**
- Create: `backend/src/routes/audit.ts`
- Modify: `backend/src/index.ts`

**Step 1: Create route**

```typescript
// backend/src/routes/audit.ts
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'

const router = Router()

router.get('/:entityType/:entityId', authenticate, async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params
    const entries = await prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json(entries)
  } catch (error) {
    next(error)
  }
})

const RESTORABLE: Record<string, (id: number, data: object) => Promise<unknown>> = {
  event:     (id, data) => prisma.event.update({ where: { id }, data }),
  techPlan:  (id, data) => prisma.techPlan.update({ where: { id }, data }),
  contract:  (id, data) => prisma.contract.update({ where: { id }, data }),
}

router.post('/:logId/restore', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const log = await prisma.auditLog.findUnique({ where: { id: req.params.logId } })
    if (!log) return next(createError(404, 'Audit log entry not found'))
    if (!log.oldValue) return next(createError(400, 'No previous value to restore'))

    const restoreFn = RESTORABLE[log.entityType]
    if (!restoreFn) return next(createError(400, `Restore not supported for ${log.entityType}`))

    const restored = await restoreFn(Number(log.entityId), log.oldValue as object)

    const user = req.user as { id: string }
    await writeAuditLog({
      userId: user.id,
      action: `${log.entityType}.restored`,
      entityType: log.entityType,
      entityId: log.entityId,
      oldValue: log.newValue ?? undefined,
      newValue: log.oldValue ?? undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.json(restored)
  } catch (error) {
    next(error)
  }
})

export default router
```

**Step 2: Register route in `backend/src/index.ts`**

Add import and `app.use` line alongside existing routes:

```typescript
import auditRoutes from './routes/audit.js'
// ...
app.use('/api/audit', auditRoutes)
```

**Step 3: Run tests**

```bash
cd backend && npx vitest run tests/audit.test.ts
```

---

#### Task 3.3 — Frontend: HistoryPanel component

**Files:**
- Create: `src/components/ui/HistoryPanel.tsx`
- Create: `src/services/audit.ts`

**Step 1: Create audit service**

```typescript
// src/services/audit.ts
import { api } from '../utils/api'

export interface AuditEntry {
  id: string
  userId?: string
  action: string
  entityType: string
  entityId: string
  oldValue?: unknown
  newValue?: unknown
  createdAt: string
}

export const auditApi = {
  list: (entityType: string, entityId: number) =>
    api.get<AuditEntry[]>(`/audit/${entityType}/${entityId}`),
  restore: (logId: string) =>
    api.post<unknown>(`/audit/${logId}/restore`, {}),
}
```

**Step 2: Create `src/components/ui/HistoryPanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { auditApi, type AuditEntry } from '../../services/audit'
import { useAuth } from '../../hooks'

interface HistoryPanelProps {
  entityType: string
  entityId: number
  onRestored?: () => void
}

export function HistoryPanel({ entityType, entityId, onRestored }: HistoryPanelProps) {
  const { user } = useAuth()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    auditApi.list(entityType, entityId)
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [entityType, entityId])

  const handleRestore = async (entry: AuditEntry) => {
    await auditApi.restore(entry.id)
    onRestored?.()
  }

  if (loading) return <div className="text-xs text-muted animate-pulse">Loading history…</div>
  if (!entries.length) return <div className="text-xs text-muted">No history yet.</div>

  return (
    <div className="space-y-2">
      {entries.map(e => (
        <div key={e.id} className="text-xs border border-surface-2 rounded p-2">
          <div className="flex justify-between items-center">
            <span className="font-medium text-text-2">{e.action}</span>
            <span className="text-muted">{new Date(e.createdAt).toLocaleString()}</span>
          </div>
          <button
            className="text-muted underline mt-1"
            onClick={() => setExpanded(expanded === e.id ? null : e.id)}
          >
            {expanded === e.id ? 'Hide diff' : 'Show diff'}
          </button>
          {expanded === e.id && (
            <pre className="mt-1 bg-surface rounded p-1 overflow-x-auto text-[10px]">
              {JSON.stringify({ before: e.oldValue, after: e.newValue }, null, 2)}
            </pre>
          )}
          {user?.role === 'admin' && e.oldValue && (
            <button
              className="btn btn-sm btn-g mt-1"
              onClick={() => handleRestore(e)}
            >
              Restore to this
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
```

**Step 3: TypeScript check + commit**

```bash
npx tsc --noEmit && cd backend && npx vitest run
git add -p
git commit -m "feat(audit): audit history endpoint, restore endpoint, HistoryPanel component"
```

---

### Item 4: Sport-specific Validation Enforcement

**Spec**
When creating or editing an event, if mandatory custom fields are configured for the selected sport (`GET /api/fields/mandatory/:sportId`), those fields must be filled before the form can submit. Missing mandatory fields are highlighted inline.

**Acceptance Criteria**
1. When `sportId` changes in DynamicEventForm, mandatory field IDs are fetched from `/api/fields/mandatory/:sportId`
2. On form submit, any mandatory field with an empty `customValues` entry blocks submission and shows an inline error next to that field
3. No backend changes required (the API already exists)

---

#### Task 4.1 — Enforce mandatory fields in DynamicEventForm

**Files:**
- Modify: `src/components/forms/DynamicEventForm.tsx`
- Modify: `src/services/fields.ts`

**Step 1: Ensure `fieldsApi.getMandatory` exists in `src/services/fields.ts`**

```typescript
getMandatory: (sportId: number) =>
  api.get<{ sportId: number; fieldIds: string[] }>(`/fields/mandatory/${sportId}`),
```

**Step 2: In DynamicEventForm, add mandatory field fetch**

```typescript
import { fieldsApi } from '../../services/fields'

const [mandatoryFieldIds, setMandatoryFieldIds] = useState<string[]>([])

// Fetch mandatory fields when sportId changes
useEffect(() => {
  const id = Number(form.sportId)
  if (!id) { setMandatoryFieldIds([]); return }
  fieldsApi.getMandatory(id)
    .then(cfg => setMandatoryFieldIds(cfg.fieldIds))
    .catch(() => setMandatoryFieldIds([]))
}, [form.sportId])
```

**Step 3: Add validation in handleSubmit, before calling onSave**

```typescript
const missingMandatory = mandatoryFieldIds.filter(fieldId => {
  const val = customValues[fieldId]
  return !val || val.trim() === ''
})
if (missingMandatory.length > 0) {
  setMandatoryErrors(missingMandatory) // new state
  return
}
setMandatoryErrors([])
```

Add state: `const [mandatoryErrors, setMandatoryErrors] = useState<string[]>([])`

**Step 4: Highlight mandatory error fields**

In the custom fields render loop, add alongside each field:

```tsx
{mandatoryErrors.includes(field.id) && (
  <span className="text-xs text-danger">Required for {sport?.name}</span>
)}
```

**Step 5: TypeScript check + commit**

```bash
npx tsc --noEmit
git add -p
git commit -m "feat(validation): enforce mandatory sport-specific fields in event form"
```

---

### Item 5: Rights-aware Scheduling

**Spec**
Extend the conflict detection from Item 2 to block channel assignment (not just warn) when:
- `linearChannel` is assigned but no contract grants `linearRights` for the competition on that date
- `onDemandChannel` is assigned but no contract grants `maxRights`
- `radioChannel` is assigned but no contract grants `radioRights`

These become **hard errors** (not warnings) that block the form save. The existing `ConflictError` type from Item 2 is extended with a `rights_violation` type.

**Acceptance Criteria**
1. `detectConflicts` returns a `ConflictError` with `type: 'rights_violation'` when a channel is assigned without the corresponding contract right
2. DynamicEventForm already blocks save on hard errors (from Item 2) — no new frontend code needed beyond extending `conflictService`
3. New test cases added to `conflictService.test.ts`

---

#### Task 5.1 — Extend conflictService with rights checks

**Files:**
- Modify: `backend/src/services/conflictService.ts`
- Modify: `backend/tests/conflictService.test.ts`

**Step 1: Add `rights_violation` to `ConflictError` type**

```typescript
export type ConflictError = { type: 'encoder_locked' | 'rights_violation'; message: string }
```

**Step 2: Add rights checks in `detectConflicts`** (after the existing rights window check)

```typescript
  // 4. Rights violations (hard errors per channel type)
  if (contract) {
    if (draft.linearChannel && !(contract as { linearRights: boolean }).linearRights) {
      errors.push({ type: 'rights_violation', message: `Contract does not grant linear rights for ${draft.linearChannel}` })
    }
    if (draft.onDemandChannel && !(contract as { maxRights: boolean }).maxRights) {
      errors.push({ type: 'rights_violation', message: `Contract does not grant on-demand rights for ${draft.onDemandChannel}` })
    }
    if (draft.radioChannel && !(contract as { radioRights: boolean }).radioRights) {
      errors.push({ type: 'rights_violation', message: `Contract does not grant radio rights for ${draft.radioChannel}` })
    }
  }
```

Also extend the `EventDraft` type:

```typescript
type EventDraft = {
  id?: number
  competitionId: number
  linearChannel?: string
  onDemandChannel?: string
  radioChannel?: string
  startDateBE: string
  startTimeBE: string
  status?: EventStatus
}
```

Update `prisma.contract.findFirst` to include rights fields:

```typescript
const contract = await prisma.contract.findFirst({
  where: { ... },
  select: { id: true, linearRights: true, maxRights: true, radioRights: true },
})
```

**Step 3: Add tests to `conflictService.test.ts`**

```typescript
  it('returns rights_violation error when linearRights is false', async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.contract.findFirst.mockResolvedValue({ id: 1, linearRights: false, maxRights: true, radioRights: true })
    mockPrisma.techPlan.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.encoderLock.findUnique.mockResolvedValue(null)

    const result = await detectConflicts({ ...base, linearChannel: 'VRT MAX' })
    expect(result.errors.some(e => e.type === 'rights_violation')).toBe(true)
  })

  it('no rights_violation when contract grants all rights', async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.contract.findFirst.mockResolvedValue({ id: 1, linearRights: true, maxRights: true, radioRights: true })
    mockPrisma.techPlan.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.encoderLock.findUnique.mockResolvedValue(null)

    const result = await detectConflicts({ ...base, linearChannel: 'VRT MAX' })
    expect(result.errors).toHaveLength(0)
  })
```

**Step 4: Run + commit**

```bash
cd backend && npx vitest run tests/conflictService.test.ts
npx tsc --noEmit
git add -p
git commit -m "feat(rights): rights-aware scheduling via hard conflict errors in conflict detection"
```

---

### Item 6: In-app Notifications

**Spec**
Users receive in-app notifications for: contract expiring within 30 days, failed import job, event status changed to `approved` (notify planner), encoder lock conflict. Notifications are stored per-user and have `read/unread` state.

**Schema additions:**
```sql
CREATE TABLE "Notification" (
  "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT,
  "entityType" TEXT,
  "entityId"  TEXT,
  "isRead"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
```

**Acceptance Criteria**
1. `GET /api/notifications` returns current user's notifications, unread first, max 50
2. `PATCH /api/notifications/:id/read` marks as read
3. `PATCH /api/notifications/read-all` marks all as read for current user
4. Notifications are created when: `publishService.checkExpiringContracts` fires (one notification per affected contract owner), a status transition to `approved` fires (notify the event creator)
5. Frontend: notification bell badge in layout Header showing unread count, dropdown panel listing notifications

---

#### Task 6.1 — Migration and Prisma schema

**Files:**
- Create: `backend/prisma/migrations/add_notifications.sql`
- Modify: `backend/prisma/schema.prisma`

**Step 1: Write SQL migration**

```sql
-- backend/prisma/migrations/add_notifications.sql
CREATE TABLE "Notification" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "body"        TEXT,
  "entityType"  TEXT,
  "entityId"    TEXT,
  "isRead"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
```

**Step 2: Add Prisma model** (after `WebhookDelivery` model)

```prisma
model Notification {
  id          String   @id @default(uuid())
  userId      String
  type        String
  title       String
  body        String?
  entityType  String?
  entityId    String?
  isRead      Boolean  @default(false)
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@index([createdAt])
}
```

Also add `notifications Notification[]` to the `User` model.

**Step 3: Regenerate + commit schema**

```bash
cd backend && npx prisma generate
git add backend/prisma/schema.prisma backend/prisma/migrations/add_notifications.sql
git commit -m "chore(notifications): add Notification table migration and Prisma model"
```

---

#### Task 6.2 — Write failing test for notification route

**Files:**
- Create: `backend/tests/notifications.test.ts`

```typescript
// backend/tests/notifications.test.ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => {
    req.user = { id: 'user1', role: 'planner' }
    next()
  },
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mockPrisma = prisma as unknown as {
  notification: {
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
}

describe('GET /api/notifications', () => {
  it('returns 200 with user notifications', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      { id: '1', type: 'contract_expiring', title: 'Contract expiring soon', isRead: false }
    ])
    const res = await request(app).get('/api/notifications')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('PATCH /api/notifications/read-all', () => {
  it('marks all notifications as read', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 })
    const res = await request(app).patch('/api/notifications/read-all')
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(3)
  })
})
```

Run — confirm FAIL:
```bash
cd backend && npx vitest run tests/notifications.test.ts
```

---

#### Task 6.3 — Implement notification route

**Files:**
- Create: `backend/src/routes/notifications.ts`
- Create: `backend/src/services/notificationService.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/src/routes/events.ts` (emit on status → approved)

**Step 1: `notificationService.ts`**

```typescript
// backend/src/services/notificationService.ts
import { prisma } from '../db/prisma.js'

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  opts?: { body?: string; entityType?: string; entityId?: string }
): Promise<void> {
  await prisma.notification.create({
    data: { userId, type, title, ...opts },
  })
}
```

**Step 2: `notifications.ts` route**

```typescript
// backend/src/routes/notifications.ts
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()

router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const items = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    })
    res.json(items)
  } catch (error) { next(error) }
})

router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const result = await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    })
    res.json({ count: result.count })
  } catch (error) { next(error) }
})

router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const note = await prisma.notification.findUnique({ where: { id: req.params.id } })
    if (!note) return next(createError(404, 'Notification not found'))
    if (note.userId !== user.id) return next(createError(403, 'Forbidden'))
    await prisma.notification.update({ where: { id: note.id }, data: { isRead: true } })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
```

**Step 3: Register in `index.ts`**

```typescript
import notificationsRoutes from './routes/notifications.js'
// ...
app.use('/api/notifications', notificationsRoutes)
```

**Step 4: Emit notification on status → approved** (in `events.ts` status transition endpoint, after `writeAuditLog`)

```typescript
import { createNotification } from '../services/notificationService.js'

// After writeAuditLog in status transition endpoint:
if (status === 'approved' && event.createdById) {
  void createNotification(
    event.createdById,
    'event_approved',
    `Your event "${event.participants}" was approved`,
    { entityType: 'event', entityId: String(id) }
  )
}
```

**Step 5: Run tests + commit**

```bash
cd backend && npx vitest run tests/notifications.test.ts
npx tsc --noEmit
git add -p
git commit -m "feat(notifications): notification model, CRUD route, approval trigger"
```

---

#### Task 6.4 — Frontend: notification bell in Header

**Files:**
- Modify: `src/components/layout/Header.tsx` (or wherever the main header lives)
- Create: `src/services/notifications.ts`
- Create: `src/components/ui/NotificationBell.tsx`

**Step 1: `src/services/notifications.ts`**

```typescript
import { api } from '../utils/api'

export interface AppNotification {
  id: string
  type: string
  title: string
  body?: string
  entityType?: string
  entityId?: string
  isRead: boolean
  createdAt: string
}

export const notificationsApi = {
  list: () => api.get<AppNotification[]>('/notifications'),
  markRead: (id: string) => api.patch<{ ok: boolean }>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.patch<{ count: number }>('/notifications/read-all', {}),
}
```

**Step 2: `NotificationBell.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react'
import { notificationsApi, type AppNotification } from '../../services/notifications'

export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    notificationsApi.list().then(setItems).catch(() => {})
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread = items.filter(n => !n.isRead).length

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead()
    setItems(prev => prev.map(n => ({ ...n, isRead: true })))
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="btn btn-g relative">
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-8 w-80 bg-surface border border-surface-2 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="flex justify-between items-center px-3 py-2 border-b border-surface-2">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-muted underline">Mark all read</button>
            )}
          </div>
          {items.length === 0 && (
            <div className="text-xs text-muted p-4 text-center">No notifications</div>
          )}
          {items.map(n => (
            <div key={n.id} className={`px-3 py-2 border-b border-surface-2 ${n.isRead ? 'opacity-60' : ''}`}>
              <div className="text-sm font-medium">{n.title}</div>
              {n.body && <div className="text-xs text-muted mt-0.5">{n.body}</div>}
              <div className="text-xs text-muted mt-0.5">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 3: Add `<NotificationBell />` to Header**

Find the header component and place `<NotificationBell />` next to the user avatar/logout button.

**Step 4: TypeScript check + commit**

```bash
npx tsc --noEmit
git add -p
git commit -m "feat(notifications): NotificationBell component with unread count and mark-all-read"
```

---

### Item 7: Saved Views

**Spec**
Users can save a named filter preset (status, channel, sport, date range, search query) and reload it. Saved views are per-user and persist in the database.

**Schema:**
```sql
CREATE TABLE "SavedView" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "context"     TEXT NOT NULL,   -- 'planner' | 'contracts' | 'sports'
  "filterState" JSONB NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "SavedView_userId_name_idx" ON "SavedView"("userId", "name");
```

**Acceptance Criteria**
1. `GET /api/saved-views?context=planner` returns current user's saved views for that context
2. `POST /api/saved-views` creates a new view (name + context + filterState)
3. `DELETE /api/saved-views/:id` deletes (owner-only)
4. Frontend: "Save view" button in PlannerView toolbar captures current filters and prompts for a name
5. Frontend: Saved view chips appear below toolbar; clicking loads that filter state

---

#### Task 7.1 — Migration, schema, route, service

**Files:**
- Create: `backend/prisma/migrations/add_saved_views.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/routes/savedViews.ts`
- Create: `backend/tests/savedViews.test.ts`

**Step 1: SQL**

```sql
-- backend/prisma/migrations/add_saved_views.sql
CREATE TABLE "SavedView" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "context"     TEXT NOT NULL,
  "filterState" JSONB NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "SavedView_userId_name_idx" ON "SavedView"("userId", "name");
```

**Step 2: Prisma model**

```prisma
model SavedView {
  id           String   @id @default(uuid())
  userId       String
  name         String
  context      String
  filterState  Json     @default("{}")
  createdAt    DateTime @default(now())

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, name])
  @@index([userId, context])
}
```

Add `savedViews SavedView[]` to `User` model.

**Step 3: Write failing test**

```typescript
// backend/tests/savedViews.test.ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: { savedView: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() } }
}))
vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown }, _: unknown, next: () => void) => { req.user = { id: 'u1' }; next() },
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mock = (prisma as unknown as { savedView: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } }).savedView

describe('GET /api/saved-views', () => {
  it('returns views for context', async () => {
    mock.findMany.mockResolvedValue([{ id: '1', name: 'My view', context: 'planner', filterState: {} }])
    const res = await request(app).get('/api/saved-views?context=planner')
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('My view')
  })
})

describe('DELETE /api/saved-views/:id', () => {
  it('deletes owned view', async () => {
    mock.findUnique.mockResolvedValue({ id: '1', userId: 'u1' })
    mock.delete.mockResolvedValue({})
    const res = await request(app).delete('/api/saved-views/1')
    expect(res.status).toBe(200)
  })

  it('returns 403 for non-owner', async () => {
    mock.findUnique.mockResolvedValue({ id: '1', userId: 'other' })
    const res = await request(app).delete('/api/saved-views/1')
    expect(res.status).toBe(403)
  })
})
```

**Step 4: Implement route**

```typescript
// backend/src/routes/savedViews.ts
import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()
const schema = Joi.object({
  name: Joi.string().max(80).required(),
  context: Joi.string().valid('planner', 'contracts', 'sports').required(),
  filterState: Joi.object().required(),
})

router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const { context } = req.query
    const views = await prisma.savedView.findMany({
      where: { userId: user.id, ...(context ? { context: context as string } : {}) },
      orderBy: { createdAt: 'asc' },
    })
    res.json(views)
  } catch (error) { next(error) }
})

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const user = req.user as { id: string }
    const view = await prisma.savedView.create({ data: { userId: user.id, ...value } })
    res.status(201).json(view)
  } catch (error) { next(error) }
})

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const view = await prisma.savedView.findUnique({ where: { id: req.params.id } })
    if (!view) return next(createError(404, 'Saved view not found'))
    if (view.userId !== user.id) return next(createError(403, 'Forbidden'))
    await prisma.savedView.delete({ where: { id: view.id } })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
```

Register in `index.ts`:
```typescript
import savedViewsRoutes from './routes/savedViews.js'
app.use('/api/saved-views', savedViewsRoutes)
```

**Step 5: Run tests + commit**

```bash
cd backend && npx prisma generate && npx vitest run tests/savedViews.test.ts
npx tsc --noEmit
git add -p
git commit -m "feat(saved-views): saved filter presets per user with context isolation"
```

---

#### Task 7.2 — Frontend: save view button and chip bar in PlannerView

**Files:**
- Create: `src/services/savedViews.ts`
- Modify: `src/pages/PlannerView.tsx`

**Step 1: `src/services/savedViews.ts`**

```typescript
import { api } from '../utils/api'

export interface SavedView {
  id: string
  name: string
  context: string
  filterState: Record<string, unknown>
}

export const savedViewsApi = {
  list: (context: string) => api.get<SavedView[]>(`/saved-views?context=${context}`),
  create: (name: string, context: string, filterState: Record<string, unknown>) =>
    api.post<SavedView>('/saved-views', { name, context, filterState }),
  delete: (id: string) => api.delete<{ ok: boolean }>(`/saved-views/${id}`),
}
```

**Step 2: In PlannerView**, add saved view state and controls

```typescript
const [savedViews, setSavedViews] = useState<SavedView[]>([])
const [saveViewName, setSaveViewName] = useState('')
const [showSaveInput, setShowSaveInput] = useState(false)

useEffect(() => {
  savedViewsApi.list('planner').then(setSavedViews).catch(() => {})
}, [])

const currentFilterState = { statusFilter, searchQuery }

const handleSaveView = async () => {
  if (!saveViewName.trim()) return
  const view = await savedViewsApi.create(saveViewName.trim(), 'planner', currentFilterState)
  setSavedViews(prev => [...prev, view])
  setSaveViewName('')
  setShowSaveInput(false)
}

const handleLoadView = (view: SavedView) => {
  const fs = view.filterState as { statusFilter?: string; searchQuery?: string }
  if (fs.statusFilter) setStatusFilter(fs.statusFilter as never)
  if (fs.searchQuery !== undefined) setSearchQuery(fs.searchQuery)
}

const handleDeleteView = async (id: string) => {
  await savedViewsApi.delete(id)
  setSavedViews(prev => prev.filter(v => v.id !== id))
}
```

Render chip bar:

```tsx
<div className="flex gap-1 flex-wrap items-center">
  {savedViews.map(v => (
    <div key={v.id} className="flex items-center gap-1 bg-surface-2 rounded px-2 py-0.5 text-xs">
      <button onClick={() => handleLoadView(v)}>{v.name}</button>
      <button onClick={() => handleDeleteView(v.id)} className="text-muted hover:text-danger">×</button>
    </div>
  ))}
  {showSaveInput ? (
    <div className="flex gap-1">
      <input
        className="inp text-xs px-2 py-0.5 w-32"
        value={saveViewName}
        onChange={e => setSaveViewName(e.target.value)}
        placeholder="View name…"
        onKeyDown={e => e.key === 'Enter' && handleSaveView()}
        autoFocus
      />
      <button className="btn btn-sm btn-p" onClick={handleSaveView}>Save</button>
      <button className="btn btn-sm btn-g" onClick={() => setShowSaveInput(false)}>Cancel</button>
    </div>
  ) : (
    <button className="btn btn-sm btn-g" onClick={() => setShowSaveInput(true)}>+ Save view</button>
  )}
</div>
```

**Step 3: TypeScript check + commit**

```bash
npx tsc --noEmit
git add -p
git commit -m "feat(saved-views): save/load/delete named filter presets in PlannerView"
```

---

### Item 8: Drag-and-drop Rescheduling

**Spec**
Event cards in PlannerView can be dragged from one day column to another. Dropping an event on a different day calls `PUT /api/events/:id` with the new `startDateBE`. The UI updates optimistically and reverts on failure.

**Acceptance Criteria**
1. Install `@dnd-kit/core` and `@dnd-kit/utilities`
2. Dragging an event card to a new day column updates the event's `startDateBE`
3. Optimistic update: the card moves immediately; reverts on API failure
4. Drag is disabled for `completed` and `cancelled` events
5. A visual drop indicator highlights the target column during drag

---

#### Task 8.1 — Install dnd-kit

**Files:**
- Modify: `package.json` (frontend)

```bash
cd /mnt/c/Projects/Planza && npm install @dnd-kit/core @dnd-kit/utilities
```

Verify it appears in `package.json` dependencies. No config files needed.

---

#### Task 8.2 — Add drag-and-drop to PlannerView

**Files:**
- Modify: `src/pages/PlannerView.tsx`

**Step 1: Add DnD imports**

```typescript
import { DndContext, DragOverlay, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { eventsApi } from '../services'
```

**Step 2: Create `DraggableEventCard` wrapper** (inside PlannerView file, before the main component)

```typescript
function DraggableEventCard({ event, children }: { event: Event; children: React.ReactNode }) {
  const disabled = event.status === 'completed' || event.status === 'cancelled'
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(event.id),
    disabled,
    data: { event },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

function DroppableDayColumn({ dateKey, children }: { dateKey: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: dateKey })
  return (
    <div ref={setNodeRef} className={`min-h-full ${isOver ? 'ring-2 ring-inset ring-primary/40' : ''}`}>
      {children}
    </div>
  )
}
```

**Step 3: Wrap calendar in `DndContext`** and handle drop

```typescript
const handleDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
  if (!over || active.id === over.id) return
  const eventId = Number(active.id)
  const newDate = over.id as string          // dateKey is 'YYYY-MM-DD'
  const event = events.find(e => e.id === eventId)
  if (!event) return

  const snapshot = event.startDateBE
  // Optimistic update
  setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
  try {
    await eventsApi.update(eventId, { ...event, startDateBE: newDate })
  } catch {
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: snapshot } : e))
    toast.error('Failed to reschedule event')
  }
}, [events, setEvents, toast])
```

Wrap the calendar JSX in `<DndContext onDragEnd={handleDragEnd}>` and wrap each day column header/content in `<DroppableDayColumn dateKey={dateStr(day)}>`. Wrap each event card render in `<DraggableEventCard event={event}>`.

**Step 4: TypeScript check + commit**

```bash
npx tsc --noEmit
git add -p
git commit -m "feat(drag-drop): drag-to-reschedule event cards in PlannerView with optimistic update"
```

---

### Item 9: Import Scheduling

**Spec**
Import sources can be configured with a cron schedule. When enabled, the server runs the import automatically. The schedule is configurable and pausable from the Admin panel.

**Schema:**
```sql
CREATE TABLE "ImportSchedule" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sourceId"    TEXT NOT NULL UNIQUE REFERENCES "ImportSource"("id") ON DELETE CASCADE,
  "cronExpr"    TEXT NOT NULL,
  "isEnabled"   BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt"   TIMESTAMPTZ,
  "nextRunAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Acceptance Criteria**
1. `GET /api/import/schedules` returns all schedules (admin only)
2. `POST /api/import/schedules` creates a schedule for a source (validates cron expression)
3. `PATCH /api/import/schedules/:id` updates `isEnabled` or `cronExpr`
4. On server startup, active schedules are registered with `node-cron`; each tick triggers the existing import pipeline for that source
5. Admin panel shows a list of schedules with enable/disable toggle

---

#### Task 9.1 — Install node-cron and write migration

**Step 1: Install**

```bash
cd /mnt/c/Projects/Planza/backend && npm install node-cron && npm install -D @types/node-cron
```

**Step 2: SQL migration**

```sql
-- backend/prisma/migrations/add_import_schedules.sql
CREATE TABLE "ImportSchedule" (
  "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sourceId"  TEXT NOT NULL UNIQUE REFERENCES "ImportSource"("id") ON DELETE CASCADE,
  "cronExpr"  TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMPTZ,
  "nextRunAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Step 3: Prisma model**

```prisma
model ImportSchedule {
  id        String    @id @default(uuid())
  sourceId  String    @unique
  cronExpr  String
  isEnabled Boolean   @default(true)
  lastRunAt DateTime?
  nextRunAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  source    ImportSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)
}
```

Add `schedule ImportSchedule?` to `ImportSource` model.

**Step 4: Regenerate + commit**

```bash
cd backend && npx prisma generate
git add backend/prisma/
git commit -m "chore(import-schedule): add ImportSchedule table migration and model"
```

---

#### Task 9.2 — Write failing test for schedule route

```typescript
// backend/tests/importSchedules.test.ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: { importSchedule: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() } }
}))
vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (_: unknown, __: unknown, next: () => void) => next(),
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mock = (prisma as unknown as { importSchedule: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }).importSchedule

describe('GET /api/import/schedules', () => {
  it('returns 200 with schedules list', async () => {
    mock.findMany.mockResolvedValue([{ id: '1', cronExpr: '0 6 * * *', isEnabled: true }])
    const res = await request(app).get('/api/import/schedules')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })
})

describe('POST /api/import/schedules', () => {
  it('returns 400 for invalid cron expression', async () => {
    const res = await request(app)
      .post('/api/import/schedules')
      .send({ sourceId: 'src1', cronExpr: 'not-a-cron' })
    expect(res.status).toBe(400)
  })
})
```

---

#### Task 9.3 — Implement schedule route and cron runner

**Files:**
- Create: `backend/src/routes/importSchedules.ts`
- Create: `backend/src/services/importScheduler.ts`
- Modify: `backend/src/index.ts`

**Step 1: `importScheduler.ts`**

```typescript
// backend/src/services/importScheduler.ts
import cron from 'node-cron'
import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'

const jobs = new Map<string, cron.ScheduledTask>()

export async function startScheduledImports(): Promise<void> {
  const schedules = await prisma.importSchedule.findMany({
    where: { isEnabled: true },
    include: { source: true },
  })

  for (const schedule of schedules) {
    registerJob(schedule.id, schedule.cronExpr, schedule.source.code)
  }

  logger.info(`Import scheduler: registered ${schedules.length} active schedules`)
}

export function registerJob(scheduleId: string, cronExpr: string, sourceCode: string): void {
  stopJob(scheduleId)
  const task = cron.schedule(cronExpr, async () => {
    logger.info(`Running scheduled import for source: ${sourceCode}`)
    try {
      await prisma.importSchedule.update({
        where: { id: scheduleId },
        data: { lastRunAt: new Date() },
      })
      // Trigger import via the existing import pipeline
      // (calls the same code path as POST /api/import/run)
      const { runImport } = await import('./importRunner.js')
      await runImport(sourceCode)
    } catch (err) {
      logger.error('Scheduled import failed', { sourceCode, err })
    }
  })
  jobs.set(scheduleId, task)
}

export function stopJob(scheduleId: string): void {
  jobs.get(scheduleId)?.stop()
  jobs.delete(scheduleId)
}
```

> **Note:** `importRunner.ts` is a thin wrapper that calls the existing import adapter logic. If that entry point does not yet exist, create it as: `export async function runImport(sourceCode: string) { /* call existing ImportSchemaService */ }` — do not refactor the import pipeline, just call into it.

**Step 2: `importSchedules.ts` route**

```typescript
import { Router } from 'express'
import Joi from 'joi'
import cron from 'node-cron'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { registerJob, stopJob } from '../services/importScheduler.js'

const router = Router()
const schema = Joi.object({
  sourceId: Joi.string().required(),
  cronExpr: Joi.string().required(),
  isEnabled: Joi.boolean(),
})

router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const schedules = await prisma.importSchedule.findMany({ include: { source: { select: { code: true, name: true } } } })
    res.json(schedules)
  } catch (error) { next(error) }
})

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    if (!cron.validate(value.cronExpr)) return next(createError(400, 'Invalid cron expression'))
    const schedule = await prisma.importSchedule.create({ data: value })
    if (value.isEnabled !== false) {
      const src = await prisma.importSource.findUnique({ where: { id: value.sourceId }, select: { code: true } })
      if (src) registerJob(schedule.id, schedule.cronExpr, src.code)
    }
    res.status(201).json(schedule)
  } catch (error) { next(error) }
})

router.patch('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const schedule = await prisma.importSchedule.findUnique({ where: { id: req.params.id }, include: { source: true } })
    if (!schedule) return next(createError(404, 'Schedule not found'))
    const updated = await prisma.importSchedule.update({ where: { id: schedule.id }, data: req.body })
    if (updated.isEnabled) {
      registerJob(updated.id, updated.cronExpr, schedule.source.code)
    } else {
      stopJob(updated.id)
    }
    res.json(updated)
  } catch (error) { next(error) }
})

export default router
```

**Step 3: Register in `index.ts`**

```typescript
import importSchedulesRoutes from './routes/importSchedules.js'
import { startScheduledImports } from './services/importScheduler.js'

app.use('/api/import/schedules', importSchedulesRoutes)

if (process.env.NODE_ENV !== 'test') {
  startScheduledImports().catch(err =>
    logger.error('Failed to start import scheduler', { err })
  )
}
```

**Step 4: Run tests + TypeScript + commit**

```bash
cd backend && npx vitest run tests/importSchedules.test.ts
npx tsc --noEmit
git add -p
git commit -m "feat(import-schedule): scheduled recurring imports with node-cron and admin controls"
```

---

### Item 10: Resource Planning (Phase 2)

**Spec**
A resource inventory (OB vans, camera units, commentary teams, production staff) can be assigned to tech plans. The conflict detector warns when the same resource is double-booked across overlapping events.

**This item is explicitly scoped to:**
- Resource CRUD (name, type, capacity, isActive)
- Resource assignments to tech plans (resourceId, techPlanId, quantity, notes)
- Conflict check extension: warn when same resource is assigned to two tech plans whose events overlap
- A resource list panel in SportsWorkspace showing current assignments per resource

**Out of scope for this item:** venue availability, resource calendar view, resource cost tracking.

---

#### Task 10.1 — Schema

**Files:**
- Create: `backend/prisma/migrations/add_resources.sql`
- Modify: `backend/prisma/schema.prisma`

**Step 1: SQL**

```sql
-- backend/prisma/migrations/add_resources.sql
CREATE TABLE "Resource" (
  "id"        SERIAL PRIMARY KEY,
  "name"      TEXT NOT NULL UNIQUE,
  "type"      TEXT NOT NULL,    -- 'ob_van' | 'camera_unit' | 'commentary_team' | 'production_staff' | 'other'
  "capacity"  INT NOT NULL DEFAULT 1,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "notes"     TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "ResourceAssignment" (
  "id"          SERIAL PRIMARY KEY,
  "resourceId"  INT NOT NULL REFERENCES "Resource"("id") ON DELETE CASCADE,
  "techPlanId"  INT NOT NULL REFERENCES "TechPlan"("id") ON DELETE CASCADE,
  "quantity"    INT NOT NULL DEFAULT 1,
  "notes"       TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("resourceId", "techPlanId")
);
CREATE INDEX "ResourceAssignment_techPlanId_idx" ON "ResourceAssignment"("techPlanId");
CREATE INDEX "ResourceAssignment_resourceId_idx" ON "ResourceAssignment"("resourceId");
```

**Step 2: Prisma models**

```prisma
model Resource {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  type        String
  capacity    Int      @default(1)
  isActive    Boolean  @default(true)
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  assignments ResourceAssignment[]
}

model ResourceAssignment {
  id          Int      @id @default(autoincrement())
  resourceId  Int
  techPlanId  Int
  quantity    Int      @default(1)
  notes       String?
  createdAt   DateTime @default(now())

  resource    Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  techPlan    TechPlan @relation(fields: [techPlanId], references: [id], onDelete: Cascade)

  @@unique([resourceId, techPlanId])
  @@index([techPlanId])
  @@index([resourceId])
}
```

Add `assignments ResourceAssignment[]` to the `TechPlan` model.

**Step 3: Regenerate + commit schema**

```bash
cd backend && npx prisma generate
git add backend/prisma/
git commit -m "chore(resources): add Resource and ResourceAssignment tables"
```

---

#### Task 10.2 — Resource API (CRUD + assignments)

**Files:**
- Create: `backend/src/routes/resources.ts`
- Create: `backend/tests/resources.test.ts`
- Modify: `backend/src/index.ts`

**Step 1: Write failing test**

```typescript
// backend/tests/resources.test.ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: { resource: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() }, resourceAssignment: { create: vi.fn(), delete: vi.fn(), findMany: vi.fn() } }
}))
vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (_: unknown, __: unknown, next: () => void) => next(),
  authorize: () => (_: unknown, __: unknown, next: () => void) => next(),
}))

const mock = (prisma as unknown as { resource: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }).resource

describe('GET /api/resources', () => {
  it('returns list', async () => {
    mock.findMany.mockResolvedValue([{ id: 1, name: 'OB Van 1', type: 'ob_van', capacity: 1 }])
    const res = await request(app).get('/api/resources')
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('OB Van 1')
  })
})
```

**Step 2: Implement route**

```typescript
// backend/src/routes/resources.ts
import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()
const resourceSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().valid('ob_van', 'camera_unit', 'commentary_team', 'production_staff', 'other').required(),
  capacity: Joi.number().integer().min(1).default(1),
  isActive: Joi.boolean(),
  notes: Joi.string().allow(''),
})

router.get('/', authenticate, async (req, res, next) => {
  try {
    const resources = await prisma.resource.findMany({ orderBy: { name: 'asc' } })
    res.json(resources)
  } catch (error) { next(error) }
})

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = resourceSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const resource = await prisma.resource.create({ data: value })
    res.status(201).json(resource)
  } catch (error) { next(error) }
})

router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.resource.findUnique({ where: { id } })
    if (!existing) return next(createError(404, 'Resource not found'))
    const { error, value } = resourceSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const resource = await prisma.resource.update({ where: { id }, data: value })
    res.json(resource)
  } catch (error) { next(error) }
})

// Assignments
router.get('/:id/assignments', authenticate, async (req, res, next) => {
  try {
    const assignments = await prisma.resourceAssignment.findMany({
      where: { resourceId: Number(req.params.id) },
      include: { techPlan: { include: { event: true } } },
    })
    res.json(assignments)
  } catch (error) { next(error) }
})

router.post('/:id/assign', authenticate, authorize('sports', 'admin'), async (req, res, next) => {
  try {
    const { techPlanId, quantity, notes } = req.body
    if (!techPlanId) return next(createError(400, 'techPlanId required'))
    const assignment = await prisma.resourceAssignment.create({
      data: { resourceId: Number(req.params.id), techPlanId: Number(techPlanId), quantity: quantity ?? 1, notes },
    })
    res.status(201).json(assignment)
  } catch (error) { next(error) }
})

router.delete('/:id/assign/:techPlanId', authenticate, authorize('sports', 'admin'), async (req, res, next) => {
  try {
    await prisma.resourceAssignment.delete({
      where: { resourceId_techPlanId: { resourceId: Number(req.params.id), techPlanId: Number(req.params.techPlanId) } },
    })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
```

Register in `index.ts`:
```typescript
import resourcesRoutes from './routes/resources.js'
app.use('/api/resources', resourcesRoutes)
```

**Step 3: Extend conflict detection with resource double-booking warning**

In `backend/src/services/conflictService.ts`, after the missing tech plan check, add:

```typescript
  // 5. Resource double-booking
  if (draft.id) {
    const assignments = await prisma.resourceAssignment.findMany({
      where: { techPlan: { eventId: draft.id } },
      include: { resource: true },
    })
    for (const a of assignments) {
      const overlapping = await prisma.resourceAssignment.findFirst({
        where: {
          resourceId: a.resourceId,
          techPlan: {
            eventId: { not: draft.id },
            event: {
              startDateBE: { gte: dayStart, lte: dayEnd },
            },
          },
        },
      })
      if (overlapping) {
        warnings.push({
          type: 'channel_overlap', // reuse type or extend to 'resource_conflict'
          message: `Resource "${a.resource.name}" is also assigned to another event on this day`,
        })
      }
    }
  }
```

> Note: extend `ConflictWarning.type` to include `'resource_conflict'` and update the frontend display accordingly.

**Step 4: Run tests + TypeScript check + commit**

```bash
cd backend && npx vitest run tests/resources.test.ts
npx tsc --noEmit
git add -p
git commit -m "feat(resources): resource inventory, assignments API, resource conflict detection"
```

---

## Tech Debt Notes

*Fill in after each item is completed. Example format:*

```
### Item 1 (event-status)
- [ ] `status` column defaults to `draft` — nullable constraint may be relaxed once backfill is confirmed
- [ ] Transition rules are a static const; if rules ever become data-driven, extract to DB table

### Item 2 (conflicts)
- [ ] Rights check only covers linear/max/radio by presence of any valid contract — does not yet check geo restrictions

### Item 3 (audit)
- [ ] Restore is fire-and-forget for related data (e.g. restoring an event does not restore its CustomFieldValues)
```

---

*Plan complete.*
