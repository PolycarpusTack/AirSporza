# "Add to Planning" Channel Assignment — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add channel assignment UI to EventDetailCard so Sports users can schedule events onto broadcast channels.

**Architecture:** Extend EventDetailCard with a channel status section and edit popover. SportsWorkspace passes orgConfig and an update callback from AppProvider. The popover patches linearChannel, linearStartTime, onDemandChannel, and radioChannel on the event.

**Tech Stack:** React, TypeScript, existing BB design tokens, existing eventsApi

---

### Task 1: Extend EventDetailCard with channel section + popover

**Files:**
- Modify: `src/components/sports/EventDetailCard.tsx`

**Context:**
- `EventDetailCard` currently shows event metadata in a card. Channel/radio are shown as plain text in a 4-column grid.
- `OrgConfig` type (from `src/data/types.ts`): `{ channels: ChannelConfig[], onDemandChannels: ChannelConfig[], radioChannels: string[] }` where `ChannelConfig = { name: string, color: string }`.
- Event fields: `linearChannel?: string`, `linearStartTime?: string`, `onDemandChannel?: string`, `radioChannel?: string`.
- Use `useState` for popover open/close and local form state.
- The component uses BB design tokens: `card`, `bg-surface-2`, `text-text-2`, `border-border`, `inp` (input class).
- `Btn` from `../ui` for buttons. `Badge` already imported.

**Step 1: Update the component**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { Tv, Radio, MonitorPlay, Clock } from 'lucide-react'
import { Badge, Btn } from '../ui'
import type { Event, Sport, Competition, OrgConfig } from '../../data/types'
import { fmtDate } from '../../utils'

interface ChannelUpdate {
  linearChannel?: string
  linearStartTime?: string
  onDemandChannel?: string
  radioChannel?: string
}

interface EventDetailCardProps {
  event: Event
  sport?: Sport
  competition?: Competition
  orgConfig?: OrgConfig
  canEdit?: boolean
  onUpdateChannels?: (eventId: number, channels: ChannelUpdate) => void
}

export function EventDetailCard({ event, sport, competition, orgConfig, canEdit, onUpdateChannels }: EventDetailCardProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [form, setForm] = useState<ChannelUpdate>({
    linearChannel: event.linearChannel ?? '',
    linearStartTime: event.linearStartTime ?? '',
    onDemandChannel: event.onDemandChannel ?? '',
    radioChannel: event.radioChannel ?? '',
  })

  const hasChannels = event.linearChannel || event.onDemandChannel || event.radioChannel

  const handleSave = () => {
    onUpdateChannels?.(event.id, form)
    setShowPicker(false)
  }

  const handleOpen = () => {
    setForm({
      linearChannel: event.linearChannel ?? '',
      linearStartTime: event.linearStartTime ?? '',
      onDemandChannel: event.onDemandChannel ?? '',
      radioChannel: event.radioChannel ?? '',
    })
    setShowPicker(true)
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{sport?.icon}</span>
            <h3 className="font-bold text-xl">{event.participants}</h3>
          </div>
          <div className="meta">{competition?.name} - {event.phase} - {event.complex}</div>
        </div>
        <div className="flex gap-2">
          {event.isLive && <Badge variant="live">LIVE</Badge>}
          {event.isDelayedLive && <Badge variant="warning">DELAYED</Badge>}
          {event.category && <Badge>{event.category}</Badge>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
        <div><div className="text-xs uppercase tracking-wide text-text-2">Date (BE)</div><div className="text-sm font-medium">{fmtDate(event.startDateBE)}</div></div>
        <div><div className="text-xs uppercase tracking-wide text-text-2">Time (BE)</div><div className="font-mono text-sm font-semibold">{event.startTimeBE}</div></div>
        <div><div className="text-xs uppercase tracking-wide text-text-2">Channel</div><div className="text-sm font-medium">{event.linearChannel || '—'}</div></div>
        <div><div className="text-xs uppercase tracking-wide text-text-2">Radio</div><div className="text-sm font-medium">{event.radioChannel || '—'}</div></div>
      </div>

      {/* Channel assignment section */}
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold uppercase tracking-wider text-text-2">Broadcast Planning</div>
          {canEdit && onUpdateChannels && (
            <Btn variant="ghost" size="xs" onClick={handleOpen}>
              {hasChannels ? 'Edit Channels' : 'Add to Planning'}
            </Btn>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {event.linearChannel ? (
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1">
              <Tv className="w-3 h-3 text-text-2" />
              <span className="text-xs font-medium">{event.linearChannel}</span>
              {event.linearStartTime && (
                <span className="text-xs text-text-3 font-mono ml-1">{event.linearStartTime}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1">
              <Tv className="w-3 h-3 text-text-3" />
              <span className="text-xs text-text-3">No linear channel</span>
            </div>
          )}
          {event.onDemandChannel ? (
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1">
              <MonitorPlay className="w-3 h-3 text-text-2" />
              <span className="text-xs font-medium">{event.onDemandChannel}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1">
              <MonitorPlay className="w-3 h-3 text-text-3" />
              <span className="text-xs text-text-3">No on-demand</span>
            </div>
          )}
          {event.radioChannel ? (
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1">
              <Radio className="w-3 h-3 text-text-2" />
              <span className="text-xs font-medium">{event.radioChannel}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1">
              <Radio className="w-3 h-3 text-text-3" />
              <span className="text-xs text-text-3">No radio</span>
            </div>
          )}
        </div>
      </div>

      {/* Channel picker popover */}
      {showPicker && orgConfig && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-text-2 mb-1 block">
                <Tv className="w-3 h-3 inline mr-1" />Linear Channel
              </label>
              <select
                value={form.linearChannel}
                onChange={e => setForm(f => ({ ...f, linearChannel: e.target.value }))}
                className="inp w-full"
              >
                <option value="">— None —</option>
                {orgConfig.channels.map(ch => (
                  <option key={ch.name} value={ch.name}>{ch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-text-2 mb-1 block">
                <Clock className="w-3 h-3 inline mr-1" />Linear Start Time
              </label>
              <input
                type="time"
                value={form.linearStartTime}
                onChange={e => setForm(f => ({ ...f, linearStartTime: e.target.value }))}
                className="inp w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-text-2 mb-1 block">
                <MonitorPlay className="w-3 h-3 inline mr-1" />On-demand Platform
              </label>
              <select
                value={form.onDemandChannel}
                onChange={e => setForm(f => ({ ...f, onDemandChannel: e.target.value }))}
                className="inp w-full"
              >
                <option value="">— None —</option>
                {orgConfig.onDemandChannels.map(ch => (
                  <option key={ch.name} value={ch.name}>{ch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-text-2 mb-1 block">
                <Radio className="w-3 h-3 inline mr-1" />Radio Channel
              </label>
              <select
                value={form.radioChannel}
                onChange={e => setForm(f => ({ ...f, radioChannel: e.target.value }))}
                className="inp w-full"
              >
                <option value="">— None —</option>
                {orgConfig.radioChannels.map(ch => (
                  <option key={ch} value={ch}>{ch}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Btn size="sm" onClick={handleSave}>Save</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowPicker(false)}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (new props are optional so existing callers still work)

**Step 3: Commit**

```bash
git add src/components/sports/EventDetailCard.tsx
git commit -m "feat: add channel assignment section + popover to EventDetailCard"
```

---

### Task 2: Wire into SportsWorkspace

**Files:**
- Modify: `src/pages/SportsWorkspace.tsx`

**Context:**
- SportsWorkspace renders `<EventDetailCard event={selEvent} sport={...} competition={...} />`
- It needs to pass `orgConfig`, `canEdit`, and an `onUpdateChannels` callback
- `orgConfig` is available via `useApp()` from `src/context/AppProvider.tsx`
- The update callback should use `handleSaveEvent` from AppProvider (via `useApp()`) to persist, or use `eventsApi.update()` directly and update local event state
- SportsWorkspace already has access to `events` and `setTechPlans`, but not direct event mutation — it receives `events` as a prop. The simplest approach: call `eventsApi.update()` and rely on the socket event:updated handler to propagate the change.

**Step 1: Add orgConfig import from useApp**

At the top of SportsWorkspace function body, add access to orgConfig. Since SportsWorkspace doesn't use `useApp()` directly (it receives props), we need to either:
- Add `orgConfig` as a new prop from App.tsx, OR
- Import `useApp` and grab just `orgConfig`

The simpler approach is to use `useApp()` for just `orgConfig` since it's already in context:

After the existing imports at top of file, ensure `useApp` is imported:
```typescript
import { useApp } from '../context/AppProvider'
```

Inside the component function, add:
```typescript
const { orgConfig, handleSaveEvent } = useApp()
```

**Step 2: Add the channel update handler**

After `handleCreatePlan`, add:
```typescript
const handleUpdateChannels = useCallback(async (eventId: number, channels: { linearChannel?: string; linearStartTime?: string; onDemandChannel?: string; radioChannel?: string }) => {
  const event = events.find(e => e.id === eventId)
  if (!event) return
  try {
    await handleSaveEvent({ ...event, ...channels })
    if (selEvent?.id === eventId) {
      setSelEvent(prev => prev ? { ...prev, ...channels } : prev)
    }
  } catch {
    toast.error('Failed to update channels')
  }
}, [events, handleSaveEvent, selEvent, toast])
```

**Step 3: Pass new props to EventDetailCard**

Change:
```tsx
<EventDetailCard
  event={selEvent}
  sport={sports.find(s => s.id === selEvent.sportId)}
  competition={competitions.find(c => c.id === selEvent.competitionId)}
/>
```
To:
```tsx
<EventDetailCard
  event={selEvent}
  sport={sports.find(s => s.id === selEvent.sportId)}
  competition={competitions.find(c => c.id === selEvent.competitionId)}
  orgConfig={orgConfig}
  canEdit={canEdit}
  onUpdateChannels={handleUpdateChannels}
/>
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/pages/SportsWorkspace.tsx
git commit -m "feat: wire channel assignment into SportsWorkspace"
```
