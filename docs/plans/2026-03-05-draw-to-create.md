# Draw-to-Create Events Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users draw time blocks on the PlannerView calendar to create events, drag across day headers for multi-day series, and use in-form repeat patterns.

**Architecture:** Three layers — (1) a `useDrawToCreate` hook managing pointer events + preview state on day columns, (2) a `useHeaderDrag` hook for multi-day header selection, (3) a `RepeatSection` collapsible in DynamicEventForm. A new `seriesId` field on Event links series events. A `POST /events/batch` backend endpoint creates multiple events atomically.

**Tech Stack:** React (pointer events), existing @dnd-kit (coexists), Prisma migration, Express batch route.

---

## Task 1: Add `seriesId` to Event model

**Files:**
- Modify: `backend/prisma/schema.prisma:97-146` (Event model)
- Create: `backend/prisma/migrations/XXXXXX_add_series_id/migration.sql` (auto-generated)
- Modify: `src/data/types.ts:37-71` (Event interface)

**Step 1: Add seriesId to Prisma Event model**

In `backend/prisma/schema.prisma`, add after `status` (line 131):

```prisma
  seriesId          String?
```

And add index:

```prisma
  @@index([seriesId])
```

**Step 2: Add seriesId to frontend Event type**

In `src/data/types.ts`, add to the Event interface after `status`:

```typescript
  seriesId?: string
```

**Step 3: Generate and apply migration**

Run:
```bash
cd backend && npx prisma migrate dev --name add_series_id
```

Expected: Migration created, applied to dev DB.

**Step 4: Update backend eventSchema validation**

In `backend/src/routes/events.ts`, add to `eventSchema` (around line 94):

```javascript
  seriesId: Joi.string().uuid().allow(null, ''),
```

**Step 5: Commit**

```bash
git add backend/prisma/ src/data/types.ts backend/src/routes/events.ts
git commit -m "feat: add seriesId field to Event model"
```

---

## Task 2: Add `POST /events/batch` backend endpoint

**Files:**
- Modify: `backend/src/routes/events.ts` (add batch route)
- Modify: `src/services/events.ts` (add batchCreate method)

**Step 1: Add batch route to backend**

In `backend/src/routes/events.ts`, add after the `POST /` route (after line 416):

```typescript
const batchCreateSchema = Joi.object({
  events: Joi.array().items(eventSchema).min(1).max(100).required(),
  seriesId: Joi.string().uuid().allow(null, ''),
})

router.post('/batch', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = batchCreateSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const user = req.user as { id: string }
    const { events: eventPayloads, seriesId } = value

    const created = await prisma.$transaction(async (tx) => {
      const results = []
      for (const payload of eventPayloads) {
        const { customValues, ...eventData } = payload
        const event = await tx.event.create({
          data: {
            ...eventData,
            seriesId: seriesId || null,
            startDateBE: new Date(eventData.startDateBE),
            startDateOrigin: eventData.startDateOrigin ? new Date(eventData.startDateOrigin) : null,
            livestreamDate: eventData.livestreamDate ? new Date(eventData.livestreamDate) : null,
            createdById: user.id,
          },
          include: { sport: true, competition: true },
        })

        const cvList = customValues as { fieldId: string; fieldValue: string }[]
        if (cvList.length > 0) {
          await Promise.all(
            cvList.map(({ fieldId, fieldValue }) =>
              tx.customFieldValue.upsert({
                where: { entityType_entityId_fieldId: { entityType: 'event', entityId: String(event.id), fieldId } },
                create: { entityType: 'event', entityId: String(event.id), fieldId, fieldValue },
                update: { fieldValue },
              })
            )
          )
        }

        results.push(event)
      }
      return results
    })

    for (const event of created) {
      emit('event:created', event, 'events')
      void publishService.dispatch('event.created', event)
    }

    await writeAuditLog({
      userId: user.id,
      action: 'event.batch_create',
      entityType: 'event',
      entityId: created.map(e => String(e.id)).join(','),
      newValue: { count: created.length, seriesId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(201).json(created)
  } catch (error) {
    next(error)
  }
})
```

**Step 2: Add batchCreate to frontend events service**

In `src/services/events.ts`, add method:

```typescript
  batchCreate(events: Partial<Event>[], seriesId?: string): Promise<Event[]> {
    return api.post('/events/batch', { events, seriesId })
  },
```

**Step 3: Commit**

```bash
git add backend/src/routes/events.ts src/services/events.ts
git commit -m "feat: add POST /events/batch endpoint for series creation"
```

---

## Task 3: Create `useDrawToCreate` hook

**Files:**
- Create: `src/hooks/useDrawToCreate.ts`

This hook handles the draw-on-empty-space gesture for a single day column.

**Step 1: Create the hook**

```typescript
import { useState, useRef, useCallback } from 'react'

const SNAP_MINUTES = 5
const MIN_DRAG_MINUTES = 15

interface DrawState {
  /** The day column's date string (YYYY-MM-DD) */
  date: string
  /** Top of selection in minutes from midnight */
  startMin: number
  /** Bottom of selection in minutes from midnight */
  endMin: number
  /** Whether the user is actively dragging */
  active: boolean
}

interface DrawResult {
  date: string
  startTime: string     // HH:MM
  durationMinutes: number
}

interface UseDrawToCreateOptions {
  calStartHour: number
  pxPerHour: number
  enabled: boolean
}

function snapTo5(min: number): number {
  return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function useDrawToCreate({ calStartHour, pxPerHour, enabled }: UseDrawToCreateOptions) {
  const [draw, setDraw] = useState<DrawState | null>(null)
  const anchorRef = useRef<{ date: string; min: number } | null>(null)

  const pxToMin = useCallback(
    (px: number) => snapTo5(calStartHour * 60 + (px / pxPerHour) * 60),
    [calStartHour, pxPerHour]
  )

  const onPointerDown = useCallback(
    (date: string, e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return
      // Only primary button, only on empty space (not on event cards)
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('[data-event-card]')) return

      const rect = e.currentTarget.getBoundingClientRect()
      const y = e.clientY - rect.top
      const min = pxToMin(y)
      anchorRef.current = { date, min }
      setDraw({ date, startMin: min, endMin: min, active: true })
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [enabled, pxToMin]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!anchorRef.current) return
      const rect = e.currentTarget.getBoundingClientRect()
      const y = e.clientY - rect.top
      const currentMin = pxToMin(y)
      const anchorMin = anchorRef.current.min
      setDraw({
        date: anchorRef.current.date,
        startMin: Math.min(anchorMin, currentMin),
        endMin: Math.max(anchorMin, currentMin),
        active: true,
      })
    },
    [pxToMin]
  )

  const onPointerUp = useCallback((): DrawResult | null => {
    const anchor = anchorRef.current
    const current = draw
    anchorRef.current = null

    if (!anchor || !current) {
      setDraw(null)
      return null
    }

    const duration = current.endMin - current.startMin
    if (duration < MIN_DRAG_MINUTES) {
      setDraw(null)
      return null
    }

    setDraw(null)
    return {
      date: current.date,
      startTime: minutesToTime(current.startMin),
      durationMinutes: duration,
    }
  }, [draw])

  const cancel = useCallback(() => {
    anchorRef.current = null
    setDraw(null)
  }, [])

  return { draw, onPointerDown, onPointerMove, onPointerUp, cancel }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useDrawToCreate.ts
git commit -m "feat: useDrawToCreate hook for time-range drawing on calendar"
```

---

## Task 4: Integrate draw-to-create into CalendarGrid

**Files:**
- Modify: `src/pages/PlannerView.tsx` (CalendarGrid component, ~lines 930-1149)

**Step 1: Add draw state to PlannerView**

In the main `PlannerView` component (around line 164), add imports and state:

```typescript
import { useDrawToCreate } from '../hooks/useDrawToCreate'
```

After `const [detailEvent, setDetailEvent] = useState<Event | null>(null)` (line 176), add:

```typescript
const [drawPrefill, setDrawPrefill] = useState<{ startDateBE: string; startTimeBE: string; duration: string } | null>(null)
```

**Step 2: Wire useDrawToCreate in CalendarGrid**

Add to `CalendarGridProps`:

```typescript
onDrawCreate?: (result: { date: string; startTime: string; durationMinutes: number }) => void
```

Inside `CalendarGrid`, instantiate the hook:

```typescript
const drawToCreate = useDrawToCreate({
  calStartHour: CAL_START_HOUR,
  pxPerHour: PX_PER_HOUR,
  enabled: !selectionMode && !!onDrawCreate,
})
```

**Step 3: Add pointer event handlers to day columns**

On the inner div of each day column (the one with `className="relative border-l..."`, around line 1036-1042), add pointer event handlers:

```tsx
onPointerDown={(e) => drawToCreate.onPointerDown(ds, e)}
onPointerMove={drawToCreate.onPointerMove}
onPointerUp={() => {
  const result = drawToCreate.onPointerUp()
  if (result) onDrawCreate?.(result)
}}
```

**Step 4: Render the preview rectangle**

Inside each day column (after the current time indicator, around line 1053), add:

```tsx
{drawToCreate.draw && drawToCreate.draw.date === ds && drawToCreate.draw.active && (() => {
  const topPx = (drawToCreate.draw.startMin - CAL_START_HOUR * 60) * (PX_PER_HOUR / 60)
  const heightPx = (drawToCreate.draw.endMin - drawToCreate.draw.startMin) * (PX_PER_HOUR / 60)
  const label = `${minutesToTime(drawToCreate.draw.startMin)} – ${minutesToTime(drawToCreate.draw.endMin)}`
  return (
    <div
      className="absolute left-1 right-1 rounded bg-primary/20 border-2 border-primary/50 pointer-events-none z-20 flex items-start justify-center"
      style={{ top: topPx, height: Math.max(heightPx, 2) }}
    >
      {heightPx > 15 && (
        <span className="text-xs font-mono text-primary bg-surface/80 rounded px-1 mt-1">
          {label}
        </span>
      )}
    </div>
  )
})()}
```

You'll need a helper at the top of CalendarGrid or import from the hook:

```typescript
function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
```

**Step 5: Add `data-event-card` attribute to event cards**

On the event card div (line 1067, the one with `className="absolute left-1 right-1 rounded..."`), add:

```tsx
data-event-card="true"
```

This prevents draw-to-create from triggering when clicking/dragging on an event.

**Step 6: Pass onDrawCreate from PlannerView to CalendarGrid**

In the PlannerView JSX where CalendarGrid is rendered (around line 780), add the prop:

```tsx
onDrawCreate={(result) => {
  const durMin = result.durationMinutes
  const h = Math.floor(durMin / 60)
  const m = durMin % 60
  const s = 0
  const smpte = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')};00`
  setDrawPrefill({
    startDateBE: result.date,
    startTimeBE: result.startTime,
    duration: smpte,
  })
  setEditEvent(null)
  // Trigger form open via the parent callback
  onEventClick?.({ ...({} as Event), startDateBE: result.date, startTimeBE: result.startTime, duration: smpte, _drawCreate: true } as any)
}}
```

Wait — the form is opened via `onEventClick` in App.tsx which sets `editEvent` and `showEventForm`. We need a different approach. The draw result should open the form for a new event, pre-filled.

**Better approach:** Add a new callback prop `onDrawCreate` to PlannerView that surfaces to App.tsx.

In PlannerView props, add:

```typescript
onDrawCreate?: (prefill: { startDateBE: string; startTimeBE: string; duration: string }) => void
```

In the CalendarGrid prop wiring:

```tsx
onDrawCreate={(result) => {
  const durMin = result.durationMinutes
  const h = Math.floor(durMin / 60)
  const m = durMin % 60
  const smpte = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00;00`
  onDrawCreate?.({ startDateBE: result.date, startTimeBE: result.startTime, duration: smpte })
}}
```

**Step 7: Handle drawCreate in App.tsx**

In `src/App.tsx`, where PlannerView is rendered (around line 111):

```tsx
<PlannerView
  widgets={currentWidgets}
  loading={loading}
  onEventClick={(ev) => { setEditEvent(ev); setShowEventForm(true) }}
  scrollToDate={scrollToDate}
  onDrawCreate={(prefill) => {
    setEditEvent({ ...prefill, id: 0 } as any)
    setShowEventForm(true)
  }}
/>
```

Wait — `editEvent` being truthy means "edit mode" in DynamicEventForm (it uses `editEvent?.id` to decide create vs update, and `editEvent?.id || genId()` for the id). We need a dedicated `prefill` prop.

**Step 8: Add `prefill` prop to DynamicEventForm**

In `src/components/forms/DynamicEventForm.tsx`, add to props:

```typescript
interface DynamicEventFormProps {
  eventFields: FieldConfig[]
  onClose: () => void
  onSave: (event: Event) => void
  editEvent?: Event | null
  prefill?: Partial<Record<string, string>> | null
}
```

In the `initForm` function, after the existing logic (line 76), merge prefill values:

```typescript
if (prefill) {
  Object.entries(prefill).forEach(([key, value]) => {
    if (value !== undefined) f[key] = value
  })
}
```

In App.tsx, add state:

```typescript
const [eventPrefill, setEventPrefill] = useState<Partial<Record<string, string>> | null>(null)
```

Pass to DynamicEventForm:

```tsx
<DynamicEventForm
  eventFields={eventFields}
  onClose={() => {
    setShowEventForm(false)
    setEditEvent(null)
    setEventPrefill(null)
  }}
  onSave={...}
  editEvent={editEvent}
  prefill={eventPrefill}
/>
```

Handle `onDrawCreate` in PlannerView rendering:

```tsx
onDrawCreate={(prefill) => {
  setEditEvent(null)
  setEventPrefill(prefill)
  setShowEventForm(true)
}}
```

**Step 9: Commit**

```bash
git add src/hooks/useDrawToCreate.ts src/pages/PlannerView.tsx src/App.tsx src/components/forms/DynamicEventForm.tsx
git commit -m "feat: draw-to-create single event on calendar day columns"
```

---

## Task 5: Multi-day header selection (`useHeaderDrag` hook)

**Files:**
- Create: `src/hooks/useHeaderDrag.ts`

**Step 1: Create the hook**

```typescript
import { useState, useRef, useCallback } from 'react'

interface HeaderDragState {
  /** Indices of selected day columns (0-6 for Mon-Sun) */
  selectedIndices: number[]
  /** Dates corresponding to selected indices */
  selectedDates: string[]
  /** Whether header drag is active */
  active: boolean
}

export function useHeaderDrag(weekDays: Date[], dateStr: (d: Date) => string) {
  const [state, setState] = useState<HeaderDragState | null>(null)
  const anchorIdx = useRef<number | null>(null)

  const onHeaderPointerDown = useCallback((dayIdx: number, e: React.PointerEvent) => {
    if (e.button !== 0) return
    anchorIdx.current = dayIdx
    const dates = [dateStr(weekDays[dayIdx])]
    setState({ selectedIndices: [dayIdx], selectedDates: dates, active: true })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [weekDays, dateStr])

  const onHeaderPointerMove = useCallback((dayIdx: number) => {
    if (anchorIdx.current === null) return
    const start = Math.min(anchorIdx.current, dayIdx)
    const end = Math.max(anchorIdx.current, dayIdx)
    const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i)
    const dates = indices.map(i => dateStr(weekDays[i]))
    setState({ selectedIndices: indices, selectedDates: dates, active: true })
  }, [weekDays, dateStr])

  const onHeaderPointerUp = useCallback((): string[] | null => {
    anchorIdx.current = null
    if (!state || state.selectedDates.length < 2) {
      setState(null)
      return null
    }
    // Keep selection but mark inactive — waiting for time draw
    setState(prev => prev ? { ...prev, active: false } : null)
    return state.selectedDates
  }, [state])

  const cancel = useCallback(() => {
    anchorIdx.current = null
    setState(null)
  }, [])

  const confirm = useCallback(() => {
    const dates = state?.selectedDates ?? []
    setState(null)
    return dates
  }, [state])

  return { headerState: state, onHeaderPointerDown, onHeaderPointerMove, onHeaderPointerUp, cancel, confirm }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useHeaderDrag.ts
git commit -m "feat: useHeaderDrag hook for multi-day header selection"
```

---

## Task 6: Integrate header drag + time draw into CalendarGrid

**Files:**
- Modify: `src/pages/PlannerView.tsx`
- Modify: `src/App.tsx`

**Step 1: Add header drag to CalendarGrid**

Import the hook and add a new prop:

```typescript
import { useHeaderDrag } from '../hooks/useHeaderDrag'
```

Add to CalendarGridProps:

```typescript
onMultiDayCreate?: (result: { dates: string[]; startTime: string; durationMinutes: number }) => void
```

Inside CalendarGrid, instantiate:

```typescript
const headerDrag = useHeaderDrag(weekDays, dateStr)
```

**Step 2: Add pointer events to day headers**

On each day header div (around line 989-1003), add pointer events:

```tsx
<div
  key={ds}
  className={`bg-surface-2 border-b border-border border-l border-l-border px-2 py-2 text-center cursor-pointer select-none ${
    headerDrag.headerState?.selectedIndices.includes(i) ? 'ring-2 ring-primary ring-inset bg-primary/10' : ''
  }`}
  onPointerDown={(e) => headerDrag.onHeaderPointerDown(i, e)}
  onPointerMove={() => headerDrag.onHeaderPointerMove(i)}
  onPointerUp={() => headerDrag.onHeaderPointerUp()}
>
```

**Step 3: Modify draw-to-create to handle multi-day mode**

When `headerDrag.headerState` is non-null and not active (meaning headers are selected, waiting for time draw), the draw-to-create's `onPointerUp` result should combine with the selected dates:

In the `onPointerUp` handler on day columns:

```typescript
onPointerUp={() => {
  const result = drawToCreate.onPointerUp()
  if (!result) return
  if (headerDrag.headerState && !headerDrag.headerState.active) {
    // Multi-day mode: apply drawn time to all selected days
    const dates = headerDrag.confirm()
    if (dates.length > 0) {
      onMultiDayCreate?.({ dates, startTime: result.startTime, durationMinutes: result.durationMinutes })
    }
  } else {
    onDrawCreate?.(result)
  }
}}
```

**Step 4: Add Escape handler to cancel header selection**

In CalendarGrid, add an effect:

```typescript
useEffect(() => {
  if (!headerDrag.headerState) return
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') headerDrag.cancel()
  }
  window.addEventListener('keydown', handleKey)
  return () => window.removeEventListener('keydown', handleKey)
}, [headerDrag.headerState, headerDrag.cancel])
```

**Step 5: Show "N days selected" indicator**

When header state exists, show a floating badge above the calendar:

```tsx
{headerDrag.headerState && !headerDrag.headerState.active && (
  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-primary text-black text-xs font-bold px-3 py-1 rounded-full shadow">
    {headerDrag.headerState.selectedDates.length} days selected — draw a time block
  </div>
)}
```

**Step 6: Pass onMultiDayCreate from PlannerView**

Add to PlannerView props:

```typescript
onMultiDayCreate?: (prefill: { dates: string[]; startTimeBE: string; duration: string }) => void
```

Wire it:

```tsx
onMultiDayCreate={(result) => {
  const durMin = result.durationMinutes
  const h = Math.floor(durMin / 60)
  const m = durMin % 60
  const smpte = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00;00`
  onMultiDayCreate?.({ dates: result.dates, startTimeBE: result.startTime, duration: smpte })
}}
```

**Step 7: Handle in App.tsx**

Add state for multi-day prefill:

```typescript
const [multiDayPrefill, setMultiDayPrefill] = useState<{ dates: string[]; startTimeBE: string; duration: string } | null>(null)
```

Pass to PlannerView:

```tsx
onMultiDayCreate={(prefill) => {
  setEditEvent(null)
  setMultiDayPrefill(prefill)
  setEventPrefill({ startTimeBE: prefill.startTimeBE, duration: prefill.duration })
  setShowEventForm(true)
}}
```

Pass `multiDayPrefill` to DynamicEventForm (see Task 7 for handling).

**Step 8: Commit**

```bash
git add src/hooks/useHeaderDrag.ts src/pages/PlannerView.tsx src/App.tsx
git commit -m "feat: multi-day header drag selection for series creation"
```

---

## Task 7: Add series banner + batch save to DynamicEventForm

**Files:**
- Modify: `src/components/forms/DynamicEventForm.tsx`
- Modify: `src/App.tsx`

**Step 1: Add multiDayDates prop**

```typescript
interface DynamicEventFormProps {
  eventFields: FieldConfig[]
  onClose: () => void
  onSave: (event: Event) => void
  onBatchSave?: (events: Partial<Event>[], seriesId: string) => void
  editEvent?: Event | null
  prefill?: Partial<Record<string, string>> | null
  multiDayDates?: string[] | null
}
```

**Step 2: Show series banner when multiDayDates is set**

At the top of the modal content (after the title), add:

```tsx
{multiDayDates && multiDayDates.length > 1 && (
  <div className="bg-primary/10 border border-primary/30 rounded px-3 py-2 mb-4 text-sm">
    <span className="font-bold text-primary">Series</span>
    <span className="text-text-2 ml-2">
      Creating events on{' '}
      {multiDayDates.map(d =>
        new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      ).join(', ')}
    </span>
  </div>
)}
```

**Step 3: Modify handleSave for batch mode**

After the existing `onSave(event)` / `onClose()` at the end of handleSave (line 236), wrap:

```typescript
if (multiDayDates && multiDayDates.length > 1 && onBatchSave) {
  const seriesId = crypto.randomUUID()
  const events = multiDayDates.map(date => ({
    ...event,
    id: undefined,
    startDateBE: date,
    seriesId,
  }))
  onBatchSave(events as Partial<Event>[], seriesId)
  onClose()
  return
}

onSave(event)
onClose()
```

**Step 4: Wire onBatchSave in App.tsx**

```tsx
<DynamicEventForm
  eventFields={eventFields}
  onClose={() => {
    setShowEventForm(false)
    setEditEvent(null)
    setEventPrefill(null)
    setMultiDayPrefill(null)
  }}
  onSave={async (ev) => {
    const isCreate = !editEvent
    const saved = await handleSaveEvent(ev)
    if (isCreate && saved) {
      const rawDate = saved.startDateBE
      const dateStr = typeof rawDate === 'string' ? rawDate.split('T')[0] : (rawDate as Date).toISOString().split('T')[0]
      setScrollToDate(dateStr)
      setTimeout(() => setScrollToDate(null), 100)
    }
  }}
  onBatchSave={async (events, seriesId) => {
    try {
      const created = await eventsApi.batchCreate(events, seriesId)
      setEvents(prev => [...prev, ...(created as Event[])])
      if (created.length > 0) {
        const firstDate = typeof created[0].startDateBE === 'string'
          ? created[0].startDateBE.split('T')[0]
          : (created[0].startDateBE as Date).toISOString().split('T')[0]
        setScrollToDate(firstDate)
        setTimeout(() => setScrollToDate(null), 100)
      }
    } catch {
      toast.error('Failed to create event series')
    }
  }}
  editEvent={editEvent}
  prefill={eventPrefill}
  multiDayDates={multiDayPrefill?.dates}
/>
```

You'll need to import `eventsApi` in App.tsx if not already imported, and add the `toast` hook.

**Step 5: Commit**

```bash
git add src/components/forms/DynamicEventForm.tsx src/App.tsx
git commit -m "feat: series banner and batch save in DynamicEventForm"
```

---

## Task 8: Add RepeatSection to DynamicEventForm

**Files:**
- Create: `src/components/forms/RepeatSection.tsx`
- Modify: `src/components/forms/DynamicEventForm.tsx`

**Step 1: Create RepeatSection component**

```typescript
import { useState, useMemo } from 'react'

type RepeatType = 'none' | 'daily' | 'weekdays' | 'every_n_days'

interface RepeatSectionProps {
  startDate: string           // YYYY-MM-DD from form
  onDatesChange: (dates: string[]) => void
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function addDaysToDate(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getDay() === 0 ? 6 : d.getDay() - 1 // Mon=0..Sun=6
}

export function RepeatSection({ startDate, onDatesChange }: RepeatSectionProps) {
  const [repeatType, setRepeatType] = useState<RepeatType>('none')
  const [selectedDays, setSelectedDays] = useState<boolean[]>([false, false, false, false, false, false, false])
  const [everyN, setEveryN] = useState(2)
  const [untilDate, setUntilDate] = useState('')
  const [expanded, setExpanded] = useState(false)

  const dates = useMemo(() => {
    if (repeatType === 'none' || !startDate || !untilDate) return []
    const result: string[] = []
    const maxDate = untilDate

    if (repeatType === 'daily') {
      let current = startDate
      while (current <= maxDate) {
        result.push(current)
        current = addDaysToDate(current, 1)
      }
    } else if (repeatType === 'weekdays') {
      let current = startDate
      while (current <= maxDate) {
        const dow = getDayOfWeek(current)
        if (selectedDays[dow]) result.push(current)
        current = addDaysToDate(current, 1)
      }
    } else if (repeatType === 'every_n_days') {
      let current = startDate
      while (current <= maxDate) {
        result.push(current)
        current = addDaysToDate(current, everyN)
      }
    }

    return result.slice(0, 100) // Safety cap
  }, [repeatType, startDate, untilDate, selectedDays, everyN])

  // Propagate date list up whenever it changes
  useMemo(() => {
    onDatesChange(dates)
  }, [dates, onDatesChange])

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-xs text-primary hover:underline mb-2"
      >
        + Add repeat pattern
      </button>
    )
  }

  return (
    <div className="border border-border rounded p-3 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-3 uppercase tracking-wider">Repeat</span>
        <button type="button" onClick={() => { setExpanded(false); setRepeatType('none'); onDatesChange([]) }} className="text-xs text-muted hover:text-text">
          Remove
        </button>
      </div>

      <select
        className="inp text-sm w-full"
        value={repeatType}
        onChange={e => setRepeatType(e.target.value as RepeatType)}
      >
        <option value="none">None</option>
        <option value="daily">Daily</option>
        <option value="weekdays">Specific weekdays</option>
        <option value="every_n_days">Every N days</option>
      </select>

      {repeatType === 'weekdays' && (
        <div className="flex gap-1">
          {DAY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                const next = [...selectedDays]
                next[i] = !next[i]
                setSelectedDays(next)
              }}
              className={`px-2 py-1 text-xs rounded border transition ${
                selectedDays[i]
                  ? 'bg-primary/20 border-primary text-primary font-bold'
                  : 'border-border text-text-3 hover:border-text-3'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {repeatType === 'every_n_days' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-2">Every</span>
          <input
            type="number"
            min={2}
            max={30}
            value={everyN}
            onChange={e => setEveryN(Math.max(2, Number(e.target.value)))}
            className="inp text-sm w-16 px-2 py-1"
          />
          <span className="text-xs text-text-2">days</span>
        </div>
      )}

      {repeatType !== 'none' && (
        <div>
          <label className="block text-xs text-text-3 mb-1">Until (required)</label>
          <input
            type="date"
            className="inp text-sm w-full px-2 py-1"
            value={untilDate}
            min={startDate || undefined}
            onChange={e => setUntilDate(e.target.value)}
          />
        </div>
      )}

      {dates.length > 0 && (
        <div className="text-xs text-text-2 bg-surface-2 rounded p-2 max-h-32 overflow-auto">
          <span className="font-bold">{dates.length} events:</span>{' '}
          {dates.map(d =>
            new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
          ).join(', ')}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Integrate into DynamicEventForm**

Import RepeatSection. Add state:

```typescript
const [repeatDates, setRepeatDates] = useState<string[]>([])
```

Render the RepeatSection in the form (only when creating, not editing):

```tsx
{!editEvent && (
  <RepeatSection
    startDate={form.startDateBE as string}
    onDatesChange={setRepeatDates}
  />
)}
```

Place it after the duration field area, before the submit buttons.

**Step 3: Handle repeat dates in handleSave**

Before the `onSave(event)` call, check if repeat dates exist:

```typescript
if (repeatDates.length > 1 && onBatchSave) {
  const seriesId = crypto.randomUUID()
  const events = repeatDates.map(date => ({
    ...event,
    id: undefined,
    startDateBE: date,
    seriesId,
  }))
  onBatchSave(events as Partial<Event>[], seriesId)
  onClose()
  return
}
```

This shares the same batch path as multi-day header selection.

**Step 4: Commit**

```bash
git add src/components/forms/RepeatSection.tsx src/components/forms/DynamicEventForm.tsx
git commit -m "feat: RepeatSection pattern-based event series in form"
```

---

## Task 9: Prevent draw conflicts with @dnd-kit drag

**Files:**
- Modify: `src/pages/PlannerView.tsx`

The draw-to-create uses `onPointerDown` on the day column's inner div. The @dnd-kit `useDraggable` on event cards uses its own listeners. Since draw-to-create checks `target.closest('[data-event-card]')` and bails out, they should coexist. However, there's a subtle issue: `DndContext` also listens for pointer events.

**Step 1: Ensure draw-to-create only fires on empty space**

The `data-event-card` attribute added in Task 4 Step 5 handles this. Verify that `DraggableEventCard` wraps the card content and that pointer events on event cards don't propagate to the column's onPointerDown.

Add `e.stopPropagation()` to the `DraggableEventCard` wrapper's pointer events if needed. In practice, @dnd-kit handles this via its own activation constraints.

**Step 2: Add distance activation to DndContext**

To prevent accidental drags when the user intends to draw, add a `PointerSensor` with activation distance:

```typescript
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
```

In PlannerView:

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
)
```

Pass to DndContext:

```tsx
<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
```

This means the user must drag 8px before @dnd-kit activates, giving the draw-to-create gesture priority on empty space.

**Step 3: Commit**

```bash
git add src/pages/PlannerView.tsx
git commit -m "fix: prevent draw-to-create conflicts with dnd-kit drag"
```

---

## Task 10: Manual testing & edge cases

**Step 1: Verify single draw-to-create**

1. Open PlannerView in calendar mode
2. Click and drag on empty space in a day column
3. Verify preview rectangle appears with time tooltip
4. Release — form opens with date, time, duration pre-filled
5. Submit — event appears on the calendar

**Step 2: Verify minimum drag distance**

1. Click on empty space and release quickly (no drag or < 15min)
2. Verify nothing happens (no form opens)

**Step 3: Verify event clicks still work**

1. Click on an existing event card
2. EventDetailPanel opens as before

**Step 4: Verify event drag-to-reschedule still works**

1. Drag an existing event card to another day column
2. Event reschedules as before

**Step 5: Verify multi-day header selection**

1. Click and drag across 3 day headers
2. Headers highlight, "3 days selected" badge shows
3. Draw a time block on one of the selected days
4. Form opens with series banner showing all 3 dates
5. Submit — 3 events created

**Step 6: Verify Escape cancels header selection**

1. Select headers via drag
2. Press Escape
3. Selection clears, back to normal

**Step 7: Verify repeat pattern**

1. Open new event form (via + button or draw)
2. Click "+ Add repeat pattern"
3. Select "Specific weekdays", toggle Mon + Wed + Fri
4. Set "Until" date 2 weeks ahead
5. Preview shows ~6 dates
6. Submit — all events created

**Step 8: Verify selection mode disables draw**

1. Enter selection mode
2. Try to draw on empty space — nothing happens

**Step 9: Commit final state**

```bash
git add -A
git commit -m "feat: draw-to-create events complete with series and repeat"
```

---

## Implementation Order Summary

| Task | Description | Depends on |
|------|-------------|------------|
| 1 | seriesId field | — |
| 2 | POST /events/batch | 1 |
| 3 | useDrawToCreate hook | — |
| 4 | Integrate draw into CalendarGrid | 3 |
| 5 | useHeaderDrag hook | — |
| 6 | Integrate header drag | 4, 5 |
| 7 | Series banner + batch save | 2, 4 |
| 8 | RepeatSection component | 7 |
| 9 | Prevent dnd-kit conflicts | 4 |
| 10 | Manual testing | all |

Tasks 1, 3, 5 can be done in parallel. Tasks 2 depends on 1. Tasks 4 and 9 depend on 3. Task 6 depends on 4+5. Task 7 depends on 2+4. Task 8 depends on 7.
