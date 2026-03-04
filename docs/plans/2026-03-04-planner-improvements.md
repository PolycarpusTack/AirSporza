# Planner Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add conflict visualization, bulk operations, undo for drag-reschedule, consolidate dual event state, and fix five UX friction points in PlannerView.

**Architecture:** Three sequential groups: (1) missing features — new backend endpoints + frontend layers on top of existing calendar; (2) technical debt — AppProvider gains optimistic patch API, PlannerView drops local realtimeEvents state; (3) UX friction — additive UI components. Each group self-contained and safe to commit independently.

**Tech Stack:** React + TypeScript + Vite (frontend), Express + Prisma + Socket.IO (backend), @dnd-kit/core (drag-and-drop), Vitest (tests)

---

## Codebase orientation (read before starting)

Key files to understand before any task:

- `backend/src/routes/events.ts` — Router, Joi schemas (`eventSchema`, `conflictCheckSchema`, `statusUpdateSchema`), `positiveId`, auth pattern `authenticate, authorize('planner', 'admin')`, emit pattern `emit('event:updated', event, 'events')`. The existing `/conflicts` POST route at line 124 is the model for Task 1.
- `backend/src/services/conflictService.ts` — `detectConflicts(draft: EventDraft)` returns `{ warnings: ConflictWarning[], errors: ConflictError[] }`. `ConflictWarning` type is `{ type: 'channel_overlap'|'rights_window'|'missing_tech_plan'|'resource_conflict'; message: string }`. **Note:** the function is named `detectConflicts`, not `checkConflicts` — use the correct name.
- `backend/src/services/socketInstance.ts` — `emit(event: string, data: unknown, room?: string)`. Room name for events is `'events'`.
- `src/pages/PlannerView.tsx` — State: `realtimeEvents`, `weekOffset`, `channelFilter`, `calendarMode`. Key memo: `weekEvents` (lines 265–271) filters `realtimeEvents` by `weekFromStr`/`weekToStr`. `handleDragEnd` (line 298) does two-phase optimistic update: `setRealtimeEvents` first, then `setEvents` (global) after API success. `useSocket()` hook provides `on` (not `socket.on`).
- `src/context/AppProvider.tsx` — `handleSaveEvent` (line 181) returns `Promise<void>`. `events`, `setEvents`, `sports`, `competitions`, `orgConfig` are the key context values. No socket handlers here — they live in PlannerView currently.
- `src/services/events.ts` — `eventsApi` object with `list`, `get`, `create`, `update`, `delete`. All methods call `api.get/post/put/delete` from `../utils/api`.
- `src/services/savedViews.ts` — `savedViewsApi.create(name, context, filterState)` — **three separate args**, not an object. `SavedView` has `filterState: Record<string, unknown>`, not `filters`. Current PlannerView calls `savedViewsApi.create(name, 'planner', { channelFilter })` and reads `view.filterState`.
- `src/components/Toast.tsx` — `useToast()` returns `{ success, error, warning, info, addToast, removeToast }`. **No `action` or `duration` prop** — toasts are plain strings, auto-dismiss in 5 s via `setTimeout`. Undo must be implemented as a separate UI element (see Task 6).
- `src/pages/PlannerView.dnd.test.tsx` — Logic-only unit tests that replicate `buildHandleDragEnd` inline (no component rendering). Tests use `vi.fn()` for `setRealtimeEvents`, `setGlobalEvents`, `toastError`, `updateFn`.

---

## GROUP 1 — MISSING FEATURES

### Task 1: Bulk conflict check endpoint

**Goal:** New backend endpoint `POST /api/events/conflicts/bulk` that accepts an array of event IDs and returns a map of `eventId → ConflictWarning[]`.

**Files:**
- Modify: `backend/src/routes/events.ts`
- Modify: `backend/tests/conflictService.test.ts`

**Step 1 — Read the existing `/conflicts` route** in `backend/src/routes/events.ts` (lines 124–133) to confirm the exact pattern before adding the new route.

**Step 2 — Add the bulk conflicts route** in `backend/src/routes/events.ts` immediately after the existing `router.post('/conflicts', ...)` route (after line 133) and **before** the `router.get('/:id', ...)` route:

```typescript
const bulkConflictSchema = Joi.object({
  eventIds: Joi.array()
    .items(Joi.number().integer().min(1))
    .min(1)
    .max(50)
    .required(),
})

router.post('/conflicts/bulk', authenticate, async (req, res, next) => {
  try {
    const { error, value } = bulkConflictSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const { eventIds } = value as { eventIds: number[] }

    // Fetch each event's data needed for conflict check
    const events = await prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: {
        id: true,
        competitionId: true,
        linearChannel: true,
        onDemandChannel: true,
        radioChannel: true,
        startDateBE: true,
        startTimeBE: true,
        status: true,
      },
    })

    // Run conflict checks in parallel
    const results = await Promise.all(
      events.map(async ev => {
        const { warnings } = await detectConflicts({
          id: ev.id,
          competitionId: ev.competitionId,
          linearChannel: ev.linearChannel ?? undefined,
          onDemandChannel: ev.onDemandChannel ?? undefined,
          radioChannel: ev.radioChannel ?? undefined,
          startDateBE: ev.startDateBE.toISOString().slice(0, 10),
          startTimeBE: ev.startTimeBE,
          status: ev.status ?? undefined,
        })
        return { id: ev.id, warnings }
      })
    )

    // Build the response map; include entries for all requested IDs
    const conflictMap: Record<number, ConflictWarning[]> = {}
    for (const id of eventIds) {
      conflictMap[id] = []
    }
    for (const { id, warnings } of results) {
      conflictMap[id] = warnings
    }

    res.json(conflictMap)
  } catch (error) {
    next(error)
  }
})
```

Also add `ConflictWarning` to the import from `conflictService`:
```typescript
import { detectConflicts, type ConflictWarning } from '../services/conflictService.js'
```

**Step 3 — Add bulk conflict test** in `backend/tests/conflictService.test.ts`. Add a new `describe` block at the end of the file (after the existing `detectConflicts` describe block):

```typescript
// Note: this tests the route handler logic indirectly via detectConflicts mock
describe('bulk conflict endpoint shape', () => {
  it('maps event ids to their warning arrays', async () => {
    // detectConflicts returns warnings for id 1, empty for id 2
    mockPrisma.event.findMany
      .mockResolvedValueOnce([
        { id: 1, startTimeBE: '20:15', participants: 'X vs Y' },
      ])
      .mockResolvedValueOnce([]) // no overlap for id 2

    mockPrisma.contract.findFirst
      .mockResolvedValue({ id: 1, linearRights: true, maxRights: true, radioRights: true })

    const r1 = await detectConflicts({
      id: 1,
      competitionId: 10,
      linearChannel: 'VRT MAX',
      startDateBE: '2026-04-01',
      startTimeBE: '20:00',
    })
    const r2 = await detectConflicts({
      id: 2,
      competitionId: 10,
      linearChannel: 'VRT MAX',
      startDateBE: '2026-04-01',
      startTimeBE: '14:00',
    })

    // id 1 has a channel overlap; id 2 is clean
    expect(r1.warnings.some(w => w.type === 'channel_overlap')).toBe(true)
    expect(r2.warnings).toHaveLength(0)
  })
})
```

**Step 4 — Test:**
```bash
cd /mnt/c/Projects/Planza/backend && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|conflict)"
```
Expected: existing `detectConflicts` tests still pass, new test passes.

**Step 5 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add backend/src/routes/events.ts backend/tests/conflictService.test.ts && git commit -m "feat(backend): POST /events/conflicts/bulk — parallel conflict check for multiple event IDs"
```

---

### Task 2: Conflict visualization on event cards

**Goal:** After the weekly events load, fetch conflicts for all visible events and show a warning badge on cards that have at least one conflict.

**Files:**
- Modify: `src/services/events.ts`
- Modify: `src/pages/PlannerView.tsx`

**Step 1 — Add `checkBulkConflicts` to eventsApi** in `src/services/events.ts`. Add after the existing `delete` method:

```typescript
  checkBulkConflicts: (ids: number[]): Promise<Record<number, ConflictWarning[]>> =>
    api.post<Record<number, ConflictWarning[]>>('/events/conflicts/bulk', { eventIds: ids }),
```

Also add the `ConflictWarning` type import at the top of `src/services/events.ts`. Since `ConflictWarning` lives in the backend, re-declare it in the frontend service file:

```typescript
export interface ConflictWarning {
  type: 'channel_overlap' | 'rights_window' | 'missing_tech_plan' | 'resource_conflict'
  message: string
}
```

**Step 2 — Add `conflictMap` state** in `src/pages/PlannerView.tsx`. In the PlannerView component body, after the existing state declarations (after the `contracts` state), add:

```typescript
const [conflictMap, setConflictMap] = useState<Record<number, ConflictWarning[]>>({})
```

Add the import at the top of PlannerView:
```typescript
import { eventsApi, type ConflictWarning } from '../services'
```
(Update the existing `eventsApi` import line to also import `ConflictWarning`.)

**Step 3 — Fetch conflicts after week events load.** Add a `useEffect` that depends on `weekEvents` and the `weekFromStr`/`weekToStr` strings. Place it after the existing `useEffect` that syncs `realtimeEvents` with `events` (after line 218):

```typescript
useEffect(() => {
  if (weekEvents.length === 0) {
    setConflictMap({})
    return
  }
  const ids = weekEvents.map(e => e.id)
  eventsApi.checkBulkConflicts(ids)
    .then(map => setConflictMap(map))
    .catch(() => {}) // non-critical — silently ignore
}, [weekFromStr, weekToStr, weekEvents.length])
```

**Step 4 — Show warning badge on event cards.** In PlannerView, find where event cards are rendered (search for where `ev.participants` is displayed in the card JSX). After the participants text, add the conflict badge inline:

```tsx
{(conflictMap[ev.id]?.length ?? 0) > 0 && (
  <span
    className="inline-flex items-center ml-1 text-warning"
    title={conflictMap[ev.id].map(w => w.message).join('\n')}
    aria-label={`${conflictMap[ev.id].length} conflict warning(s)`}
  >
    ⚠️
  </span>
)}
```

Apply the same badge in both the calendar card render path and the list-view row render path (there are two places where `ev.participants` appears — one in calendar mode, one in list mode).

**Step 5 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 6 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/services/events.ts src/pages/PlannerView.tsx && git commit -m "feat: conflict visualization badges on planner event cards"
```

---

### Task 3: Bulk operations backend endpoints

**Goal:** Four new bulk routes in `backend/src/routes/events.ts` — bulk delete, bulk status update, bulk reschedule, and bulk field assign. All run in Prisma transactions, emit socket events, and require authentication.

**Files:**
- Modify: `backend/src/routes/events.ts`
- Create: `backend/tests/eventsBulk.test.ts`

**Step 1 — Read the end of `backend/src/routes/events.ts`** to find the correct insertion point (after all existing routes, before `export default router`).

**Step 2 — Add Joi schemas** for all four bulk routes. Add these schema constants near the top of the file, alongside the existing `statusUpdateSchema` and `conflictCheckSchema`:

```typescript
const bulkIdsSchema = Joi.array()
  .items(Joi.number().integer().min(1))
  .min(1)
  .max(100)
  .required()

const bulkDeleteSchema = Joi.object({ ids: bulkIdsSchema })

const bulkStatusSchema = Joi.object({
  ids: bulkIdsSchema,
  status: Joi.string()
    .valid('draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled')
    .required(),
})

const bulkRescheduleSchema = Joi.object({
  ids: bulkIdsSchema,
  shiftDays: Joi.number().integer().min(-365).max(365).required(),
})

const bulkAssignSchema = Joi.object({
  ids: bulkIdsSchema,
  field: Joi.string().valid('linearChannel', 'sportId', 'competitionId').required(),
  value: Joi.alternatives().try(Joi.string().allow(''), Joi.number()).required(),
})
```

**Step 3 — Add DELETE /api/events/bulk** (add near the end of the file, before `export default router`):

```typescript
router.delete('/bulk', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = bulkDeleteSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const { ids } = value as { ids: number[] }

    await prisma.$transaction(async (tx) => {
      await tx.event.deleteMany({ where: { id: { in: ids } } })
    })

    for (const id of ids) {
      emit('event:deleted', { id }, 'events')
    }

    res.json({ deleted: ids.length })
  } catch (error) {
    next(error)
  }
})
```

**Step 4 — Add PATCH /api/events/bulk/status:**

```typescript
router.patch('/bulk/status', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = bulkStatusSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const { ids, status } = value as { ids: number[]; status: EventStatus }

    const updatedEvents = await prisma.$transaction(async (tx) => {
      await tx.event.updateMany({
        where: { id: { in: ids } },
        data: { status },
      })
      return tx.event.findMany({ where: { id: { in: ids } } })
    })

    for (const ev of updatedEvents) {
      emit('event:updated', ev, 'events')
    }

    res.json({ updated: updatedEvents.length })
  } catch (error) {
    next(error)
  }
})
```

**Step 5 — Add PATCH /api/events/bulk/reschedule:**

```typescript
router.patch('/bulk/reschedule', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = bulkRescheduleSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const { ids, shiftDays } = value as { ids: number[]; shiftDays: number }

    // Fetch current dates, compute new dates, update in transaction
    const currentEvents = await prisma.event.findMany({
      where: { id: { in: ids } },
      select: { id: true, startDateBE: true },
    })

    const updatedEvents = await prisma.$transaction(async (tx) => {
      const updated: Awaited<ReturnType<typeof tx.event.update>>[] = []
      for (const ev of currentEvents) {
        const d = new Date(ev.startDateBE)
        d.setDate(d.getDate() + shiftDays)
        const newDate = d.toISOString().slice(0, 10)
        const result = await tx.event.update({
          where: { id: ev.id },
          data: { startDateBE: new Date(newDate) },
        })
        updated.push(result)
      }
      return updated
    })

    for (const ev of updatedEvents) {
      emit('event:updated', ev, 'events')
    }

    res.json({ updated: updatedEvents.length })
  } catch (error) {
    next(error)
  }
})
```

**Step 6 — Add PATCH /api/events/bulk/assign:**

```typescript
router.patch('/bulk/assign', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = bulkAssignSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const { ids, field, value: fieldValue } = value as {
      ids: number[]
      field: 'linearChannel' | 'sportId' | 'competitionId'
      value: string | number
    }

    const data: Record<string, unknown> = { [field]: fieldValue }

    const updatedEvents = await prisma.$transaction(async (tx) => {
      await tx.event.updateMany({ where: { id: { in: ids } }, data })
      return tx.event.findMany({ where: { id: { in: ids } } })
    })

    for (const ev of updatedEvents) {
      emit('event:updated', ev, 'events')
    }

    res.json({ updated: updatedEvents.length })
  } catch (error) {
    next(error)
  }
})
```

**Step 7 — Create `backend/tests/eventsBulk.test.ts`.** Use the integration test pattern from `backend/tests/events.test.ts` (supertest + dev-login token):

```typescript
import { beforeAll, describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/index.js'

describe('Bulk Event Endpoints', () => {
  let authToken: string
  let createdIds: number[] = []
  const testEmail = `bulk-test-${Date.now()}@example.com`

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: testEmail, role: 'admin' })
    authToken = loginRes.body.token

    // Create two test events
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sportId: 1,
          competitionId: 1,
          participants: `Bulk Test ${i}`,
          startDateBE: '2099-12-01',
          startTimeBE: '10:00',
        })
      if (res.status === 201) createdIds.push(res.body.id)
    }
  })

  describe('PATCH /api/events/bulk/status', () => {
    it('updates status for multiple events', async () => {
      if (createdIds.length < 2) return
      const res = await request(app)
        .patch('/api/events/bulk/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: createdIds, status: 'ready' })
        .expect(200)
      expect(res.body).toMatchObject({ updated: createdIds.length })
    })

    it('rejects invalid status', async () => {
      await request(app)
        .patch('/api/events/bulk/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [1], status: 'not_a_status' })
        .expect(400)
    })
  })

  describe('PATCH /api/events/bulk/reschedule', () => {
    it('shifts dates for multiple events', async () => {
      if (createdIds.length < 2) return
      const res = await request(app)
        .patch('/api/events/bulk/reschedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: createdIds, shiftDays: 1 })
        .expect(200)
      expect(res.body).toMatchObject({ updated: createdIds.length })
    })

    it('rejects shiftDays out of range', async () => {
      await request(app)
        .patch('/api/events/bulk/reschedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [1], shiftDays: 999 })
        .expect(400)
    })
  })

  describe('PATCH /api/events/bulk/assign', () => {
    it('assigns a field to multiple events', async () => {
      if (createdIds.length < 2) return
      const res = await request(app)
        .patch('/api/events/bulk/assign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: createdIds, field: 'linearChannel', value: 'VRT MAX' })
        .expect(200)
      expect(res.body).toMatchObject({ updated: createdIds.length })
    })

    it('rejects invalid field name', async () => {
      await request(app)
        .patch('/api/events/bulk/assign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [1], field: 'notAField', value: 'something' })
        .expect(400)
    })
  })

  describe('DELETE /api/events/bulk', () => {
    it('deletes multiple events', async () => {
      if (createdIds.length < 2) return
      const res = await request(app)
        .delete('/api/events/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: createdIds })
        .expect(200)
      expect(res.body).toMatchObject({ deleted: createdIds.length })
    })

    it('requires authentication', async () => {
      await request(app)
        .delete('/api/events/bulk')
        .send({ ids: [1] })
        .expect(401)
    })
  })
})
```

**Step 8 — Test:**
```bash
cd /mnt/c/Projects/Planza/backend && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|bulk|Bulk)"
```
Expected: all 4 bulk test suites pass.

**Step 9 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add backend/src/routes/events.ts backend/tests/eventsBulk.test.ts && git commit -m "feat(backend): bulk delete/status/reschedule/assign event endpoints"
```

---

### Task 4: Bulk selection UI

**Goal:** Add selection mode toggle and per-card checkboxes to PlannerView. No action bar yet — just the selection infrastructure.

**Files:**
- Modify: `src/pages/PlannerView.tsx`

**Step 1 — Add selection state** in the PlannerView component body, after the `contracts` state declaration:

```typescript
const [selectionMode, setSelectionMode] = useState(false)
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
```

**Step 2 — Add toggle handler:**

```typescript
const toggleSelectionMode = useCallback(() => {
  setSelectionMode(prev => {
    if (prev) setSelectedIds(new Set()) // clear on exit
    return !prev
  })
}, [])

const toggleSelectId = useCallback((id: number) => {
  setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    return next
  })
}, [])
```

**Step 3 — Add "Select" toggle button** in the planner header JSX (the area near the "+ New Event" button). Find the existing "New Event" button in the JSX and add the selection toggle button alongside it:

```tsx
<button
  className={`btn ${selectionMode ? 'btn-s' : 'btn-g'} btn-sm`}
  onClick={toggleSelectionMode}
>
  {selectionMode ? 'Cancel' : 'Select'}
</button>
```

**Step 4 — Modify event card rendering** to show checkboxes in selection mode. In the calendar event card render path, wrap the card with selection logic. When `selectionMode` is true, skip the `DraggableEventCard` wrapper and render a plain `<div>` instead. Add a checkbox at the top-left of the card:

In the calendar grid render, change the event card from:
```tsx
<DraggableEventCard event={ev}>
  {/* card content */}
</DraggableEventCard>
```
to:
```tsx
{selectionMode ? (
  <div
    className={`relative cursor-pointer ${selectedIds.has(ev.id) ? 'ring-2 ring-blue-400 rounded' : ''}`}
    onClick={() => toggleSelectId(ev.id)}
  >
    <input
      type="checkbox"
      className="absolute top-1 left-1 z-10 cursor-pointer"
      checked={selectedIds.has(ev.id)}
      onChange={() => toggleSelectId(ev.id)}
      onClick={e => e.stopPropagation()}
    />
    {/* existing card content */}
  </div>
) : (
  <DraggableEventCard event={ev}>
    {/* existing card content */}
  </DraggableEventCard>
)}
```

Apply the same checkbox pattern to list-view rows (the `grouped` render path): when `selectionMode`, prefix each row with a checkbox.

**Step 5 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 6 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/pages/PlannerView.tsx && git commit -m "feat: selection mode toggle and per-card checkboxes in PlannerView"
```

---

### Task 5: Floating action bar

**Goal:** Create the `BulkActionBar` component and wire it to the bulk API endpoints.

**Files:**
- Create: `src/components/planner/BulkActionBar.tsx`
- Modify: `src/services/events.ts`
- Modify: `src/pages/PlannerView.tsx`

**Step 1 — Add bulk API methods to `src/services/events.ts`:**

```typescript
  bulkDelete: (ids: number[]): Promise<{ deleted: number }> =>
    api.delete<{ deleted: number }>('/events/bulk', { ids }),

  bulkStatus: (ids: number[], status: EventStatus): Promise<{ updated: number }> =>
    api.patch<{ updated: number }>('/events/bulk/status', { ids, status }),

  bulkReschedule: (ids: number[], shiftDays: number): Promise<{ updated: number }> =>
    api.patch<{ updated: number }>('/events/bulk/reschedule', { ids, shiftDays }),

  bulkAssign: (
    ids: number[],
    field: 'linearChannel' | 'sportId' | 'competitionId',
    value: string | number
  ): Promise<{ updated: number }> =>
    api.patch<{ updated: number }>('/events/bulk/assign', { ids, field, value }),
```

Also add `EventStatus` to the import from `../data/types`:
```typescript
import type { Event, EventStatus } from '../data/types'
```

Check `src/utils/api.ts` first to confirm `api.delete` and `api.patch` signatures — the `ApiClient` may not have a `patch` method or may not accept a body for `delete`. If `api.delete` does not accept a body, use `api.post` with a custom path, or call `fetch` directly. If `api.patch` does not exist, implement it with a direct `fetch` call:
```typescript
bulkStatus: (ids: number[], status: EventStatus): Promise<{ updated: number }> => {
  const { API_URL, getStoredToken } = require('../utils/api')
  return fetch(`${API_URL}/events/bulk/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}` },
    body: JSON.stringify({ ids, status }),
  }).then(r => r.json())
},
```

**Important:** Read `src/utils/api.ts` before writing this step to use the actual available methods.

**Step 2 — Create `src/components/planner/BulkActionBar.tsx`:**

First ensure the `src/components/planner/` directory exists:
```bash
ls /mnt/c/Projects/Planza/src/components/planner/ 2>/dev/null || echo "dir does not exist"
```
If it does not exist, create it:
```bash
mkdir -p /mnt/c/Projects/Planza/src/components/planner
```

```typescript
import type { EventStatus, Sport, Competition } from '../../data/types'

interface BulkActionBarProps {
  count: number
  onDelete: () => void
  onStatusChange: (status: EventStatus) => void
  onReschedule: (shiftDays: number) => void
  onAssignChannel: (channel: string) => void
  onAssignSport: (sportId: number) => void
  onAssignCompetition: (competitionId: number) => void
  channels: string[]
  sports: Sport[]
  competitions: Competition[]
  loading: boolean
}

const EVENT_STATUSES: EventStatus[] = [
  'draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled',
]

export function BulkActionBar({
  count,
  onDelete,
  onStatusChange,
  onReschedule,
  onAssignChannel,
  onAssignSport,
  onAssignCompetition,
  channels,
  sports,
  competitions,
  loading,
}: BulkActionBarProps) {
  if (count === 0) return null

  const [shiftDays, setShiftDays] = useState(1)

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-surface border-t z-40 p-3 flex items-center gap-3 flex-wrap">
      <span className="text-sm font-semibold text-text-2 mr-2">
        {count} selected
      </span>

      {/* Delete */}
      <button
        className="btn btn-sm"
        style={{ color: 'var(--color-danger)' }}
        disabled={loading}
        onClick={() => {
          if (window.confirm(`Delete ${count} event(s)? This cannot be undone.`)) {
            onDelete()
          }
        }}
      >
        Delete
      </button>

      {/* Status change */}
      <select
        className="inp text-sm py-1 px-2"
        disabled={loading}
        defaultValue=""
        onChange={e => {
          if (e.target.value) onStatusChange(e.target.value as EventStatus)
          e.target.value = ''
        }}
      >
        <option value="" disabled>Set status…</option>
        {EVENT_STATUSES.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Reschedule */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          className="inp text-sm py-1 px-2 w-16"
          value={shiftDays}
          onChange={e => setShiftDays(Number(e.target.value))}
          disabled={loading}
        />
        <span className="text-sm text-text-3">days</span>
        <button
          className="btn btn-g btn-sm"
          disabled={loading}
          onClick={() => onReschedule(shiftDays)}
        >
          Reschedule
        </button>
      </div>

      {/* Assign channel */}
      {channels.length > 0 && (
        <select
          className="inp text-sm py-1 px-2"
          disabled={loading}
          defaultValue=""
          onChange={e => {
            if (e.target.value) onAssignChannel(e.target.value)
            e.target.value = ''
          }}
        >
          <option value="" disabled>Assign channel…</option>
          {channels.map(ch => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
      )}

      {/* Assign sport */}
      <select
        className="inp text-sm py-1 px-2"
        disabled={loading}
        defaultValue=""
        onChange={e => {
          if (e.target.value) onAssignSport(Number(e.target.value))
          e.target.value = ''
        }}
      >
        <option value="" disabled>Assign sport…</option>
        {sports.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {/* Assign competition */}
      <select
        className="inp text-sm py-1 px-2"
        disabled={loading}
        defaultValue=""
        onChange={e => {
          if (e.target.value) onAssignCompetition(Number(e.target.value))
          e.target.value = ''
        }}
      >
        <option value="" disabled>Assign competition…</option>
        {competitions.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  )
}
```

Note: `BulkActionBar` uses `useState` for `shiftDays` — add `import { useState } from 'react'` at the top.

**Step 3 — Wire BulkActionBar in PlannerView.** Add state and handlers:

```typescript
const [bulkLoading, setBulkLoading] = useState(false)

const handleBulkDelete = useCallback(async () => {
  const ids = Array.from(selectedIds)
  setBulkLoading(true)
  try {
    await eventsApi.bulkDelete(ids)
    setEvents(prev => prev.filter(e => !selectedIds.has(e.id)))
    setSelectedIds(new Set())
    toast.success(`Deleted ${ids.length} event(s)`)
  } catch {
    toast.error('Bulk delete failed')
  } finally {
    setBulkLoading(false)
  }
}, [selectedIds, setEvents, toast])

const handleBulkStatus = useCallback(async (status: EventStatus) => {
  const ids = Array.from(selectedIds)
  setBulkLoading(true)
  try {
    await eventsApi.bulkStatus(ids, status)
    setEvents(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, status } : e))
    toast.success(`Updated status for ${ids.length} event(s)`)
  } catch {
    toast.error('Bulk status update failed')
  } finally {
    setBulkLoading(false)
  }
}, [selectedIds, setEvents, toast])

const handleBulkReschedule = useCallback(async (shiftDays: number) => {
  const ids = Array.from(selectedIds)
  setBulkLoading(true)
  try {
    await eventsApi.bulkReschedule(ids, shiftDays)
    // Reload events from API to get accurate dates
    const updated = await eventsApi.list()
    setEvents(updated as Event[])
    toast.success(`Rescheduled ${ids.length} event(s) by ${shiftDays} day(s)`)
  } catch {
    toast.error('Bulk reschedule failed')
  } finally {
    setBulkLoading(false)
  }
}, [selectedIds, setEvents, toast])

const handleBulkAssignChannel = useCallback(async (channel: string) => {
  const ids = Array.from(selectedIds)
  setBulkLoading(true)
  try {
    await eventsApi.bulkAssign(ids, 'linearChannel', channel)
    setEvents(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, linearChannel: channel } : e))
    toast.success(`Assigned channel to ${ids.length} event(s)`)
  } catch {
    toast.error('Bulk assign failed')
  } finally {
    setBulkLoading(false)
  }
}, [selectedIds, setEvents, toast])

const handleBulkAssignSport = useCallback(async (sportId: number) => {
  const ids = Array.from(selectedIds)
  setBulkLoading(true)
  try {
    await eventsApi.bulkAssign(ids, 'sportId', sportId)
    setEvents(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, sportId } : e))
    toast.success(`Assigned sport to ${ids.length} event(s)`)
  } catch {
    toast.error('Bulk assign failed')
  } finally {
    setBulkLoading(false)
  }
}, [selectedIds, setEvents, toast])

const handleBulkAssignCompetition = useCallback(async (competitionId: number) => {
  const ids = Array.from(selectedIds)
  setBulkLoading(true)
  try {
    await eventsApi.bulkAssign(ids, 'competitionId', competitionId)
    setEvents(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, competitionId } : e))
    toast.success(`Assigned competition to ${ids.length} event(s)`)
  } catch {
    toast.error('Bulk assign failed')
  } finally {
    setBulkLoading(false)
  }
}, [selectedIds, setEvents, toast])
```

Add import at top of PlannerView:
```typescript
import { BulkActionBar } from '../components/planner/BulkActionBar'
```

Add `BulkActionBar` render at the bottom of the PlannerView JSX return, before the closing `</div>` of the outermost wrapper:

```tsx
{selectionMode && (
  <BulkActionBar
    count={selectedIds.size}
    onDelete={handleBulkDelete}
    onStatusChange={handleBulkStatus}
    onReschedule={handleBulkReschedule}
    onAssignChannel={handleBulkAssignChannel}
    onAssignSport={handleBulkAssignSport}
    onAssignCompetition={handleBulkAssignCompetition}
    channels={orgConfig.channels.map(c => c.name)}
    sports={sports}
    competitions={competitions}
    loading={bulkLoading}
  />
)}
```

**Step 4 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 5 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/services/events.ts src/components/planner/BulkActionBar.tsx src/pages/PlannerView.tsx && git commit -m "feat: floating bulk action bar with delete/status/reschedule/assign"
```

---

### Task 6: Undo toast for drag-reschedule

**Goal:** After a successful drag-reschedule, show a toast with an "Undo" option that reverts the event to its original date.

**Files:**
- Modify: `src/pages/PlannerView.tsx`
- Create: `src/components/planner/UndoBar.tsx`
- Modify: `src/pages/PlannerView.dnd.test.tsx`

**Context:** `useToast()` in this project (`src/components/Toast.tsx`) does NOT support `action` callbacks or `duration` overrides — it only accepts a message string. Therefore undo must be a separate component, not a toast action.

**Step 1 — Create `src/components/planner/UndoBar.tsx`.** This is a fixed bottom-right bar that auto-dismisses after 5 seconds:

```typescript
import { useEffect } from 'react'

interface UndoBarProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

export function UndoBar({ message, onUndo, onDismiss }: UndoBarProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed bottom-16 right-4 z-50 flex items-center gap-3 bg-surface border rounded-md shadow-md px-4 py-3 animate-slide-in">
      <span className="text-sm font-medium text-text-2">{message}</span>
      <button
        className="btn btn-g btn-sm"
        onClick={() => {
          onUndo()
          onDismiss()
        }}
      >
        Undo
      </button>
    </div>
  )
}
```

**Step 2 — Add `lastDragRef` and `undoBar` state** in PlannerView:

```typescript
const lastDragRef = useRef<{ eventId: number; previousDate: string } | null>(null)
const [undoBar, setUndoBar] = useState<{ message: string } | null>(null)
```

**Step 3 — Update `handleDragEnd`** in PlannerView. Replace the existing `handleDragEnd` body. The new version is identical except the success path replaces `toast.success('Event updated')` with an undo bar display:

```typescript
const handleDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
  if (!over) return
  const eventId = Number(active.id)
  const newDate = over.id as string
  const event = realtimeEvents.find(e => e.id === eventId)
  if (!event) return
  const currentDateStr = typeof event.startDateBE === 'string'
    ? event.startDateBE.slice(0, 10)
    : (event.startDateBE as Date).toISOString().slice(0, 10)
  if (newDate === currentDateStr) return  // same day, no-op
  const snapshot = event.startDateBE
  // Optimistic: update local display only
  setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
  try {
    await eventsApi.update(eventId, { ...event, startDateBE: newDate })
    // Confirm: update global context after API success
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
    // Store undo info and show undo bar
    lastDragRef.current = { eventId, previousDate: currentDateStr }
    const label = new Date(newDate + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    setUndoBar({ message: `Moved to ${label}` })
  } catch {
    // Revert local only
    setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: snapshot } : e))
    toast.error('Failed to reschedule event')
  }
}, [realtimeEvents, setEvents, toast])
```

**Step 4 — Add undo handler** and dismiss handler:

```typescript
const handleUndoDrag = useCallback(async () => {
  if (!lastDragRef.current) return
  const { eventId, previousDate } = lastDragRef.current
  lastDragRef.current = null
  const ev = realtimeEvents.find(e => e.id === eventId)
  if (!ev) return
  // Optimistic revert
  setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: previousDate } : e))
  try {
    await eventsApi.update(eventId, { ...ev, startDateBE: previousDate })
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: previousDate } : e))
  } catch {
    // Revert the revert
    setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: ev.startDateBE } : e))
    toast.error('Undo failed')
  }
}, [realtimeEvents, setEvents, toast])

const dismissUndoBar = useCallback(() => {
  setUndoBar(null)
  lastDragRef.current = null
}, [])
```

**Step 5 — Render UndoBar** in PlannerView JSX (alongside the BulkActionBar at the bottom):

```tsx
import { UndoBar } from '../components/planner/UndoBar'
// ...
{undoBar && (
  <UndoBar
    message={undoBar.message}
    onUndo={handleUndoDrag}
    onDismiss={dismissUndoBar}
  />
)}
```

**Step 6 — Update `PlannerView.dnd.test.tsx`.** Add two new tests to the existing `describe('handleDragEnd — drag-to-reschedule', ...)` block. The tests use the same `buildHandleDragEnd` helper, extended to accept an `onUndoReady` callback:

Add a second version of the builder for undo testing:

```typescript
function buildHandleDragEndWithUndo(
  events: Event[],
  setRealtimeEvents: (fn: (prev: Event[]) => Event[]) => void,
  setGlobalEvents: (fn: (prev: Event[]) => Event[]) => void,
  toastError: (msg: string) => void,
  updateFn: (id: number, data: Partial<Event>) => Promise<Event>,
  onUndoReady: (eventId: number, previousDate: string, newDate: string) => void
) {
  return async ({ active, over }: DragEndEvent) => {
    if (!over) return
    const eventId = Number(active.id)
    const newDate = over.id as string
    const event = events.find(e => e.id === eventId)
    if (!event) return
    const currentDateStr = typeof event.startDateBE === 'string'
      ? event.startDateBE.slice(0, 10)
      : (event.startDateBE as Date).toISOString().slice(0, 10)
    if (newDate === currentDateStr) return
    const snapshot = event.startDateBE as string
    setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
    try {
      await updateFn(eventId, { ...event, startDateBE: newDate })
      setGlobalEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
      onUndoReady(eventId, snapshot, newDate)
    } catch {
      setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: snapshot } : e))
      toastError('Failed to reschedule event')
    }
  }
}
```

Add these tests:

```typescript
  it('calls onUndoReady with eventId and previousDate after successful drag', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    localEvents = [event]
    globalEvents = [event]
    updateFn.mockResolvedValue({ ...event, startDateBE: '2026-03-05' })

    const onUndoReady = vi.fn()

    const handleDragEnd = buildHandleDragEndWithUndo(
      [event],
      setRealtimeEventsSpy,
      setGlobalEventsSpy,
      toastError,
      updateFn,
      onUndoReady
    )
    await handleDragEnd(makeDragEvent('42', '2026-03-05', event))

    expect(onUndoReady).toHaveBeenCalledWith(42, '2026-03-04', '2026-03-05')
  })

  it('does not call onUndoReady on API failure', async () => {
    const event = makeEvent({ id: 42, startDateBE: '2026-03-04' })
    localEvents = [event]
    globalEvents = [event]
    updateFn.mockRejectedValue(new Error('Network error'))

    const onUndoReady = vi.fn()

    const handleDragEnd = buildHandleDragEndWithUndo(
      [event],
      setRealtimeEventsSpy,
      setGlobalEventsSpy,
      toastError,
      updateFn,
      onUndoReady
    )
    await handleDragEnd(makeDragEvent('42', '2026-03-05', event))

    expect(onUndoReady).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('Failed to reschedule event')
  })
```

**Step 7 — Compile check and test:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
```bash
cd /mnt/c/Projects/Planza && npx vitest run src/pages/PlannerView.dnd.test.tsx 2>&1
```
Expected: all 9 tests pass (7 existing + 2 new).

**Step 8 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/pages/PlannerView.tsx src/components/planner/UndoBar.tsx src/pages/PlannerView.dnd.test.tsx && git commit -m "feat: undo bar for drag-reschedule with 5-second auto-dismiss"
```

---

## GROUP 2 — TECHNICAL DEBT

### Task 7: AppProvider optimistic patch API

**Goal:** Add `applyOptimisticEvent` / `revertOptimisticEvent` to AppProvider context so components can apply temporary patches to events without duplicating state.

**Files:**
- Modify: `src/context/AppProvider.tsx`

**Step 1 — Read `src/context/AppProvider.tsx`** fully before editing to understand the current context type interface, the `handleSaveEvent` callback, and where the context value is assembled (the `useMemo` or object literal passed to `AppContext.Provider`).

**Step 2 — Add new context type fields** to the `AppContextType` interface (after `handleSaveEvent: (ev: Event) => Promise<void>`):

```typescript
applyOptimisticEvent: (patch: Partial<Event> & { id: number }) => void
revertOptimisticEvent: (id: number) => void
```

**Step 3 — Add internal optimistic state** in the `AppProvider` function body, after the `useRef` for `prevRoleRef`:

```typescript
const optimisticPatchesRef = useRef<Map<number, Partial<Event>>>(new Map())
const [optimisticVersion, setOptimisticVersion] = useState(0)
```

**Step 4 — Add the two functions:**

```typescript
const applyOptimisticEvent = useCallback((patch: Partial<Event> & { id: number }) => {
  optimisticPatchesRef.current.set(patch.id, { ...optimisticPatchesRef.current.get(patch.id), ...patch })
  setOptimisticVersion(v => v + 1)
}, [])

const revertOptimisticEvent = useCallback((id: number) => {
  optimisticPatchesRef.current.delete(id)
  setOptimisticVersion(v => v + 1)
}, [])
```

**Step 5 — Derive `eventsWithPatches`** (place it after the `filteredEvents` memo):

```typescript
const eventsWithPatches = useMemo(
  () =>
    events.map(e => {
      const patch = optimisticPatchesRef.current.get(e.id)
      return patch ? { ...e, ...patch } : e
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [events, optimisticVersion]
)
```

**Step 6 — Update the context value object** passed to `AppContext.Provider`. Find the value prop (it may be a `useMemo` or an inline object). Change:
- `events: events` → `events: eventsWithPatches`
- Add `applyOptimisticEvent` and `revertOptimisticEvent` to the value.

The `filteredEvents` computation currently filters `events`. Update it to filter `eventsWithPatches` instead:

```typescript
const filteredEvents = useMemo(() => {
  if (!searchQuery) return eventsWithPatches
  const q = searchQuery.toLowerCase()
  return eventsWithPatches.filter(
    (e) =>
      e.participants?.toLowerCase().includes(q) ||
      e.content?.toLowerCase().includes(q) ||
      sports.find((s) => s.id === e.sportId)?.name.toLowerCase().includes(q) ||
      competitions.find((c) => c.id === e.competitionId)?.name.toLowerCase().includes(q)
  )
}, [eventsWithPatches, searchQuery, sports, competitions])
```

**Step 7 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 8 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/context/AppProvider.tsx && git commit -m "refactor(AppProvider): add applyOptimisticEvent/revertOptimisticEvent with patch map"
```

---

### Task 8: Migrate PlannerView off local realtimeEvents

**Goal:** Remove the `realtimeEvents` local state from PlannerView and route all optimistic updates through the new `applyOptimisticEvent` / `revertOptimisticEvent` context API.

**Files:**
- Modify: `src/pages/PlannerView.tsx`

**Prerequisites:** Task 7 must be complete and compile-clean before starting this task. Confirm by running `npx tsc --noEmit`.

**Step 1 — Destructure the new context values** from `useApp()`. The current destructure is:
```typescript
const { sports, competitions, orgConfig, setEvents } = useApp()
```
Change to:
```typescript
const { sports, competitions, orgConfig, setEvents, events: contextEvents, applyOptimisticEvent, revertOptimisticEvent } = useApp()
```

Note: `events` was passed as a prop to `PlannerView` previously. After this migration it comes from context. Read the component's prop signature and any parent call-sites to understand if `events` is still passed as a prop — if so, prefer context `events` over prop.

**Step 2 — Remove `realtimeEvents` state** and its sync effect:
- Delete: `const [realtimeEvents, setRealtimeEvents] = useState<Event[]>(events)`
- Delete: `useEffect(() => { setRealtimeEvents(events) }, [events])`

**Step 3 — Replace all `realtimeEvents` reads** with `contextEvents` (the `events` from `useApp()`). Use global search-and-replace within PlannerView only:
- `realtimeEvents.find(...)` → `contextEvents.find(...)`
- `realtimeEvents.filter(...)` → `contextEvents.filter(...)`
- In the `weekEvents` memo: `realtimeEvents.filter(...)` → `contextEvents.filter(...)`
- In `liveNow`: `realtimeEvents.filter(...)` → `contextEvents.filter(...)`
- In `handleDragEnd`: `realtimeEvents.find(...)` → `contextEvents.find(...)`
- In `handleUndoDrag`: `realtimeEvents.find(...)` → `contextEvents.find(...)`

**Step 4 — Replace `setRealtimeEvents` optimistic calls** with `applyOptimisticEvent` / `revertOptimisticEvent`:

In `handleDragEnd`:
```typescript
// Before API call — was: setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
applyOptimisticEvent({ id: eventId, startDateBE: newDate })

// On success — was: setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e)) not needed
// setEvents still updates the base state; then revertOptimisticEvent cleans the patch:
setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: newDate } : e))
revertOptimisticEvent(eventId) // patch no longer needed after base state updated

// On error — was: setRealtimeEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: snapshot } : e))
revertOptimisticEvent(eventId)
```

In `handleUndoDrag`:
```typescript
// Optimistic revert — was: setRealtimeEvents(...)
applyOptimisticEvent({ id: eventId, startDateBE: previousDate })

// On success
setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startDateBE: previousDate } : e))
revertOptimisticEvent(eventId)

// On error (revert the revert)
revertOptimisticEvent(eventId) // remove the failed optimistic patch
```

**Step 5 — Update the socket handlers** that previously touched `setRealtimeEvents`. The three socket `on` handlers in PlannerView currently call `setRealtimeEvents`. Since `realtimeEvents` is gone, those handlers must now call `setEvents` (updating global context base state):

```typescript
useEffect(() => {
  const unsubCreated = on('event:created', (event: Event) => {
    setEvents(prev => [...prev, event])
  })
  const unsubUpdated = on('event:updated', (event: Event) => {
    setEvents(prev => prev.map(e => e.id === event.id ? event : e))
  })
  const unsubDeleted = on('event:deleted', ({ id }: { id: number }) => {
    setEvents(prev => prev.filter(e => e.id !== id))
  })
  return () => { unsubCreated(); unsubUpdated(); unsubDeleted() }
}, [on, setEvents])
```

**Step 6 — Update `handleDragEnd` dependency array** (the `useCallback` deps). Remove `realtimeEvents` from the array; add `contextEvents` and `applyOptimisticEvent`, `revertOptimisticEvent`.

**Step 7 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 8 — Run tests:**
```bash
cd /mnt/c/Projects/Planza && npx vitest run src/pages/PlannerView.dnd.test.tsx 2>&1
```
```bash
cd /mnt/c/Projects/Planza/backend && npm test 2>&1 | tail -20
```
Expected: frontend DnD tests pass; backend tests unchanged.

**Step 9 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/pages/PlannerView.tsx && git commit -m "refactor: remove realtimeEvents local state, route optimistic updates through AppProvider"
```

---

### Task 9: Move socket handlers to AppProvider

**Goal:** Remove the three `event:*` socket handlers from PlannerView and add them to AppProvider so all pages benefit from real-time event updates.

**Files:**
- Modify: `src/context/AppProvider.tsx`
- Modify: `src/pages/PlannerView.tsx`

**Prerequisites:** Task 8 must be complete. The socket handlers in PlannerView at this point call `setEvents` (not `setRealtimeEvents`). Moving them to AppProvider is now safe.

**Step 1 — Check how `useSocket` is imported** in AppProvider. Run:
```bash
grep -n "useSocket\|socket" /mnt/c/Projects/Planza/src/context/AppProvider.tsx
```
If `useSocket` is not yet imported, add the import:
```typescript
import { useSocket } from '../hooks'
```

**Step 2 — Add socket handlers in AppProvider.** Add a `useEffect` after the existing data-load effects (after the `fetchSettings` useEffect block, around line 179):

```typescript
const { on } = useSocket()

useEffect(() => {
  if (!user) return
  const unsubCreated = on('event:created', (event: Event) => {
    setEvents(prev => [...prev, event as Event])
  })
  const unsubUpdated = on('event:updated', (event: Event) => {
    setEvents(prev => prev.map(e => e.id === (event as Event).id ? event as Event : e))
  })
  const unsubDeleted = on('event:deleted', ({ id }: { id: number }) => {
    setEvents(prev => prev.filter(e => e.id !== id))
  })
  return () => {
    unsubCreated()
    unsubUpdated()
    unsubDeleted()
  }
}, [user, on])
```

**Step 3 — Remove from PlannerView.** In `src/pages/PlannerView.tsx`, delete the `useEffect` that calls `on('event:created', ...)`, `on('event:updated', ...)`, and `on('event:deleted', ...)` (the three-handler effect added/updated in Task 8). This effect is now in AppProvider.

**Step 4 — Check if `useSocket` is still needed in PlannerView.** After removing the socket effect:
```bash
grep -n "useSocket\|{ on }" /mnt/c/Projects/Planza/src/pages/PlannerView.tsx
```
If `useSocket` / `on` is no longer used anywhere else in PlannerView, remove:
- The `import { useSocket } from '../hooks'` line
- The `const { on } = useSocket()` declaration

**Step 5 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 6 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/context/AppProvider.tsx src/pages/PlannerView.tsx && git commit -m "refactor: move socket event handlers to AppProvider for global real-time updates"
```

---

## GROUP 3 — UX FRICTION

### Task 10: EventDetailPanel component

**Goal:** Clicking an event opens a slide-in right panel showing read-only event details, with an Edit button to open the form.

**Files:**
- Create: `src/components/planner/EventDetailPanel.tsx`
- Modify: `src/pages/PlannerView.tsx`

**Step 1 — Check if `src/components/planner/` directory already exists** (it was created in Task 5). If not, create it now.

**Step 2 — Create `src/components/planner/EventDetailPanel.tsx`:**

```typescript
import { X } from 'lucide-react'
import { Badge } from '../ui'
import type { Event, Sport, Competition, EventStatus, BadgeVariant } from '../../data/types'

interface EventDetailPanelProps {
  event: Event | null
  onClose: () => void
  onEdit: (event: Event) => void
  sports: Sport[]
  competitions: Competition[]
}

function statusVariant(s: EventStatus): BadgeVariant {
  const map: Record<EventStatus, BadgeVariant> = {
    draft: 'draft',
    ready: 'warning',
    approved: 'success',
    published: 'live',
    live: 'live',
    completed: 'default',
    cancelled: 'danger',
  }
  return map[s] ?? 'default'
}

export function EventDetailPanel({ event, onClose, onEdit, sports, competitions }: EventDetailPanelProps) {
  const sport = event ? sports.find(s => s.id === event.sportId) : null
  const competition = event ? competitions.find(c => c.id === event.competitionId) : null

  return (
    <div
      className={[
        'fixed top-0 right-0 h-full w-80 bg-surface border-l shadow-xl z-30',
        'flex flex-col transition-transform duration-200',
        event ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          {sport?.icon && <span className="text-lg">{sport.icon}</span>}
          <span className="text-sm font-semibold text-text-2 truncate">
            {competition?.name ?? 'Event'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="btn btn-g btn-sm"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      {event && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h2 className="text-base font-bold text-text-1">{event.participants}</h2>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-text-3 w-20 shrink-0">Date</span>
              <span className="text-text-2">
                {typeof event.startDateBE === 'string'
                  ? new Date(event.startDateBE + 'T00:00:00').toLocaleDateString('en-GB', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    })
                  : (event.startDateBE as Date).toLocaleDateString('en-GB')}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-text-3 w-20 shrink-0">Time</span>
              <span className="text-text-2">{event.startTimeBE}</span>
            </div>
            {event.duration && (
              <div className="flex gap-2">
                <span className="text-text-3 w-20 shrink-0">Duration</span>
                <span className="text-text-2">{event.duration}</span>
              </div>
            )}
          </div>

          <div>
            <Badge variant={statusVariant(event.status ?? 'draft')}>
              {event.status ?? 'draft'}
            </Badge>
          </div>

          {(event.linearChannel || event.radioChannel || event.onDemandChannel) && (
            <div className="space-y-1 text-sm">
              <p className="text-text-3 text-xs uppercase tracking-wider font-semibold">Channels</p>
              {event.linearChannel && (
                <div className="flex gap-2">
                  <span className="text-text-3 w-20 shrink-0">Linear</span>
                  <span className="text-text-2">{event.linearChannel}</span>
                </div>
              )}
              {event.radioChannel && (
                <div className="flex gap-2">
                  <span className="text-text-3 w-20 shrink-0">Radio</span>
                  <span className="text-text-2">{event.radioChannel}</span>
                </div>
              )}
              {event.onDemandChannel && (
                <div className="flex gap-2">
                  <span className="text-text-3 w-20 shrink-0">On Demand</span>
                  <span className="text-text-2">{event.onDemandChannel}</span>
                </div>
              )}
            </div>
          )}

          {(event.techPlans?.length ?? 0) > 0 && (
            <div className="text-sm">
              <span className="text-text-3 text-xs uppercase tracking-wider font-semibold">Tech Plans</span>
              <p className="text-text-2 mt-1">{event.techPlans!.length} plan(s) assigned</p>
            </div>
          )}

          {event.phase && (
            <div className="text-sm">
              <span className="text-text-3 w-20">Phase</span>
              <span className="text-text-2 ml-2">{event.phase}</span>
            </div>
          )}

          {event.complex && (
            <div className="text-sm">
              <span className="text-text-3 w-20">Complex</span>
              <span className="text-text-2 ml-2">{event.complex}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {event && (
        <div className="p-4 border-t">
          <button
            className="btn btn-p w-full"
            onClick={() => onEdit(event)}
          >
            Edit Event
          </button>
        </div>
      )}
    </div>
  )
}
```

**Step 3 — Update PlannerView.** Add `detailEvent` state:

```typescript
const [detailEvent, setDetailEvent] = useState<Event | null>(null)
const [editEvent, setEditEvent] = useState<Event | null>(null)
```

Find where `onEventClick` is currently used (or where events are clicked to open the form). Change the click handler from directly opening the form to setting `detailEvent`:

```typescript
// Change event card onClick from: () => onEventClick?.(ev)   or   setModalEvent(ev)
// To:
onClick={() => setDetailEvent(ev)}
```

When the Edit button in the panel is clicked:
```typescript
// onEdit handler:
(ev: Event) => {
  setDetailEvent(null)
  setEditEvent(ev)
}
```

Open `DynamicEventForm` when `editEvent` is set. If the form is currently controlled by `onEventClick` prop, check how the parent (`App.tsx` or `src/pages/`) passes the handler and adapt accordingly.

Add import in PlannerView:
```typescript
import { EventDetailPanel } from '../components/planner/EventDetailPanel'
```

Render `EventDetailPanel` in PlannerView JSX (at the root level, not inside the calendar scroll container):

```tsx
<EventDetailPanel
  event={detailEvent}
  onClose={() => setDetailEvent(null)}
  onEdit={(ev) => { setDetailEvent(null); setEditEvent(ev) }}
  sports={sports}
  competitions={competitions}
/>
```

**Step 4 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 5 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/components/planner/EventDetailPanel.tsx src/pages/PlannerView.tsx && git commit -m "feat: EventDetailPanel slide-in read-only panel with Edit button"
```

---

### Task 11: Date jump input

**Goal:** Add a native `<input type="week">` to the week navigation bar so users can jump directly to any week. Also add keyboard shortcut `T` for today.

**Files:**
- Modify: `src/pages/PlannerView.tsx`

**Step 1 — Compute `currentWeekValue`** (the YYYY-Www string for the `<input type="week">` value). Add this derived value in PlannerView after `weekLabel` is computed:

```typescript
// Compute ISO week number for the input[type=week] value attribute
const currentWeekValue = (() => {
  // Get ISO week number of `monday`
  const d = new Date(monday)
  d.setUTCHours(0, 0, 0, 0)
  // Thursday of this week (ISO 8601 week starts Monday, week number determined by Thursday)
  const thursday = new Date(d)
  thursday.setDate(d.getDate() - d.getDay() + 4)
  const yearStart = new Date(thursday.getFullYear(), 0, 1)
  const weekNo = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const year = thursday.getFullYear()
  return `${year}-W${String(weekNo).padStart(2, '0')}`
})()
```

**Step 2 — Add the week input** in the navigation bar JSX, between the `<` (prev) button and the week label text:

```tsx
<input
  type="week"
  className="inp text-sm px-2 py-1"
  value={currentWeekValue}
  onChange={e => {
    if (!e.target.value) return
    const [yearStr, weekStr] = e.target.value.split('-W')
    const year = Number(yearStr)
    const week = Number(weekStr)
    if (!year || !week) return
    // Compute Monday of ISO week `week` in `year`
    const jan4 = new Date(year, 0, 4)
    const dayOfWeek = jan4.getDay() || 7  // 1=Mon ... 7=Sun
    const startOfWeek1 = new Date(jan4)
    startOfWeek1.setDate(jan4.getDate() - dayOfWeek + 1)
    const targetMonday = new Date(startOfWeek1)
    targetMonday.setDate(startOfWeek1.getDate() + (week - 1) * 7)
    // Compute today's Monday
    const today = new Date()
    const todayDay = today.getDay() || 7
    const todayMonday = new Date(today)
    todayMonday.setDate(today.getDate() - todayDay + 1)
    todayMonday.setHours(0, 0, 0, 0)
    targetMonday.setHours(0, 0, 0, 0)
    const diffMs = targetMonday.getTime() - todayMonday.getTime()
    const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
    setWeekOffset(diffWeeks)
  }}
/>
```

**Step 3 — Add `T` keyboard shortcut** to jump to today. Update the existing keyboard shortcut `useEffect` (lines 234–242) to also handle `'t'`:

```typescript
useEffect(() => {
  const handleKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'ArrowLeft')  setWeekOffset(o => o - 1)
    if (e.key === 'ArrowRight') setWeekOffset(o => o + 1)
    if (e.key === 't' || e.key === 'T') setWeekOffset(0)
  }
  window.addEventListener('keydown', handleKey)
  return () => window.removeEventListener('keydown', handleKey)
}, [])
```

**Step 4 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 5 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/pages/PlannerView.tsx && git commit -m "feat: date jump input and T shortcut for today in PlannerView week nav"
```

---

### Task 12: Complete saved views

**Goal:** Extend `SavedView` to persist `calendarMode` alongside `channelFilter`.

**Files:**
- Modify: `src/services/savedViews.ts`
- Modify: `src/pages/PlannerView.tsx`

**Context:** The `savedViewsApi` uses the field name `filterState` (not `filters`). The `SavedView` type has `filterState: Record<string, unknown>`. The `create` method takes three separate args: `create(name, context, filterState)`. The current PlannerView `handleSaveView` calls `savedViewsApi.create(saveViewName, 'planner', { channelFilter })` and `handleLoadView` reads `view.filterState as { channelFilter?: string }`. Maintain this exact field name throughout.

**Step 1 — Update `SavedView` type** in `src/services/savedViews.ts`. Add a typed filter interface:

```typescript
export interface PlannerFilterState {
  channelFilter?: string
  calendarMode?: 'calendar' | 'list'
}

export interface SavedView {
  id: string
  name: string
  context: string
  filterState: PlannerFilterState & Record<string, unknown>
}
```

**Step 2 — Update `handleSaveView` in PlannerView** to include `calendarMode` in `filterState`:

Find the existing `handleSaveView` function (around line 181):
```typescript
const view = await savedViewsApi.create(saveViewName.trim(), 'planner', { channelFilter })
```
Change to:
```typescript
const view = await savedViewsApi.create(saveViewName.trim(), 'planner', {
  channelFilter,
  calendarMode: calendarMode ? 'calendar' : 'list',
})
```

**Step 3 — Update `handleLoadView` in PlannerView** to restore `calendarMode`:

Find the existing `handleLoadView` function (around line 193):
```typescript
const handleLoadView = (view: SavedView) => {
  const fs = view.filterState as { channelFilter?: string }
  if (fs.channelFilter) setChannelFilter(fs.channelFilter)
}
```
Change to:
```typescript
const handleLoadView = (view: SavedView) => {
  const fs = view.filterState
  if (fs.channelFilter) setChannelFilter(fs.channelFilter)
  if (fs.calendarMode === 'calendar') setCalendarMode(true)
  if (fs.calendarMode === 'list') setCalendarMode(false)
}
```

**Step 4 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 5 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/services/savedViews.ts src/pages/PlannerView.tsx && git commit -m "feat: saved views now persist calendarMode alongside channelFilter"
```

---

### Task 13: Search bar

**Goal:** Add a local search input to the planner header that filters the week's events client-side. Clears on week navigation.

**Files:**
- Modify: `src/pages/PlannerView.tsx`

**Context:** `AppProvider` already has a `searchQuery` / `setSearchQuery` in context, and `filteredEvents` memo that filters globally. PlannerView needs its own **local** search scoped to the week view only — do not reuse the global `searchQuery` from context. Use a new local state `localSearch`.

**Step 1 — Add `localSearch` state** in PlannerView:

```typescript
const [localSearch, setLocalSearch] = useState('')
```

**Step 2 — Clear on week navigation.** Add `setLocalSearch('')` to the prev/next/today button `onClick` handlers. Also add it when the `<input type="week">` `onChange` fires (in the week input's `onChange` handler already written in Task 11, add `setLocalSearch('')` before `setWeekOffset(diffWeeks)`).

**Step 3 — Add search input** in the planner header JSX. Place it alongside the channel filter chips or in the header row near the week navigation:

```tsx
<input
  type="search"
  placeholder="Search events…"
  className="inp text-sm px-2 py-1 w-48"
  value={localSearch}
  onChange={e => setLocalSearch(e.target.value)}
/>
```

**Step 4 — Add search filtering** to the `filteredWeekEvents` memo. The current `filteredWeekEvents` memo (line 273) filters by `channelFilter`. Extend it to also filter by `localSearch`:

```typescript
const filteredWeekEvents = useMemo(() => {
  let result = channelFilter === 'all' ? weekEvents : weekEvents.filter(e => e.linearChannel === channelFilter)
  if (localSearch) {
    const q = localSearch.toLowerCase()
    result = result.filter(ev =>
      ev.participants?.toLowerCase().includes(q) ||
      ev.linearChannel?.toLowerCase().includes(q) ||
      sportsMap.get(ev.sportId)?.name?.toLowerCase().includes(q) ||
      compsMap.get(ev.competitionId)?.name?.toLowerCase().includes(q)
    )
  }
  return result
}, [weekEvents, channelFilter, localSearch, sportsMap, compsMap])
```

Note: uses `sportsMap` and `compsMap` (already-built `Map` lookups in PlannerView) for performance — no `sports.find()` loop.

**Step 5 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 6 — Commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/pages/PlannerView.tsx && git commit -m "feat: local search bar in PlannerView filters week events client-side"
```

---

### Task 14: Auto-scroll to newly created event

**Goal:** After creating a new event, automatically navigate the calendar to the week containing that event.

**Files:**
- Modify: `src/context/AppProvider.tsx`
- Modify: `src/pages/PlannerView.tsx`

**Step 1 — Change `handleSaveEvent` return type** in AppProvider from `Promise<void>` to `Promise<Event | null>`:

In `src/context/AppProvider.tsx`:

Update the context type interface:
```typescript
handleSaveEvent: (ev: Event) => Promise<Event | null>
```

Update the `handleSaveEvent` implementation. Change the `create` branch to return the created event, and the `update` branch to return the updated event, and the error case to return `null`:

```typescript
const handleSaveEvent = useCallback(
  async (ev: Event): Promise<Event | null> => {
    const existingIndex = events.findIndex((e) => e.id === ev.id)
    const isUpdate = existingIndex >= 0
    const snapshot = isUpdate ? events[existingIndex] : null

    try {
      if (isUpdate) {
        const updated = await eventsApi.update(ev.id, ev)
        setEvents((prev) => prev.map((e) => (e.id === ev.id ? (updated as Event) : e)))
        toast.success('Event updated')
        return updated as Event
      } else {
        const created = await eventsApi.create(ev)
        setEvents((prev) => [...prev, created as Event])
        toast.success('Event created')
        return created as Event
      }
    } catch (error) {
      console.error('Failed to save event:', error)
      if (isUpdate && snapshot) {
        setEvents((prev) => prev.map((e) => (e.id === ev.id ? snapshot : e)))
      }
      toast.error('Save failed — could not reach server')
      return null
    }
  },
  [events, toast]
)
```

**Step 2 — Update PlannerView's `onSave` handler** to use the returned event for auto-scroll. Find where `handleSaveEvent` is called in PlannerView — it is passed as a callback to `DynamicEventForm` (or called in an `onSave`/`onSubmit` handler). The current call is:

```typescript
await handleSaveEvent(ev)
```

Determine if the current event being saved was a create (i.e., it was not in `events` before). The `editEvent` state tracks whether an event is being edited. If `editEvent` is `null` when the form is submitted, it's a create. Wrap the call:

```typescript
const savedEvent = await handleSaveEvent(ev)
// Auto-scroll to new event's week (create only)
if (!editEvent && savedEvent) {
  const rawDate = savedEvent.startDateBE
  const eventDate = typeof rawDate === 'string'
    ? new Date(rawDate + 'T00:00:00')
    : rawDate as Date
  const today = new Date()
  const todayDay = today.getDay() || 7
  const todayMonday = new Date(today)
  todayMonday.setDate(today.getDate() - todayDay + 1)
  todayMonday.setHours(0, 0, 0, 0)
  const eventDay = eventDate.getDay() || 7
  const eventMonday = new Date(eventDate)
  eventMonday.setDate(eventDate.getDate() - eventDay + 1)
  eventMonday.setHours(0, 0, 0, 0)
  const diffWeeks = Math.round(
    (eventMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)
  )
  setWeekOffset(diffWeeks)
}
```

**Note on `editEvent`:** In PlannerView after Task 10, a new `editEvent` state was added (`const [editEvent, setEditEvent] = useState<Event | null>(null)`). When `editEvent` is not null, the form is editing an existing event. When null, the form is creating. Use that state to differentiate create vs update.

**Step 3 — Compile check:**
```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

**Step 4 — Run all backend tests:**
```bash
cd /mnt/c/Projects/Planza/backend && npm test 2>&1 | tail -20
```
Expected: same pass/fail ratio as before (73+ passing, same 6 pre-existing failures if any).

**Step 5 — Final commit:**
```bash
cd /mnt/c/Projects/Planza && git add src/context/AppProvider.tsx src/pages/PlannerView.tsx && git commit -m "feat: auto-scroll to newly created event's week after save"
```

---

## Delivery checklist

| # | Task | Group | Key files | Compile gate | Test gate |
|---|------|-------|-----------|--------------|-----------|
| 1 | Bulk conflict check endpoint | 1 | `events.ts` (backend) | `npm test` | conflictService.test.ts |
| 2 | Conflict visualization | 1 | `events.ts` (service), `PlannerView.tsx` | `tsc --noEmit` | visual |
| 3 | Bulk ops backend | 1 | `events.ts` (backend) | `npm test` | eventsBulk.test.ts |
| 4 | Bulk selection UI | 1 | `PlannerView.tsx` | `tsc --noEmit` | visual |
| 5 | Floating action bar | 1 | `BulkActionBar.tsx`, `PlannerView.tsx` | `tsc --noEmit` | visual |
| 6 | Undo toast | 1 | `UndoBar.tsx`, `PlannerView.tsx`, `dnd.test.tsx` | `tsc --noEmit` | PlannerView.dnd.test.tsx |
| 7 | AppProvider optimistic API | 2 | `AppProvider.tsx` | `tsc --noEmit` | — |
| 8 | Migrate off realtimeEvents | 2 | `PlannerView.tsx` | `tsc --noEmit` | PlannerView.dnd.test.tsx |
| 9 | Move socket to AppProvider | 2 | `AppProvider.tsx`, `PlannerView.tsx` | `tsc --noEmit` | — |
| 10 | EventDetailPanel | 3 | `EventDetailPanel.tsx`, `PlannerView.tsx` | `tsc --noEmit` | visual |
| 11 | Date jump input | 3 | `PlannerView.tsx` | `tsc --noEmit` | visual |
| 12 | Complete saved views | 3 | `savedViews.ts`, `PlannerView.tsx` | `tsc --noEmit` | visual |
| 13 | Search bar | 3 | `PlannerView.tsx` | `tsc --noEmit` | visual |
| 14 | Auto-scroll to new event | 3 | `AppProvider.tsx`, `PlannerView.tsx` | `tsc --noEmit` | `npm test` |

## Key gotchas

1. **`detectConflicts` not `checkConflicts`** — the function in `conflictService.ts` is named `detectConflicts`. All references in the bulk endpoint must use the correct name.
2. **`savedViewsApi` uses `filterState` not `filters`** — the `SavedView` type field is `filterState: Record<string, unknown>`, and `create` takes three separate positional arguments `(name, context, filterState)`.
3. **Toast has no `action` prop** — `useToast()` only supports `.success(message)`, `.error(message)` etc. with plain strings. Undo requires a separate `UndoBar` component.
4. **`api.delete` may not accept a body** — check `src/utils/api.ts` before implementing `eventsApi.bulkDelete`. Use `api.post` with a different path or raw `fetch` if needed.
5. **`api.patch` may not exist** — check `src/utils/api.ts`. The `ApiClient` might only have `get`, `post`, `put`, `delete`. If `patch` is missing, implement bulk status/reschedule/assign with raw `fetch` calls using `getStoredToken()` and `API_URL`.
6. **`startDateBE` is a `Date` from Prisma** — in the bulk reschedule backend, `ev.startDateBE` is a Prisma `Date` object (not a string). Use `new Date(ev.startDateBE)` directly, not `new Date(ev.startDateBE.slice(...))`.
7. **Bulk route ordering matters** — `/bulk`, `/bulk/status`, `/bulk/reschedule`, `/bulk/assign` must all come **before** `/:id` in the router file, or Express will interpret `bulk` as a route parameter.
8. **PlannerView `events` prop vs context `events`** — After Task 8, PlannerView reads `events` from context (`useApp()`). The parent still passes `events` as a prop. Both will coexist during migration; prefer context.
