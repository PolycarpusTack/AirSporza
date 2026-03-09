# Event Modal Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the 520-line DynamicEventForm into hooks + subcomponents, add minimal-create mode, collapsible sections, dirty-state guard, and save-button feedback.

**Architecture:** Extract form state, validation, and conflict checking into three custom hooks. Split rendering into FieldSection, EventFieldRenderer, ConflictBanner, SaveFooter, and DiscardDialog components. The orchestrator DynamicEventForm shrinks to ~150 lines wiring everything together.

**Tech Stack:** React 18, TypeScript, existing BB design tokens (bg-surface, border-border, text-text-2, etc.), Lucide icons, existing Modal/Btn/ChannelSelect primitives.

**Validation:** `npx tsc --noEmit` from `/mnt/c/Projects/Planza` (no frontend test runner). Manual smoke test: create event, edit event, batch create, link-from-import, conflict warnings.

**Design doc:** `docs/plans/2026-03-09-event-modal-overhaul-design.md`

---

### Task 1: useEventForm hook

**Files:**
- Create: `src/components/forms/hooks/useEventForm.ts`
- Read: `src/components/forms/DynamicEventForm.tsx` (lines 60-163 — state, initForm, update, customValues)
- Read: `src/data/types.ts` (FieldConfig, Event, ChannelType)

**Step 1: Create the hook file**

Extract form state management from DynamicEventForm into a standalone hook. The hook owns:
- `form` state (`Record<string, string | boolean>`)
- `customValues` state (`Record<string, string>`)
- `initForm()` — builds initial form state from eventFields, editEvent, prefill
- `update(key, value)` — updates a field and clears its error
- `handleCustomValueChange(fieldId, value)`
- `isDirty` — compares current form+customValues to initial snapshot
- `resetDirty()` — re-snapshots (called after successful save)

```ts
// src/components/forms/hooks/useEventForm.ts
import { useState, useEffect, useRef, useCallback } from 'react'
import type { FieldConfig, Event, ChannelType } from '../../../data/types'

const CHANNEL_FIELD_MAP: Record<string, { fkField: keyof Event; typeFilter?: ChannelType }> = {
  channels:         { fkField: 'channelId',         typeFilter: 'linear' },
  radioChannels:    { fkField: 'radioChannelId',    typeFilter: 'radio' },
  onDemandChannels: { fkField: 'onDemandChannelId', typeFilter: 'on-demand' },
}

export { CHANNEL_FIELD_MAP }

const CORE_FIELD_IDS = new Set([
  'sport', 'competition',
  'phase', 'category', 'participants', 'content',
  'startDateBE', 'startTimeBE', 'startDateOrigin', 'startTimeOrigin',
  'complex', 'livestreamDate', 'livestreamTime',
  'linearChannel', 'radioChannel', 'linearStartTime', 'onDemandChannel',
  'isLive', 'isDelayedLive',
  'videoRef', 'winner', 'score', 'duration',
])

export function isCustomField(fieldId: string, fieldConfig: FieldConfig[]): boolean {
  if (CORE_FIELD_IDS.has(fieldId)) return false
  const field = fieldConfig.find(f => f.id === fieldId)
  return field?.isCustom === true || !CORE_FIELD_IDS.has(fieldId)
}

interface UseEventFormOptions {
  eventFields: FieldConfig[]
  editEvent?: Event | null
  prefill?: Partial<Record<string, string>> | null
}

export function useEventForm({ eventFields, editEvent, prefill }: UseEventFormOptions) {
  const buildInitial = useCallback((): Record<string, string | boolean> => {
    const f: Record<string, string | boolean> = {}
    const customFields = editEvent?.customFields as Record<string, unknown> | undefined

    eventFields.forEach(field => {
      if (isCustomField(field.id, eventFields)) {
        if (customFields && customFields[field.id] !== undefined) {
          f[field.id] = customFields[field.id] as string | boolean
        } else if (field.type === 'checkbox') {
          f[field.id] = false
        } else {
          f[field.id] = ''
        }
      } else if (field.id === 'sport' || field.id === 'competition') {
        const key = field.id === 'sport' ? 'sportId' : 'competitionId'
        if (editEvent && editEvent[key as keyof Event] !== undefined) {
          f[field.id] = String(editEvent[key as keyof Event])
        } else {
          f[field.id] = ''
        }
      } else if (field.type === 'dropdown' && field.options && CHANNEL_FIELD_MAP[field.options]) {
        const { fkField } = CHANNEL_FIELD_MAP[field.options]
        const fkVal = editEvent?.[fkField]
        f[field.id] = fkVal != null ? String(fkVal) : ''
      } else if (editEvent && editEvent[field.id as keyof Event] !== undefined) {
        f[field.id] = editEvent[field.id as keyof Event] as string | boolean
      } else if (field.type === 'checkbox') {
        f[field.id] = false
      } else {
        f[field.id] = ''
      }
    })
    if (prefill) {
      Object.entries(prefill).forEach(([key, value]) => {
        if (value !== undefined) f[key] = value
      })
    }
    return f
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEvent?.id, prefill])

  const [form, setForm] = useState<Record<string, string | boolean>>(buildInitial)
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const snapshotRef = useRef<string>('')

  // Re-init when editEvent or prefill changes
  useEffect(() => {
    const initial = buildInitial()
    setForm(initial)

    let cv: Record<string, string> = {}
    if (editEvent?.customValues && editEvent.customValues.length > 0) {
      for (const c of editEvent.customValues) cv[c.fieldId] = c.fieldValue
    }
    setCustomValues(cv)

    // Snapshot for dirty tracking
    snapshotRef.current = JSON.stringify({ form: initial, customValues: cv })
  }, [buildInitial, editEvent?.id])

  const update = useCallback((k: string, v: string | boolean) => {
    setForm(p => ({ ...p, [k]: v }))
  }, [])

  const handleCustomValueChange = useCallback((fieldId: string, value: string) => {
    setCustomValues(prev => ({ ...prev, [fieldId]: value }))
  }, [])

  const isDirty = JSON.stringify({ form, customValues }) !== snapshotRef.current

  const resetDirty = useCallback(() => {
    snapshotRef.current = JSON.stringify({ form, customValues })
  }, [form, customValues])

  return { form, setForm, customValues, update, handleCustomValueChange, isDirty, resetDirty, buildInitial }
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit` from `/mnt/c/Projects/Planza`
Expected: zero errors (hook is not imported yet, so no impact)

**Step 3: Commit**

```bash
git add src/components/forms/hooks/useEventForm.ts
git commit -m "feat(modal): extract useEventForm hook with dirty tracking"
```

---

### Task 2: useEventValidation hook

**Files:**
- Create: `src/components/forms/hooks/useEventValidation.ts`
- Read: `src/components/forms/DynamicEventForm.tsx` (lines 179-298 — validate, mandatory, API required)
- Read: `src/services/index.ts` (fieldsApi)

**Step 1: Create the hook file**

Extracts all validation logic: eventFields.required, sportId/competitionId, duration format, API custom fields required (with checkbox handling), mandatory field enforcement.

```ts
// src/components/forms/hooks/useEventValidation.ts
import { useState, useEffect } from 'react'
import type { FieldConfig, MandatoryFieldConfig } from '../../../data/types'
import { fieldsApi } from '../../../services'

type ApiFieldDef = {
  id: string
  label: string
  fieldType: string
  required: boolean
  visible: boolean
  options: string[]
  defaultValue?: string
}

interface UseEventValidationOptions {
  eventFields: FieldConfig[]
  form: Record<string, string | boolean>
  customValues: Record<string, string>
  apiCustomFields: ApiFieldDef[]
}

export type { ApiFieldDef }

export function useEventValidation({ eventFields, form, customValues, apiCustomFields }: UseEventValidationOptions) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [mandatoryFieldIds, setMandatoryFieldIds] = useState<string[]>([])
  const [mandatoryErrors, setMandatoryErrors] = useState<string[]>([])

  // Load mandatory fields when sport changes
  useEffect(() => {
    setMandatoryErrors([])
    const id = Number(form.sport)
    if (!id) { setMandatoryFieldIds([]); return }
    fieldsApi.getMandatory(id)
      .then((cfg: MandatoryFieldConfig) => setMandatoryFieldIds(cfg.fieldIds))
      .catch(() => setMandatoryFieldIds([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.sport])

  const clearFieldError = (fieldId: string) => {
    setErrors(p => ({ ...p, [fieldId]: '' }))
  }

  const visibleFields = eventFields.filter(f => f.visible).sort((a, b) => a.order - b.order)

  const validate = (): boolean => {
    const errs: Record<string, string> = {}

    visibleFields.forEach(f => {
      const val = form[f.id]
      if (f.required && !val && val !== false) {
        errs[f.id] = 'Required'
      }
    })

    const sportId = parseInt(form.sport as string)
    const competitionId = parseInt(form.competition as string)
    if (!sportId || sportId === 0) errs.sport = 'Valid sport required'
    if (!competitionId || competitionId === 0) errs.competition = 'Valid competition required'

    if (form.duration && !/^\d{2}:\d{2}:\d{2};\d{2}$/.test(form.duration as string)) {
      errs.duration = 'Format: HH:MM:SS;FF (e.g. 01:45:22;12)'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validateCustomFields = (): boolean => {
    const missingApiRequired = apiCustomFields
      .filter(f => f.required && f.visible)
      .filter(f => {
        const val = customValues[f.id]
        if (f.fieldType === 'checkbox') return val !== 'true'
        return !val || (typeof val === 'string' && val.trim() === '')
      })
      .map(f => f.id)

    const missingMandatory = mandatoryFieldIds.filter(fieldId => {
      const val = customValues[fieldId]
      return !val || (typeof val === 'string' && val.trim() === '')
    })

    const allMissing = [...new Set([...missingApiRequired, ...missingMandatory])]
    if (allMissing.length > 0) {
      setMandatoryErrors(allMissing)
      return false
    }
    setMandatoryErrors([])
    return true
  }

  return {
    errors, setErrors, mandatoryErrors, visibleFields,
    validate, validateCustomFields, clearFieldError,
  }
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: zero errors

**Step 3: Commit**

```bash
git add src/components/forms/hooks/useEventValidation.ts
git commit -m "feat(modal): extract useEventValidation hook"
```

---

### Task 3: useConflictCheck hook

**Files:**
- Create: `src/components/forms/hooks/useConflictCheck.ts`
- Read: `src/services/conflicts.ts` (conflictsApi, ConflictResult)

**Step 1: Create the hook file**

Encapsulates conflict preflight: calling the API, storing result, handling the "first time = block, second time = proceed" warning flow.

```ts
// src/components/forms/hooks/useConflictCheck.ts
import { useState, useCallback } from 'react'
import { conflictsApi, type ConflictResult } from '../../../services/conflicts'
import type { EventStatus } from '../../../data/types'

interface ConflictCheckParams {
  id?: number
  competitionId: number
  channelId?: number
  radioChannelId?: number
  onDemandChannelId?: number
  startDateBE: string
  startTimeBE: string
  status?: EventStatus
}

/**
 * Returns:
 * - 'pass'    — no conflicts, proceed to save
 * - 'blocked' — hard errors or first-time warnings, do NOT save
 */
type CheckOutcome = 'pass' | 'blocked'

export function useConflictCheck() {
  const [conflicts, setConflicts] = useState<ConflictResult | null>(null)

  const reset = useCallback(() => setConflicts(null), [])

  const checkAndProceed = useCallback(async (params: ConflictCheckParams): Promise<CheckOutcome> => {
    const result = await conflictsApi.check({
      ...params,
      linearChannel: undefined,
      onDemandChannel: undefined,
      radioChannel: undefined,
    }).catch(() => null)

    setConflicts(result)

    if (result?.errors && result.errors.length > 0) return 'blocked'

    // First time warnings appear → block so user can review.
    // If conflicts was already set, user already saw them and clicked Save again.
    if (result?.warnings && result.warnings.length > 0) {
      // We check the PREVIOUS conflicts state via closure — if it was null,
      // this is the first time.
      return 'blocked'
    }

    return 'pass'
  }, [])

  // Wrapper that handles the "confirm on second click" pattern
  const checkOrConfirm = useCallback(async (
    params: ConflictCheckParams,
    alreadySeen: boolean,
  ): Promise<CheckOutcome> => {
    const result = await conflictsApi.check({
      ...params,
      linearChannel: undefined,
      onDemandChannel: undefined,
      radioChannel: undefined,
    }).catch(() => null)

    setConflicts(result)

    if (result?.errors && result.errors.length > 0) return 'blocked'
    if (result?.warnings && result.warnings.length > 0 && !alreadySeen) return 'blocked'

    return 'pass'
  }, [])

  return { conflicts, reset, checkOrConfirm }
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: zero errors

**Step 3: Commit**

```bash
git add src/components/forms/hooks/useConflictCheck.ts
git commit -m "feat(modal): extract useConflictCheck hook"
```

---

### Task 4: FieldSection component

**Files:**
- Create: `src/components/forms/fields/FieldSection.tsx`

**Step 1: Create the collapsible section component**

A generic collapsible wrapper with title, field count badge, chevron toggle, and children slot.

```tsx
// src/components/forms/fields/FieldSection.tsx
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface FieldSectionProps {
  title: string
  fieldCount?: number
  defaultOpen?: boolean
  children: React.ReactNode
}

export function FieldSection({ title, fieldCount, defaultOpen = true, children }: FieldSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full py-1.5 text-xs uppercase tracking-wide text-text-2 hover:text-text transition group"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="font-bold">{title}</span>
        {fieldCount != null && fieldCount > 0 && (
          <span className="text-[10px] text-text-3 font-normal">({fieldCount})</span>
        )}
        <div className="flex-1 border-b border-border/50 ml-2 group-hover:border-border transition" />
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {children}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: zero errors

**Step 3: Commit**

```bash
git add src/components/forms/fields/FieldSection.tsx
git commit -m "feat(modal): add FieldSection collapsible wrapper"
```

---

### Task 5: EventFieldRenderer component

**Files:**
- Create: `src/components/forms/fields/EventFieldRenderer.tsx`
- Read: `src/components/forms/DynamicEventForm.tsx` (lines 341-435 — renderField)
- Read: `src/components/ui/ChannelSelect.tsx`

**Step 1: Create the renderer component**

Extract the renderField logic into a standalone component that takes a field config, current value, error state, onChange, and options context.

```tsx
// src/components/forms/fields/EventFieldRenderer.tsx
import { ChannelSelect } from '../../ui/ChannelSelect'
import type { FieldConfig, ChannelType } from '../../../data/types'
import { CHANNEL_FIELD_MAP } from '../hooks/useEventForm'

interface EventFieldRendererProps {
  field: FieldConfig
  value: string | boolean
  error?: string
  onChange: (value: string | boolean) => void
  optionsMap: Record<string, { value: string | number; label: string }[]>
}

const inputCls = 'field-input'
const errCls = 'border-danger focus:border-danger focus:ring-danger/20'

export function EventFieldRenderer({ field, value, error, onChange, optionsMap }: EventFieldRendererProps) {
  const hasErr = !!error
  const cls = `${inputCls} ${hasErr ? errCls : 'border-border'}`

  // Custom dropdowns with literal options — check BEFORE system lookups
  if (field.type === 'dropdown' && field.isCustom && field.options) {
    const opts = (typeof field.options === 'string' ? field.options.split(',') : [])
      .map(o => o.trim()).filter(Boolean)
    return (
      <select value={value as string || ''} onChange={e => onChange(e.target.value)} className={cls}>
        <option value=''>Select...</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  // Channel FK dropdowns
  if (field.type === 'dropdown' && field.options && CHANNEL_FIELD_MAP[field.options]) {
    const { typeFilter } = CHANNEL_FIELD_MAP[field.options]
    const numVal = value ? Number(value) : null
    return (
      <ChannelSelect
        value={numVal}
        onChange={(id) => onChange(id != null ? String(id) : '')}
        type={typeFilter}
        placeholder={`Select ${field.label.toLowerCase()}...`}
        className={hasErr ? errCls : ''}
      />
    )
  }

  // System dropdowns (sports, competitions, phases, etc.)
  if (field.type === 'dropdown' && field.options && optionsMap[field.options]) {
    return (
      <select value={value as string || ''} onChange={e => onChange(e.target.value)} className={cls}>
        <option value=''>Select...</option>
        {optionsMap[field.options].map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  if (field.type === 'checkbox') {
    return (
      <label className='flex items-center gap-2 py-1 cursor-pointer'>
        <input
          type='checkbox'
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          className='h-4 w-4 rounded border-border text-primary'
        />
        <span className='text-sm text-text-2'>{value ? 'Yes' : 'No'}</span>
      </label>
    )
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        value={value as string || ''}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className={cls}
      />
    )
  }

  if (field.id === 'duration') {
    return (
      <>
        <input
          type='text'
          value={value as string || ''}
          onChange={e => onChange(e.target.value)}
          placeholder='HH:MM:SS;FF'
          pattern='\d{2}:\d{2}:\d{2};\d{2}'
          maxLength={11}
          className={cls}
        />
        <p className='mt-0.5 text-[11px] text-text-3 font-mono'>SMPTE timecode — bijv. 01:45:22;25</p>
      </>
    )
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'}
      value={value as string || ''}
      onChange={e => onChange(e.target.value)}
      className={cls}
    />
  )
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: zero errors

**Step 3: Commit**

```bash
git add src/components/forms/fields/EventFieldRenderer.tsx
git commit -m "feat(modal): extract EventFieldRenderer component"
```

---

### Task 6: ConflictBanner component

**Files:**
- Create: `src/components/forms/ConflictBanner.tsx`

**Step 1: Create the component**

Renders conflict errors and warnings from the preflight check.

```tsx
// src/components/forms/ConflictBanner.tsx
import type { ConflictResult } from '../../services/conflicts'

interface ConflictBannerProps {
  conflicts: ConflictResult | null
}

export function ConflictBanner({ conflicts }: ConflictBannerProps) {
  if (!conflicts) return null
  if (conflicts.errors.length === 0 && conflicts.warnings.length === 0) return null

  return (
    <div className="space-y-1">
      {conflicts.errors.map((e, i) => (
        <div key={i} className="text-xs text-danger bg-danger/10 rounded px-2 py-1">{e.message}</div>
      ))}
      {conflicts.warnings.length > 0 && (
        <div className="text-xs text-text-2 mb-1">Warnings found — click Save again to proceed anyway.</div>
      )}
      {conflicts.warnings.map((w, i) => (
        <div key={i} className="text-xs text-warning bg-warning/10 rounded px-2 py-1">{w.message}</div>
      ))}
    </div>
  )
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: zero errors

**Step 3: Commit**

```bash
git add src/components/forms/ConflictBanner.tsx
git commit -m "feat(modal): extract ConflictBanner component"
```

---

### Task 7: SaveFooter component

**Files:**
- Create: `src/components/forms/SaveFooter.tsx`

**Step 1: Create the component**

Renders the modal footer with save button states (idle/saving/success/error), cancel button, and required-fields count.

```tsx
// src/components/forms/SaveFooter.tsx
import { useEffect } from 'react'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { Btn } from '../ui'

export type SaveState = 'idle' | 'saving' | 'success' | 'error'

interface SaveFooterProps {
  onSave: () => void
  onCancel: () => void
  saveState: SaveState
  requiredCount: number
  readOnly?: boolean
  isEdit?: boolean
}

export function SaveFooter({ onSave, onCancel, saveState, requiredCount, readOnly, isEdit }: SaveFooterProps) {
  // Auto-close is handled by the parent after 'success' state is set

  const saveLabel = (() => {
    switch (saveState) {
      case 'saving': return 'Saving...'
      case 'success': return 'Saved!'
      case 'error': return 'Save failed — try again'
      default: return isEdit ? 'Save Changes' : 'Create Event'
    }
  })()

  const saveIcon = (() => {
    switch (saveState) {
      case 'saving': return <Loader2 className="w-4 h-4 animate-spin" />
      case 'success': return <Check className="w-4 h-4" />
      case 'error': return <AlertCircle className="w-4 h-4" />
      default: return null
    }
  })()

  const saveVariant = saveState === 'success' ? 'primary' as const
    : saveState === 'error' ? 'primary' as const
    : 'primary' as const

  const saveCls = saveState === 'success' ? '!bg-green-600 !border-green-600'
    : saveState === 'error' ? '!bg-danger !border-danger'
    : ''

  return (
    <div className='border-t border-border px-6 pt-4 pb-4 space-y-3'>
      <div className='flex items-center justify-between'>
        <span className='text-xs uppercase tracking-wide text-text-2'>
          {readOnly ? 'Read-only' : `${requiredCount} required fields`}
        </span>
        <div className='flex gap-2'>
          <Btn onClick={onCancel}>{readOnly ? 'Close' : 'Cancel'}</Btn>
          {!readOnly && (
            <Btn
              variant={saveVariant}
              onClick={onSave}
              disabled={saveState === 'saving' || saveState === 'success'}
              className={`flex items-center gap-1.5 transition-colors ${saveCls}`}
            >
              {saveIcon}
              {saveLabel}
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Check Btn component accepts `disabled` and `className` props**

Read: `src/components/ui/Btn.tsx` or `src/components/ui/Button.tsx` — verify it spreads extra props or accepts `disabled`/`className`. If not, add them.

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: zero errors

**Step 4: Commit**

```bash
git add src/components/forms/SaveFooter.tsx
git commit -m "feat(modal): extract SaveFooter with loading/success/error states"
```

---

### Task 8: DiscardDialog component

**Files:**
- Create: `src/components/forms/DiscardDialog.tsx`

**Step 1: Create the component**

A small overlay confirmation shown when closing a dirty form.

```tsx
// src/components/forms/DiscardDialog.tsx
interface DiscardDialogProps {
  onDiscard: () => void
  onKeepEditing: () => void
}

export function DiscardDialog({ onDiscard, onKeepEditing }: DiscardDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onKeepEditing}
    >
      <div
        className="card rounded-lg shadow-lg p-6 max-w-sm w-full mx-4 animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <h4 className="font-bold text-base mb-2">Discard unsaved changes?</h4>
        <p className="text-sm text-text-2 mb-4">
          You have unsaved changes that will be lost if you close.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onKeepEditing}
            className="btn text-sm px-3 py-1.5"
          >
            Keep Editing
          </button>
          <button
            onClick={onDiscard}
            className="btn btn-p text-sm px-3 py-1.5 !bg-danger !border-danger hover:!bg-danger/90"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: zero errors

**Step 3: Commit**

```bash
git add src/components/forms/DiscardDialog.tsx
git commit -m "feat(modal): add DiscardDialog component"
```

---

### Task 9: Rewrite DynamicEventForm as orchestrator

**Files:**
- Modify: `src/components/forms/DynamicEventForm.tsx` (full rewrite)
- Read: all files created in Tasks 1-8

**Step 1: Define the field-to-section mapping and essential fields**

```ts
const FIELD_SECTIONS: Record<string, string> = {
  sport: 'core', competition: 'core', phase: 'core',
  category: 'core', participants: 'core', content: 'core',
  startDateBE: 'scheduling', startTimeBE: 'scheduling',
  startDateOrigin: 'scheduling', startTimeOrigin: 'scheduling',
  duration: 'scheduling', livestreamDate: 'scheduling', livestreamTime: 'scheduling',
  linearChannel: 'broadcast', radioChannel: 'broadcast',
  onDemandChannel: 'broadcast', linearStartTime: 'broadcast',
  isLive: 'broadcast', isDelayedLive: 'broadcast',
  videoRef: 'reference', winner: 'reference',
  score: 'reference', complex: 'reference',
}

const ESSENTIAL_FIELD_IDS = new Set([
  'sport', 'competition', 'participants',
  'startDateBE', 'startTimeBE', 'linearChannel',
])

const SECTION_ORDER = ['core', 'scheduling', 'broadcast', 'reference', 'custom']
const SECTION_LABELS: Record<string, string> = {
  core: 'Core',
  scheduling: 'Scheduling',
  broadcast: 'Broadcast',
  reference: 'Reference',
  custom: 'Custom Fields',
}
```

**Step 2: Rewrite the component**

The new DynamicEventForm should:
1. Import and use `useEventForm`, `useEventValidation`, `useConflictCheck`
2. Import `FieldSection`, `EventFieldRenderer`, `ConflictBanner`, `SaveFooter`, `DiscardDialog`
3. Track `showAllFields` state (default false for create, true for edit)
4. Track `saveState` ('idle' | 'saving' | 'success' | 'error')
5. Track `showDiscard` state for the dirty guard
6. Load `apiCustomFields` from API (same useEffect as before)
7. Build `optionsMap` from context (same as before)
8. Group `visibleFields` by section using `FIELD_SECTIONS`
9. In create mode with `!showAllFields`, only render fields in `ESSENTIAL_FIELD_IDS`
10. Otherwise render each section via `FieldSection` with fields inside
11. Intercept `onClose` — if dirty, show DiscardDialog instead
12. Override Modal's Escape handler — if dirty, show DiscardDialog
13. `handleSave`: set saveState → 'saving', validate, conflict check, save, set 'success' or 'error'
14. On 'success': setTimeout 600ms → onClose()

Key behavioral notes:
- The `Modal` component handles Escape via `window.addEventListener('keydown')` and backdrop click via `onClick={onClose}`. Since we intercept `onClose`, both paths go through the dirty guard automatically.
- `RepeatSection` and `LinkFromImport` are rendered in the same positions as before.
- The `fieldset disabled={readOnly}` wrapper remains for the read-only mode.

Target: ~150-180 lines.

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: zero errors

**Step 4: Manual smoke test**

Test these flows:
1. Create event (minimal mode) → fill sport, competition, participants, date, time → Save → should succeed and close
2. Create event → "Show all fields" → sections appear with all fields
3. Edit event → all sections visible and expanded
4. Create event → fill some fields → click Cancel → DiscardDialog appears
5. Create event → fill some fields → press Escape → DiscardDialog appears
6. Create event → save fails (disconnect backend) → "Save failed — try again" shown, form stays open
7. Create event → channel conflict → warning shown, second Save proceeds
8. Batch create (multi-day or repeat) → works, closes on success, stays on failure
9. Link-from-import → prefills correctly in Belgium timezone
10. Read-only mode → fields disabled, "Close" button, no save

**Step 5: Commit**

```bash
git add src/components/forms/DynamicEventForm.tsx
git commit -m "feat(modal): rewrite DynamicEventForm as orchestrator with sections and save feedback"
```

---

### Task 10: Update barrel export and clean up

**Files:**
- Modify: `src/components/forms/index.ts` — no changes needed (DynamicEventForm is already exported)
- Verify: `src/App.tsx` — no changes needed (imports DynamicEventForm, prop types unchanged)

**Step 1: Final compilation check**

Run: `npx tsc --noEmit`
Expected: zero errors

**Step 2: Check for dead imports**

Search for any remaining imports of symbols that moved to hooks (like `CORE_FIELD_IDS`, `isCustomField`, `CHANNEL_FIELD_MAP`) — they should only be imported from the hooks now, not duplicated.

Run: `grep -r "CORE_FIELD_IDS\|isCustomField\|CHANNEL_FIELD_MAP" src/ --include="*.ts" --include="*.tsx"`
Expected: only in `src/components/forms/hooks/useEventForm.ts` and `src/components/forms/fields/EventFieldRenderer.tsx`

**Step 3: Commit**

```bash
git add -A
git commit -m "chore(modal): clean up dead imports after decomposition"
```

---

## Summary

| Task | Component | Lines (est.) |
|------|-----------|-------------|
| 1 | useEventForm hook | ~90 |
| 2 | useEventValidation hook | ~70 |
| 3 | useConflictCheck hook | ~50 |
| 4 | FieldSection | ~30 |
| 5 | EventFieldRenderer | ~100 |
| 6 | ConflictBanner | ~20 |
| 7 | SaveFooter | ~60 |
| 8 | DiscardDialog | ~30 |
| 9 | DynamicEventForm rewrite | ~170 |
| 10 | Cleanup | ~0 |
| **Total** | | **~620** (across 9 files vs 520 in 1 file) |

Line count is similar but spread across focused, testable units. Each file has a single responsibility.
