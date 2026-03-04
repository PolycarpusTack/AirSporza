# Planza Hardening & Bug-Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical security gaps, runtime bugs, and data-loss issues identified in the architecture/code review — without restructuring or refactoring unrelated code.

**Architecture:** Four sequential waves: (1) backend security, (2) backend bugs, (3) frontend bugs, (4) medium-severity polish. Each wave is self-contained and safe to commit independently. No new dependencies, no new files except where strictly required.

**Tech Stack:** Express + Prisma + Socket.IO (backend), React + TypeScript + Vite (frontend), jsonwebtoken (JWT verification already available via `authenticate` middleware in `backend/src/middleware/auth.ts`).

---

## WAVE 1 — Backend Security (Critical)

---

### Task 1: Authenticate Socket.IO connections

**Files:**
- Modify: `backend/src/services/socket.ts:11-18`

**Context:**
The `io.use()` middleware calls `next()` unconditionally regardless of whether the token is valid. Any anonymous client can connect and receive all real-time broadcasts.

The JWT verification helper already exists — look at `backend/src/middleware/auth.ts` to find how it decodes the token (it calls `jwt.verify(token, secret)`). Use the same pattern.

**Step 1: Read the auth middleware to understand the verify pattern**

Read `backend/src/middleware/auth.ts` and note the import of `jwt` and `getJwtSecret` (or equivalent). You will replicate that call in the socket middleware.

**Step 2: Update `socket.ts`**

Replace the entire `io.use()` block (lines 11-18) with:

```typescript
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../config/index.js'   // adjust import path to match how auth.ts imports it
```

Add to top of `setupSocket`:

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token) {
    return next(new Error('Unauthorized'))
  }
  try {
    jwt.verify(token, getJwtSecret())
    next()
  } catch {
    next(new Error('Unauthorized'))
  }
})
```

> Note: check `backend/src/config/index.ts` for the exact exported function name (`getJwtSecret`, `JWT_SECRET`, etc.). Use whatever `auth.ts` uses.

**Step 3: Verify it compiles**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
```
Expected: zero errors.

**Step 4: Commit**

```bash
cd /mnt/c/Projects/Planza
git add backend/src/services/socket.ts
git commit -m "fix: require valid JWT for Socket.IO connections"
```

---

### Task 2: Add `authenticate` to contract GET routes

**Files:**
- Modify: `backend/src/routes/contracts.ts:26,50,80`

**Context:**
All three GET routes are currently public. The `filterContractForRole` function already handles role-based field stripping — it just needs a real `req.user` to work from. Adding `authenticate` as middleware gives it that, while keeping the existing filtering logic untouched.

**Step 1: Add `authenticate` to all three GET handlers**

Change line 26:
```typescript
// Before:
router.get('/', async (req, res, next) => {

// After:
router.get('/', authenticate, async (req, res, next) => {
```

Change line 50:
```typescript
// Before:
router.get('/expiring', async (req, res, next) => {

// After:
router.get('/expiring', authenticate, async (req, res, next) => {
```

Change line 80:
```typescript
// Before:
router.get('/:id', async (req, res, next) => {

// After:
router.get('/:id', authenticate, async (req, res, next) => {
```

**Step 2: Remove the `?? 'planner'` fallback from all three handlers**

In all three handlers, change:
```typescript
const role = (req.user as { role: string } | undefined)?.role ?? 'planner'
```
to:
```typescript
const role = (req.user as { role: string }).role
```

(Now that `authenticate` guarantees `req.user` is set.)

**Step 3: Compile check**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
```

**Step 4: Commit**

```bash
cd /mnt/c/Projects/Planza
git add backend/src/routes/contracts.ts
git commit -m "fix: require authentication on contract GET routes"
```

---

### Task 3: Add Joi validation to contract write routes

**Files:**
- Modify: `backend/src/routes/contracts.ts:102-153`

**Context:**
`POST /contracts` and `PUT /contracts/:id` pass `req.body` directly to `prisma.contract.create/update` with no validation — mass-assignment risk.

**Step 1: Read the Prisma Contract model**

Open `backend/prisma/schema.prisma` and find the `Contract` model. Note all writable fields (exclude `id`, `createdAt`, `updatedAt`).

**Step 2: Add a Joi schema at the top of `contracts.ts`**

After the existing imports, add:

```typescript
import Joi from 'joi'

const contractSchema = Joi.object({
  competitionId: Joi.number().integer().min(1).required(),
  status: Joi.string().valid('draft', 'valid', 'expiring', 'expired').required(),
  validFrom: Joi.string().isoDate().required(),
  validUntil: Joi.string().isoDate().required(),
  linearRights: Joi.boolean(),
  digitalRights: Joi.boolean(),
  radioRights: Joi.boolean(),
  maxRights: Joi.boolean(),
  geoRestriction: Joi.string().allow(''),
  sublicensing: Joi.boolean(),
  fee: Joi.number().min(0),
  notes: Joi.string().allow(''),
})
```

> Adjust field names and types to exactly match what is in `schema.prisma`. Do not invent fields.

**Step 3: Apply validation in `POST /contracts`**

Replace:
```typescript
router.post('/', authenticate, authorize('contracts', 'admin'), async (req, res, next) => {
  try {
    const contract = await prisma.contract.create({
      data: req.body,
```

With:
```typescript
router.post('/', authenticate, authorize('contracts', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = contractSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const contract = await prisma.contract.create({
      data: value,
```

**Step 4: Apply validation in `PUT /contracts/:id`**

Replace:
```typescript
    const contract = await prisma.contract.update({
      where: { id: contractId },
      data: req.body,
```

With:
```typescript
    const { error, value } = contractSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const contract = await prisma.contract.update({
      where: { id: contractId },
      data: value,
```

**Step 5: Compile check**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
```

**Step 6: Commit**

```bash
cd /mnt/c/Projects/Planza
git add backend/src/routes/contracts.ts
git commit -m "fix: add Joi validation to contract create and update routes"
```

---

### Task 4: Protect the debug DB endpoint

**Files:**
- Modify: `backend/src/index.ts:95-102`

**Context:**
`GET /api/debug/db` returns the database host, port, and name with no authentication. It should require admin access.

**Step 1: Add `authenticate` and `authorize` imports to `index.ts`**

At the top of `index.ts`, add:
```typescript
import { authenticate, authorize } from './middleware/auth.js'
```

**Step 2: Add middleware to the debug route**

Change line 95:
```typescript
// Before:
app.get('/api/debug/db', (_req, res) => {

// After:
app.get('/api/debug/db', authenticate, authorize('admin'), (_req, res) => {
```

**Step 3: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
git add backend/src/index.ts
git commit -m "fix: require admin auth on debug/db endpoint"
```

---

## WAVE 2 — Backend Bugs (Critical + High)

---

### Task 5: Add null guard to `DELETE /tech-plans/:id`

**Files:**
- Modify: `backend/src/routes/techPlans.ts:202-225`

**Context:**
The handler fetches `existing` but never checks if it's null before calling `prisma.techPlan.delete`. A delete on a non-existent id throws an unguarded Prisma `P2025` error.

**Step 1: Add the null guard**

After line 205 (`const existing = await prisma.techPlan.findUnique(...)`), add:

```typescript
    if (!existing) {
      return next(createError(404, 'Tech plan not found'))
    }
```

**Step 2: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
git add backend/src/routes/techPlans.ts
git commit -m "fix: return 404 when deleting non-existent tech plan"
```

---

### Task 6: Clean up `CustomFieldValue` rows on event delete

**Files:**
- Modify: `backend/src/routes/events.ts:247-279`

**Context:**
`DELETE /events/:id` deletes the `Event` row but leaves orphaned `CustomFieldValue` rows with `entityType: 'event'`. These accumulate forever. Both deletions should happen in a transaction.

**Step 1: Replace the `prisma.event.delete` call with a `$transaction`**

Change lines 257-259 from:
```typescript
    await prisma.event.delete({
      where: { id: Number(req.params.id) }
    })
```

To:
```typescript
    await prisma.$transaction([
      prisma.customFieldValue.deleteMany({
        where: { entityType: 'event', entityId: String(req.params.id) }
      }),
      prisma.event.delete({
        where: { id: Number(req.params.id) }
      }),
    ])
```

**Step 2: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
git add backend/src/routes/events.ts
git commit -m "fix: delete CustomFieldValue rows when deleting an event"
```

---

### Task 7: Add `onDemandChannel` to the event Joi schema

**Files:**
- Modify: `backend/src/routes/events.ts:14-41`

**Context:**
The frontend sends `onDemandChannel` in the event payload (set in `DynamicEventForm`) but the Joi schema does not include it, causing it to be silently stripped on create/update. Confirm the DB column exists via `schema.prisma` before adding.

**Step 1: Verify the column exists**

Open `backend/prisma/schema.prisma` and confirm `onDemandChannel` is a field on the `Event` model. If it is not (migration not yet applied), apply the migration first:
```bash
docker exec -i sporza-db psql -U sporza -d sporza_planner < backend/prisma/migrations/add_on_demand_channel.sql
```

**Step 2: Add field to schema**

In `eventSchema` (line 28-29 area), after `radioChannel`:
```typescript
  onDemandChannel: Joi.string().allow(''),
```

**Step 3: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
git add backend/src/routes/events.ts
git commit -m "fix: add onDemandChannel to event Joi schema"
```

---

### Task 8: Add startup sweep for undelivered webhook retries

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/services/publishService.ts`

**Context:**
Pending webhook retries live in memory (`setTimeout`). A process restart drops them silently. On startup, we need to re-queue any `WebhookDelivery` records that have `deliveredAt IS NULL` and `attempts < 3`.

**Step 1: Export a `resumeFailedDeliveries` function from `publishService.ts`**

Add at the bottom of `publishService.ts`, before the `export`:

```typescript
async function resumeFailedDeliveries(): Promise<void> {
  const failed = await prisma.webhookDelivery.findMany({
    where: { deliveredAt: null, attempts: { lt: 3 } },
    include: { webhook: true },
  })

  if (failed.length === 0) return

  logger.info(`Resuming ${failed.length} undelivered webhook retries`)

  for (const delivery of failed) {
    const payload = delivery.payload as object
    attemptDelivery(delivery.webhook as WebhookEndpoint, delivery as WebhookDelivery, payload).catch(() => {
      scheduleRetries(delivery.webhook as WebhookEndpoint, delivery as WebhookDelivery, payload, delivery.attempts)
    })
  }
}
```

Update the export at the bottom:
```typescript
export const publishService = { dispatch, retryDelivery, checkExpiringContracts, resumeFailedDeliveries }
```

**Step 2: Call it at startup in `index.ts`**

After the `setupSocket(io)` line (~line 119), add:

```typescript
// Resume any webhook deliveries that failed before the last process restart
if (process.env.NODE_ENV !== 'test') {
  publishService.resumeFailedDeliveries().catch(err =>
    logger.error('Failed to resume webhook deliveries', { err })
  )
}
```

**Step 3: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
git add backend/src/services/publishService.ts backend/src/index.ts
git commit -m "fix: resume undelivered webhook retries on process startup"
```

---

### Task 9: Add missing `techPlan.deleted` webhook dispatch

**Files:**
- Modify: `backend/src/routes/techPlans.ts:202-225`

**Context:**
`techPlan.created` and `techPlan.updated` dispatch webhooks, but `techPlan.deleted` does not. The event type `techPlan.deleted` does not exist in `PublishEventType` — we need to add it there too.

**Step 1: Add `'techPlan.deleted'` to `PublishEventType` in `publishService.ts`**

Change:
```typescript
export type PublishEventType =
  | 'event.created'
  | 'event.updated'
  | 'event.deleted'
  | 'event.live.started'
  | 'event.live.ended'
  | 'techPlan.created'
  | 'techPlan.updated'
  | 'contract.expiring'
```

To:
```typescript
export type PublishEventType =
  | 'event.created'
  | 'event.updated'
  | 'event.deleted'
  | 'event.live.started'
  | 'event.live.ended'
  | 'techPlan.created'
  | 'techPlan.updated'
  | 'techPlan.deleted'
  | 'contract.expiring'
```

**Step 2: Add dispatch call in the delete handler**

In `techPlans.ts`, after the `emit('techPlan:deleted', ...)` line (~line 209), add:
```typescript
    void publishService.dispatch('techPlan.deleted', { id: planId })
```

**Step 3: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
git add backend/src/services/publishService.ts backend/src/routes/techPlans.ts
git commit -m "fix: dispatch techPlan.deleted webhook event on plan deletion"
```

---

### Task 10: Scope Socket.IO broadcasts to rooms

**Files:**
- Modify: `backend/src/services/socketInstance.ts`

**Context:**
`io.emit()` broadcasts to every connected socket. Rooms are already set up in `socket.ts` (`events`, `techPlans`, `encoders`) but never used for targeting. Change `emit()` to accept an optional room and target it.

**Step 1: Update `socketInstance.ts`**

Replace the entire file with:

```typescript
import { Server as SocketServer } from 'socket.io'

let io: SocketServer | null = null

export function setSocketServer(socketServer: SocketServer) {
  io = socketServer
}

export function getSocketServer(): SocketServer | null {
  return io
}

export function emit(event: string, data: unknown, room?: string) {
  if (!io) return
  if (room) {
    io.to(room).emit(event, data)
  } else {
    io.emit(event, data)
  }
}
```

**Step 2: Update call sites to pass the room**

In `backend/src/routes/events.ts`:
- Change `emit('event:created', event)` → `emit('event:created', event, 'events')`
- Change `emit('event:updated', event)` → `emit('event:updated', event, 'events')`
- Change `emit('event:deleted', ...)` → `emit('event:deleted', { id: ... }, 'events')`

In `backend/src/routes/techPlans.ts`:
- Change `emit('techPlan:created', plan)` → `emit('techPlan:created', plan, 'techPlans')`
- Change `emit('techPlan:updated', plan)` → `emit('techPlan:updated', plan, 'techPlans')`
- Change `emit('techPlan:deleted', ...)` → `emit('techPlan:deleted', { id: planId }, 'techPlans')`
- Change `emit('encoder:swapped', ...)` → `emit('encoder:swapped', { planId: plan.id, encoder, plan }, 'techPlans')`

**Step 3: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
git add backend/src/services/socketInstance.ts backend/src/routes/events.ts backend/src/routes/techPlans.ts
git commit -m "fix: scope socket broadcasts to rooms instead of global emit"
```

---

## WAVE 3 — Frontend Bugs (Critical + High)

---

### Task 11: Fix the settings race condition in `AppProvider`

**Files:**
- Modify: `src/context/AppProvider.tsx:95-183`

**Context:**
Two `useEffect` hooks both call `settingsApi.getApp(activeRole)` — one on `[user]`, one on `[activeRole, user]`. On initial load they race and the slower response can overwrite `eventFields`/`crewFields` with wrong data.

The fix: the first effect (data load on `[user]`) should NOT fetch settings — it delegates entirely to the second effect which handles the settings fetch on `[activeRole, user]`. The first effect only fetches events, techPlans, sports, and competitions.

**Step 1: Remove the settings fetch from the first `useEffect`**

In the `fetchData` function inside the first `useEffect` (lines 103-149), change the `Promise.all` from:

```typescript
const [eventsData, plansData, settingsData, sportsData, competitionsData] = await Promise.all([
  eventsApi.list().catch(() => null),
  techPlansApi.list().catch(() => null),
  settingsApi.getApp(activeRole).catch(() => null),
  sportsApi.list().catch(() => null),
  competitionsApi.list().catch(() => null),
])
```

To:

```typescript
const [eventsData, plansData, sportsData, competitionsData] = await Promise.all([
  eventsApi.list().catch(() => null),
  techPlansApi.list().catch(() => null),
  sportsApi.list().catch(() => null),
  competitionsApi.list().catch(() => null),
])
```

And remove the entire `if (settingsData) { ... }` block (lines 133-149) from this first effect.

**Step 2: Keep the second effect unchanged** — it already fetches settings on `[activeRole, user]` and handles all setting fields including `orgConfig`. But it currently does NOT fetch `orgConfig`. Fix this by adding it:

In the second effect's `fetchSettings` function, after:
```typescript
        if (settingsData.crewFields) {
          setCrewFields(settingsData.crewFields)
        }
```

Add:
```typescript
        if (settingsData.orgConfig) {
          setOrgConfig(settingsData.orgConfig)
        }
```

**Step 3: Compile check**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/context/AppProvider.tsx
git commit -m "fix: deduplicate settings fetch effects to eliminate race condition"
```

---

### Task 12: Fix ghost event on save failure in `AppProvider`

**Files:**
- Modify: `src/context/AppProvider.tsx:185-214`

**Context:**
When `eventsApi.create` fails, the catch block still pushes the event with a local id into state. Any later save attempt for that event calls `eventsApi.update(localId, ...)`, which gets a 404, and adds another copy.

The fix: on create failure, do not modify state. On update failure, revert to the pre-update snapshot.

**Step 1: Capture the pre-update snapshot**

Change `handleSaveEvent` to:

```typescript
  const handleSaveEvent = useCallback(
    async (ev: Event) => {
      const existingIndex = events.findIndex((e) => e.id === ev.id)
      const isUpdate = existingIndex >= 0
      const snapshot = isUpdate ? events[existingIndex] : null

      try {
        if (isUpdate) {
          const updated = await eventsApi.update(ev.id, ev)
          setEvents((prev) => prev.map((e) => (e.id === ev.id ? (updated as Event) : e)))
          toast.success('Event updated')
        } else {
          const created = await eventsApi.create(ev)
          setEvents((prev) => [...prev, created as Event])
          toast.success('Event created')
        }
      } catch (error) {
        console.error('Failed to save event:', error)
        if (isUpdate && snapshot) {
          // Revert to original — don't leave a dirty state
          setEvents((prev) => prev.map((e) => (e.id === ev.id ? snapshot : e)))
        }
        // On create failure: do nothing — don't add a ghost event
        toast.error('Save failed — could not reach server')
      }
    },
    [events, toast]
  )
```

**Step 2: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
git add src/context/AppProvider.tsx
git commit -m "fix: revert on update failure, skip state mutation on create failure"
```

---

### Task 13: Fix `DynamicEventForm` state not resetting between edits

**Files:**
- Modify: `src/components/forms/DynamicEventForm.tsx:46-80`

**Context:**
`useState(initForm)` runs `initForm` only at mount. If the form component is reused with a different `editEvent` (or goes from null to a value), `form` and `customValues` retain stale data from the previous edit.

**Step 1: Add a reset effect**

After the `const [customValues, setCustomValues] = useState<...>({})` declaration (around line 80), add:

```typescript
  useEffect(() => {
    setForm(initForm())
    setCustomValues({})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEvent?.id])
```

> `initForm` uses `editEvent` from the closure, so calling `initForm()` at effect time picks up the new `editEvent`. The `editEvent?.id` dependency means the effect fires when a different event is selected (or when null→event).

**Step 2: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
git add src/components/forms/DynamicEventForm.tsx
git commit -m "fix: reset DynamicEventForm state when editEvent changes"
```

---

### Task 14: Persist crew edits in `SportsWorkspace`

**Files:**
- Modify: `src/pages/SportsWorkspace.tsx:141-184`

**Context:**
`handleCrewEdit`, `addCustomToPlan`, `updatePlanCustomField`, and `removePlanCustomField` all update local state only — changes are lost on reload. Each should call `techPlansApi.update()` after changing local state.

**Step 1: Add debounced persistence to `handleCrewEdit`**

Replace `handleCrewEdit` with a version that also saves:

```typescript
  const handleCrewEdit = useCallback(async (planId: number, field: string, value: string) => {
    const updated = realtimePlans.map(p => p.id === planId ? { ...p, crew: { ...p.crew as Record<string, unknown>, [field]: value } } : p)
    setRealtimePlans(updated)
    setTechPlans(updated)
    const plan = updated.find(p => p.id === planId)
    if (plan) {
      try {
        await techPlansApi.update(planId, { crew: plan.crew, eventId: plan.eventId, planType: plan.planType, isLivestream: plan.isLivestream, customFields: plan.customFields })
      } catch {
        // non-blocking — local state already updated
      }
    }
  }, [realtimePlans, setTechPlans])
```

**Step 2: Add persistence when exiting edit mode**

Find the "Done Editing" button (search for `editingPlanId` setter that sets it to `null`). Before clearing `editingPlanId`, call `techPlansApi.update` for the currently edited plan with its current crew and customFields. If this is complex, a simpler approach: save immediately in `addCustomToPlan`, `updatePlanCustomField`, and `removePlanCustomField` the same way as Step 1.

**Step 3: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
git add src/pages/SportsWorkspace.tsx
git commit -m "fix: persist crew and custom field edits to backend in SportsWorkspace"
```

---

### Task 15: Fix `activeRole` derivation for `/import` and `/settings`

**Files:**
- Modify: `src/context/AppProvider.tsx:69-74`

**Context:**
When a user navigates to `/import` or `/settings`, `activeRole` falls through to `'planner'`, causing the settings effect to re-fetch planner settings and potentially overwrite the correct state.

**Step 1: Extend the `useMemo` to handle these paths without re-fetching settings**

The cleanest fix is to make the settings effect not re-run for non-role paths. Change the `useMemo`:

```typescript
  const activeRole = useMemo<Role>(() => {
    if (location.pathname.startsWith('/sports')) return 'sports'
    if (location.pathname.startsWith('/contracts')) return 'contracts'
    if (location.pathname.startsWith('/admin')) return 'admin'
    if (location.pathname.startsWith('/import')) return 'planner'   // no role-specific settings
    if (location.pathname.startsWith('/settings')) return 'admin'   // settings is admin territory
    return 'planner'
  }, [location.pathname])
```

This alone doesn't prevent duplicate fetches. Also add a `prevActiveRole` ref to the second effect to skip the fetch when the role hasn't actually changed:

```typescript
  const prevRoleRef = useRef<Role | null>(null)

  useEffect(() => {
    if (!user) return
    if (prevRoleRef.current === activeRole) return   // role unchanged, skip
    prevRoleRef.current = activeRole

    const fetchSettings = async () => {
      // ... rest of existing fetchSettings body unchanged
    }
    void fetchSettings()
  }, [activeRole, user])
```

Add `useRef` to the import at the top of the file.

**Step 2: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
git add src/context/AppProvider.tsx
git commit -m "fix: guard settings refetch on role change, handle /import and /settings paths"
```

---

### Task 16: Guard `hexToChannelColor` against invalid hex

**Files:**
- Modify: `src/pages/PlannerView.tsx:78-87`

**Context:**
If a channel's `color` field is missing or malformed, `parseInt` returns `NaN` and the resulting CSS color is `rgba(NaN,NaN,NaN,...)` which renders as transparent, making events invisible.

**Step 1: Add a guard at the top of `hexToChannelColor`**

```typescript
function hexToChannelColor(hex: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    // Fallback: a neutral mid-grey
    return { bg: 'rgba(100,100,100,0.15)', border: 'rgba(100,100,100,0.4)', text: '#555' }
  }
  // ... existing body unchanged
```

**Step 2: Make sure the return type is consistent** — the existing function should already return `{ bg, border, text }` shape. If not, match whatever shape consumers expect.

**Step 3: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
git add src/pages/PlannerView.tsx
git commit -m "fix: guard hexToChannelColor against invalid or missing hex values"
```

---

## WAVE 4 — Medium Severity Polish

---

### Task 17: Align `ContractsView` expiry threshold with webhook dispatch thresholds

**Files:**
- Modify: `src/pages/ContractsView.tsx:98-101`

**Context:**
The frontend flags contracts as "expiring soon" up to 365 days in advance, while webhooks fire only at 30/7/1 days. Users see false urgency for contracts that haven't triggered any notification.

**Step 1: Change the client-side threshold to 30 days**

Change:
```typescript
const expiringContracts = data.filter(c => {
  const d = daysUntil(c.validUntil)
  return d > 0 && d < 365
})
```

To:
```typescript
const expiringContracts = data.filter(c => {
  const d = daysUntil(c.validUntil)
  return d > 0 && d <= 30
})
```

**Step 2: Commit**

```bash
git add src/pages/ContractsView.tsx
git commit -m "fix: align expiry alert threshold with webhook dispatch window (30 days)"
```

---

### Task 18: Fix `validUntil` date comparison in `checkExpiringContracts`

**Files:**
- Modify: `backend/src/services/publishService.ts:192-194`

**Context:**
`where: { validUntil: dateStr }` compares a `timestamp` column to a bare date string (`"2026-04-01"`). PostgreSQL will reject or silently fail this depending on timezone and time component. The query should use a range for the target day.

**Step 1: Replace the equality filter with a day-range filter**

Change lines 192-194 from:
```typescript
    const contracts = await prisma.contract.findMany({
      where: { validUntil: dateStr, status: { in: ['valid', 'expiring'] } },
```

To:
```typescript
    const dayStart = new Date(targetDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(targetDate)
    dayEnd.setHours(23, 59, 59, 999)

    const contracts = await prisma.contract.findMany({
      where: {
        validUntil: { gte: dayStart, lte: dayEnd },
        status: { in: ['valid', 'expiring'] }
      },
```

**Step 2: Remove the now-unused `dateStr` variable**

Delete: `const dateStr = targetDate.toISOString().slice(0, 10)`

**Step 3: Compile check + commit**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
git add backend/src/services/publishService.ts
git commit -m "fix: use date range for contract expiry check to handle timestamp precision"
```

---

### Task 19: Final compile check across the entire project

**Step 1: Backend**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
```
Expected: zero errors.

**Step 2: Frontend**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```
Expected: zero errors.

**Step 3: If there are errors** — fix them before considering the plan complete. Do not skip past type errors.

---

## Summary of Changes by File

| File | Tasks |
|---|---|
| `backend/src/services/socket.ts` | Task 1 (JWT auth enforcement) |
| `backend/src/services/socketInstance.ts` | Task 10 (room-scoped emit) |
| `backend/src/services/publishService.ts` | Tasks 8, 9, 18 |
| `backend/src/routes/contracts.ts` | Tasks 2, 3 |
| `backend/src/routes/events.ts` | Tasks 6, 7, 10 |
| `backend/src/routes/techPlans.ts` | Tasks 5, 9, 10 |
| `backend/src/index.ts` | Tasks 4, 8 |
| `src/context/AppProvider.tsx` | Tasks 11, 12, 15 |
| `src/components/forms/DynamicEventForm.tsx` | Task 13 |
| `src/pages/SportsWorkspace.tsx` | Task 14 |
| `src/pages/PlannerView.tsx` | Task 16 |
| `src/pages/ContractsView.tsx` | Task 17 |

**Not in this plan (deferred — requires larger refactor):**
- Dual field system unification (FieldDefinition vs AppSetting JSON) — separate plan
- AppProvider context split (DataContext + ConfigContext) — separate plan
- JWT-in-URL OAuth fix — requires OAuth callback page changes
- Webhook secret hashing — requires migration

These are architectural changes that need their own design document.
