# SportsWorkspace Decomposition Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the 777-line monolithic SportsWorkspace into focused subcomponents with zero behavior change.

**Architecture:** Extract each visual section into its own component file under `src/components/sports/`. The orchestrator (`SportsWorkspace.tsx`) shrinks to ~120 lines of state + tab routing. Shared state (selected event, sport filter, editing plan) passes via props — no new state libraries yet. This is a pure refactor: same DOM, same behavior, same props contract.

**Tech Stack:** React, TypeScript, existing BB design tokens.

---

### Task 1: Extract EncoderSwapModal

The simplest extraction — a self-contained modal with no children.

**Files:**
- Create: `src/components/sports/EncoderSwapModal.tsx`
- Modify: `src/pages/SportsWorkspace.tsx`

**Step 1: Create the component**

Extract from SportsWorkspace lines 724-774. The component encapsulates the swap modal, LockCountdown, encoder grid, and error display.

```tsx
// src/components/sports/EncoderSwapModal.tsx
import { useState, useEffect, useCallback } from 'react'
import { Badge, Btn } from '../ui'
import type { TechPlan, Encoder } from '../../data/types'
import { techPlansApi } from '../../services'
import { ApiError } from '../../utils/api'

function LockCountdown({ ttlMs, onExpire }: { ttlMs: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(Math.ceil(ttlMs / 1000))

  useEffect(() => {
    if (remaining <= 0) {
      onExpire()
      return
    }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onExpire])

  return <span className="ml-1 font-mono">({remaining}s)</span>
}

interface EncoderSwapModalProps {
  planId: number
  encoders: Encoder[]
  currentEncoderName: string | undefined
  onSwapComplete: (planId: number, updatedPlan: TechPlan) => void
  onClose: () => void
}

export function EncoderSwapModal({ planId, encoders, currentEncoderName, onSwapComplete, onClose }: EncoderSwapModalProps) {
  const [error, setError] = useState<string | null>(null)
  const [lockTtl, setLockTtl] = useState<number | null>(null)

  const handleSwap = useCallback(async (encoderName: string) => {
    setError(null)
    setLockTtl(null)
    try {
      const updated = await techPlansApi.swapEncoder(planId, encoderName)
      onSwapComplete(planId, updated)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(e.message)
        setLockTtl(30000)
      } else {
        setError('Encoder swap failed')
      }
    }
  }, [planId, onSwapComplete])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div className="card w-full max-w-sm animate-scale-in rounded-lg p-5 shadow-md" onClick={e => e.stopPropagation()}>
        <h4 className="font-bold text-lg mb-1">Quick Encoder Swap</h4>
        <p className="meta mb-4">Change propagates immediately via WebSocket.</p>

        {error && (
          <div className="mb-4 rounded-md bg-danger/10 border border-danger/25 px-4 py-2 text-sm text-danger">
            {error}
            {lockTtl && (
              <LockCountdown ttlMs={lockTtl} onExpire={() => { setError(null); setLockTtl(null) }} />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {encoders.map(enc => {
            const inUse = enc.inUse !== null && enc.inUse !== undefined
            const cur = currentEncoderName === enc.name
            return (
              <button
                key={enc.id}
                onClick={() => !inUse && handleSwap(enc.name)}
                disabled={inUse && !cur}
                className={`rounded-md border p-3 text-sm font-mono font-semibold transition ${
                  cur
                    ? 'border-primary bg-primary/10 text-text'
                    : inUse
                      ? 'cursor-not-allowed border-border bg-surface-2 text-text-3'
                      : 'border-border bg-surface text-text hover:border-primary hover:text-primary'
                }`}
              >
                {enc.name}
                {cur && <span className="mt-0.5 block text-xs font-sans text-primary">Current</span>}
                {inUse && !cur && <span className="block text-xs font-sans mt-0.5">In use</span>}
                {!enc.isActive && <span className="block text-xs font-sans mt-0.5 text-warning">Offline</span>}
              </button>
            )
          })}
        </div>
        <Btn variant="default" className="w-full mt-4" onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  )
}
```

**Step 2: Replace in SportsWorkspace**

Remove: `LockCountdown` function (lines 27-40), `swapError`/`swapLockTtl` state (lines 46-47), the `handleSwap` callback (lines 124-144), and the swap modal JSX (lines 724-774).

Import and render the new component:

```tsx
import { EncoderSwapModal } from '../components/sports/EncoderSwapModal'
```

Replace the modal JSX block with:

```tsx
{swapModal !== null && (
  <EncoderSwapModal
    planId={swapModal}
    encoders={encoders}
    currentEncoderName={realtimePlans.find(p => p.id === swapModal)?.crew.encoder as string | undefined}
    onSwapComplete={(planId, updated) => {
      setRealtimePlans(prev => prev.map(p => p.id === planId ? updated : p))
      setTechPlans(prev => {
        const arr = Array.isArray(prev) ? prev : []
        return arr.map(p => p.id === planId ? updated : p)
      })
      setSwapModal(null)
    }}
    onClose={() => setSwapModal(null)}
  />
)}
```

Remove `swapError`, `swapLockTtl` state and `handleSwap` callback from the orchestrator.

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors. Visually: identical swap modal behavior.

**Step 4: Commit**

```bash
git add src/components/sports/EncoderSwapModal.tsx src/pages/SportsWorkspace.tsx
git commit -m "refactor: extract EncoderSwapModal from SportsWorkspace"
```

---

### Task 2: Extract EventDetailCard

The event metadata card shown when an event is selected.

**Files:**
- Create: `src/components/sports/EventDetailCard.tsx`
- Modify: `src/pages/SportsWorkspace.tsx`

**Step 1: Create the component**

Extract from SportsWorkspace lines 389-411.

```tsx
// src/components/sports/EventDetailCard.tsx
import { Badge } from '../ui'
import type { Event, Sport, Competition } from '../../data/types'
import { fmtDate } from '../../utils'

interface EventDetailCardProps {
  event: Event
  sport?: Sport
  competition?: Competition
}

export function EventDetailCard({ event, sport, competition }: EventDetailCardProps) {
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
    </div>
  )
}
```

**Step 2: Replace in SportsWorkspace**

```tsx
import { EventDetailCard } from '../components/sports/EventDetailCard'
```

Replace lines 389-411 with:

```tsx
<EventDetailCard
  event={selEvent}
  sport={sports.find(s => s.id === selEvent.sportId)}
  competition={competitions.find(c => c.id === selEvent.competitionId)}
/>
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/sports/EventDetailCard.tsx src/pages/SportsWorkspace.tsx
git commit -m "refactor: extract EventDetailCard from SportsWorkspace"
```

---

### Task 3: Extract TechPlanCard

The per-plan card with crew fields, custom fields, and encoder swap button. This is the largest extraction (~90 lines of JSX).

**Files:**
- Create: `src/components/sports/TechPlanCard.tsx`
- Modify: `src/pages/SportsWorkspace.tsx`

**Step 1: Create the component**

Extract from SportsWorkspace lines 420-509. The component needs: plan data, crew fields, edit state, and callbacks for crew edit, custom field CRUD, and swap.

```tsx
// src/components/sports/TechPlanCard.tsx
import { Plus } from 'lucide-react'
import { Badge, Btn } from '../ui'
import type { TechPlan, FieldConfig } from '../../data/types'

interface CustomField {
  name: string
  value: string
}

interface TechPlanCardProps {
  plan: TechPlan
  crewFields: FieldConfig[]
  isEditing: boolean
  showCrew: boolean
  onToggleEdit: () => void
  onCrewEdit: (field: string, value: string) => void
  onOpenSwap: () => void
  onAddCustomField: () => void
  onUpdateCustomField: (idx: number, key: string, val: string) => void
  onRemoveCustomField: (idx: number) => void
}

function getCustomFields(plan: TechPlan): CustomField[] {
  return Array.isArray(plan.customFields) ? plan.customFields as CustomField[] : []
}

export function TechPlanCard({
  plan, crewFields, isEditing, showCrew,
  onToggleEdit, onCrewEdit, onOpenSwap,
  onAddCustomField, onUpdateCustomField, onRemoveCustomField,
}: TechPlanCardProps) {
  const customFields = getCustomFields(plan)

  return (
    <div className="card mb-3 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-bold">{plan.planType}</span>
        </div>
        <div className="flex items-center gap-2">
          {plan.isLivestream && <Badge variant="live">Livestream</Badge>}
          <Btn variant="ghost" size="xs" onClick={onToggleEdit}>
            {isEditing ? "Done Editing" : "Edit Crew"}
          </Btn>
        </div>
      </div>
      <div className="p-4">
        {showCrew && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {crewFields.filter(f => f.type !== "checkbox").map(field => (
              <div key={field.id} className="rounded-md border border-border bg-surface-2 p-3">
                <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-text-2">
                  {field.label}
                  {field.required && <span className="text-danger">*</span>}
                  {field.isCustom && <span className="rounded-sm border border-border bg-surface px-1 text-[9px] text-text-2">custom</span>}
                </div>
                {isEditing ? (
                  <input
                    value={(plan.crew[field.id] as string) || ""}
                    onChange={e => onCrewEdit(field.id, e.target.value)}
                    className="field-input px-2 py-1"
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${field.id === "encoder" ? "font-mono font-bold" : ""}`}>
                      {(plan.crew[field.id] as string) || "—"}
                    </span>
                    {field.id === "encoder" && (
                      <button
                        onClick={onOpenSwap}
                        className="rounded-sm border border-border bg-surface px-2 py-1 text-xs font-semibold uppercase tracking-wide text-text transition hover:border-primary hover:text-primary"
                      >
                        Swap
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {customFields.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-2">Custom Fields</div>
            <div className="flex flex-wrap gap-2">
              {customFields.map((cf, i) => (
                <div key={i} className="flex items-center gap-1">
                  {isEditing ? (
                    <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 p-1">
                      <input
                        value={cf.name}
                        onChange={e => onUpdateCustomField(i, "name", e.target.value)}
                        placeholder="Name"
                        className="field-input w-24 px-2 py-0.5 text-xs"
                      />
                      <input
                        value={cf.value}
                        onChange={e => onUpdateCustomField(i, "value", e.target.value)}
                        placeholder="Value"
                        className="field-input w-24 px-2 py-0.5 text-xs"
                      />
                      <button onClick={() => onRemoveCustomField(i)} className="px-1 text-xs text-danger">✕</button>
                    </div>
                  ) : (
                    <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text">
                      {cf.name}: <strong>{cf.value}</strong>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {isEditing && (
          <div className="mt-2">
            <Btn variant="ghost" size="xs" onClick={onAddCustomField}><Plus className="w-3 h-3" /> Add Custom Field</Btn>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Replace in SportsWorkspace**

```tsx
import { TechPlanCard } from '../components/sports/TechPlanCard'
```

Replace the `eventPlans.map(plan => { ... })` block (lines 418-510) with:

```tsx
{eventPlans.map(plan => (
  <TechPlanCard
    key={plan.id}
    plan={plan}
    crewFields={visibleCrewFields}
    isEditing={editingPlanCrew === plan.id}
    showCrew={showCrew}
    onToggleEdit={() => setEditingPlanCrew(editingPlanCrew === plan.id ? null : plan.id)}
    onCrewEdit={(field, value) => handleCrewEdit(plan.id, field, value)}
    onOpenSwap={() => { setSwapModal(plan.id) }}
    onAddCustomField={() => addCustomToPlan(plan.id)}
    onUpdateCustomField={(idx, key, val) => updatePlanCustomField(plan.id, idx, key, val)}
    onRemoveCustomField={(idx) => removePlanCustomField(plan.id, idx)}
  />
))}
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/sports/TechPlanCard.tsx src/pages/SportsWorkspace.tsx
git commit -m "refactor: extract TechPlanCard from SportsWorkspace"
```

---

### Task 4: Extract SportTreePanel

The sidebar tree with sport filter chips, sport/competition/event hierarchy.

**Files:**
- Create: `src/components/sports/SportTreePanel.tsx`
- Modify: `src/pages/SportsWorkspace.tsx`

**Step 1: Create the component**

Extract the inner `TreePanel` function (lines 247-311) and the mobile sidebar wrapper.

```tsx
// src/components/sports/SportTreePanel.tsx
import type { Event, Sport, Competition } from '../../data/types'
import { fmtDate } from '../../utils'

interface SportNode {
  id: number
  name: string
  icon: string
  comps: CompNode[]
}

interface CompNode {
  id: number
  name: string
  events: Event[]
}

interface SportTreePanelProps {
  sportTree: SportNode[]
  filteredTree: SportNode[]
  selectedSport: number | null
  onSelectSport: (id: number | null) => void
  expanded: Set<number>
  onToggle: (id: number) => void
  selectedEventId: number | null
  onSelectEvent: (event: Event) => void
}

export function SportTreePanel({
  sportTree, filteredTree, selectedSport, onSelectSport,
  expanded, onToggle, selectedEventId, onSelectEvent,
}: SportTreePanelProps) {
  return (
    <div className="space-y-1 p-2">
      <div className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-text-2">Sports & Events</div>
      {sportTree.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-2 pb-2">
          <button
            onClick={() => onSelectSport(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              !selectedSport
                ? 'bg-primary text-white border-primary'
                : 'text-text-2 border-border hover:bg-surface-2'
            }`}
          >
            All
          </button>
          {sportTree.map(s => (
            <button
              key={s.id}
              onClick={() => onSelectSport(selectedSport === s.id ? null : s.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                selectedSport === s.id
                  ? 'bg-primary text-white border-primary'
                  : 'text-text-2 border-border hover:bg-surface-2'
              }`}
            >
              {s.icon} {s.name}
            </button>
          ))}
        </div>
      )}
      {filteredTree.map(sport => (
        <div key={sport.id}>
          <button
            onClick={() => onToggle(sport.id)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-surface-2"
          >
            <span className={`transition-transform text-xs ${expanded.has(sport.id) ? "rotate-90" : ""}`}>▶</span>
            <span className="text-base">{sport.icon}</span>
            <span className="text-sm font-semibold flex-1">{sport.name}</span>
            <span className="rounded-sm bg-surface-2 px-1.5 text-xs text-text-2">{sport.comps.reduce((s, c) => s + c.events.length, 0)}</span>
          </button>
          {expanded.has(sport.id) && sport.comps.map(comp => (
            <div key={comp.id} className="ml-6">
              <div className="px-2 py-1 text-xs font-medium text-text-2">{comp.name}</div>
              {comp.events.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => onSelectEvent(ev)}
                  className={`mb-0.5 w-full rounded-sm border px-2 py-2 text-left text-sm transition ${
                    selectedEventId === ev.id
                      ? 'border-primary bg-primary/10 text-text'
                      : 'border-transparent text-text-2 hover:bg-surface-2 hover:text-text'
                  }`}
                >
                  <div className="font-medium truncate">{ev.participants}</div>
                  <div className="text-xs text-text-3">{fmtDate(ev.startDateBE)} - {ev.startTimeBE}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

**Step 2: Replace in SportsWorkspace**

Remove the inner `TreePanel` function. Import and use:

```tsx
import { SportTreePanel } from '../components/sports/SportTreePanel'
```

Replace `<TreePanel />` usage in both the mobile sidebar and desktop sidebar with:

```tsx
<SportTreePanel
  sportTree={sportTree}
  filteredTree={filteredTree}
  selectedSport={selectedSport}
  onSelectSport={setSelectedSport}
  expanded={expanded}
  onToggle={toggle}
  selectedEventId={selEvent?.id ?? null}
  onSelectEvent={(ev) => { setSelEvent(ev); setMobileSidebar(false); setEditingPlanCrew(null) }}
/>
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/sports/SportTreePanel.tsx src/pages/SportsWorkspace.tsx
git commit -m "refactor: extract SportTreePanel from SportsWorkspace"
```

---

### Task 5: Extract CrewTab and ResourcesTab

Two simple table extractions.

**Files:**
- Create: `src/components/sports/CrewTab.tsx`
- Create: `src/components/sports/ResourcesTab.tsx`
- Modify: `src/pages/SportsWorkspace.tsx`

**Step 1: Create CrewTab**

Extract lines 613-649.

```tsx
// src/components/sports/CrewTab.tsx
import type { Event, TechPlan, FieldConfig } from '../../data/types'

interface CrewTabProps {
  plans: TechPlan[]
  events: Event[]
  crewFields: FieldConfig[]
}

export function CrewTab({ plans, events, crewFields }: CrewTabProps) {
  const visibleFields = crewFields.filter(f => f.visible).sort((a, b) => a.order - b.order)

  if (plans.length === 0) {
    return <div className="card p-8 text-center text-text-3 text-sm">No crew assignments yet</div>
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Event</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Plan</th>
            {visibleFields.slice(0, 4).map(f => (
              <th key={f.id} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {plans.map(plan => {
            const ev = events.find(e => e.id === plan.eventId)
            return (
              <tr key={plan.id} className="hover:bg-surface-2 transition">
                <td className="px-4 py-3 font-medium">{ev?.participants ?? `Event #${plan.eventId}`}</td>
                <td className="px-4 py-3 text-muted text-xs font-mono uppercase">{plan.planType}</td>
                {visibleFields.slice(0, 4).map(f => (
                  <td key={f.id} className="px-4 py-3 text-text-2">
                    {(plan.crew[f.id] as string) || <span className="text-text-3">—</span>}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

**Step 2: Create ResourcesTab**

Extract lines 652-722. Move the resource assignments loading effect into the component.

```tsx
// src/components/sports/ResourcesTab.tsx
import { useState, useEffect } from 'react'
import { Badge } from '../ui'
import { resourcesApi, RESOURCE_TYPE_LABELS } from '../../services/resources'
import type { Resource, ResourceAssignment } from '../../services/resources'

interface ResourcesTabProps {
  resources: Resource[]
}

export function ResourcesTab({ resources }: ResourcesTabProps) {
  const [assignments, setAssignments] = useState<Record<number, ResourceAssignment[]>>({})

  useEffect(() => {
    if (resources.length === 0) return
    let cancelled = false
    Promise.all(resources.map(r => resourcesApi.getAssignments(r.id).then(a => ({ id: r.id, a }))))
      .then(results => {
        if (cancelled) return
        const next: Record<number, ResourceAssignment[]> = {}
        for (const { id, a } of results) next[id] = a
        setAssignments(next)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [resources])

  if (resources.length === 0) {
    return <div className="card p-8 text-center text-text-3 text-sm">No resources configured yet</div>
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Name</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Type</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Capacity</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Status</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Current Assignments</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {resources.map(r => {
            const ra = assignments[r.id]
            return (
              <tr key={r.id} className="hover:bg-surface-2 transition align-top">
                <td className="px-4 py-3 font-semibold">{r.name}</td>
                <td className="px-4 py-3 text-text-2 text-xs font-mono uppercase">{RESOURCE_TYPE_LABELS[r.type] ?? r.type}</td>
                <td className="px-4 py-3 text-text-2">{r.capacity}</td>
                <td className="px-4 py-3">
                  {r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="none">Inactive</Badge>}
                </td>
                <td className="px-4 py-3">
                  {ra === undefined ? (
                    <span className="text-text-3 text-xs">Loading…</span>
                  ) : ra.length === 0 ? (
                    <span className="text-text-3 text-xs">No assignments</span>
                  ) : (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-text-2">{ra.length} assignment{ra.length !== 1 ? 's' : ''}</span>
                      <ul className="space-y-0.5">
                        {ra.map(a => (
                          <li key={a.id} className="text-xs text-text-2 flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                            <span className="font-mono text-text-3 mr-1">{a.techPlan?.planType ?? `Plan #${a.techPlanId}`}</span>
                            {a.techPlan?.event
                              ? <span className="truncate max-w-[160px]">{a.techPlan.event.participants}</span>
                              : <span className="text-text-3">Event #{a.techPlan?.eventId}</span>
                            }
                            {a.quantity > 1 && <span className="ml-1 text-text-3">(×{a.quantity})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-text-3 text-xs">{r.notes ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

**Step 3: Replace in SportsWorkspace**

Import both. Remove the `resourceAssignments` state and its loading effect (lines 53, 231-243). Replace the tab content blocks:

```tsx
{activeTab === 'crew' && (
  <div className="animate-fade-in">
    <CrewTab plans={realtimePlans} events={events} crewFields={crewFields} />
  </div>
)}

{activeTab === 'resources' && (
  <div className="animate-fade-in">
    <ResourcesTab resources={resources} />
  </div>
)}
```

**Step 4: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/sports/CrewTab.tsx src/components/sports/ResourcesTab.tsx src/pages/SportsWorkspace.tsx
git commit -m "refactor: extract CrewTab and ResourcesTab from SportsWorkspace"
```

---

### Task 6: Update barrel export + final cleanup

**Files:**
- Modify: `src/components/sports/index.ts`
- Modify: `src/pages/SportsWorkspace.tsx`

**Step 1: Update barrel export**

```typescript
// src/components/sports/index.ts
export { ScoreTile } from './ScoreTile'
export { MatchRow } from './MatchRow'
export { EventTimeline } from './EventTimeline'
export { EncoderSwapModal } from './EncoderSwapModal'
export { EventDetailCard } from './EventDetailCard'
export { TechPlanCard } from './TechPlanCard'
export { SportTreePanel } from './SportTreePanel'
export { CrewTab } from './CrewTab'
export { ResourcesTab } from './ResourcesTab'
```

**Step 2: Clean up SportsWorkspace imports**

Replace individual component imports with barrel import:

```tsx
import { EncoderSwapModal, EventDetailCard, TechPlanCard, SportTreePanel, CrewTab, ResourcesTab } from '../components/sports'
```

Remove now-unused imports: `Plus` from lucide (moved to TechPlanCard), `ApiError` (moved to EncoderSwapModal), `resourcesApi`/`RESOURCE_TYPE_LABELS` (moved to ResourcesTab), `fmtDate` (only used in extracted components if no longer needed in orchestrator — check), `Badge` (if only used in extracted components).

**Step 3: Verify final line count**

The orchestrator should now be ~250-300 lines: state declarations, tab bar, sport filter chips, Events tab layout (sidebar wrapper + content area using subcomponents), Plans tab table (could extract later but is a single table), and the swap modal invocation.

**Step 4: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/sports/index.ts src/pages/SportsWorkspace.tsx
git commit -m "refactor: update sports barrel export and clean up SportsWorkspace imports"
```

---

## Implementation Order

| Task | Description | Depends on | Lines removed from orchestrator |
|------|-------------|------------|-------------------------------|
| 1 | EncoderSwapModal | — | ~70 lines |
| 2 | EventDetailCard | — | ~25 lines |
| 3 | TechPlanCard | — | ~90 lines |
| 4 | SportTreePanel | — | ~65 lines |
| 5 | CrewTab + ResourcesTab | — | ~85 lines |
| 6 | Barrel export + cleanup | 1-5 | ~10 lines imports |

Tasks 1-4 are all independent and can run in parallel. Task 5 is independent. Task 6 depends on all others.

**Target:** SportsWorkspace drops from 777 lines to ~250-300 lines.
