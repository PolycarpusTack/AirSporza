import { useState, useEffect, useMemo, useCallback } from 'react'
import { Lock } from 'lucide-react'
import { Modal } from '../ui'
import type { FieldConfig, Event } from '../../data/types'
import { SPORTS, COMPETITIONS } from '../../data'
import { genId } from '../../utils'
import { api } from '../../utils/api'
import { DynamicForm } from './DynamicForm'
import { RepeatSection } from './RepeatSection'
import { LinkFromImport } from './LinkFromImport'
import { useApp } from '../../context/AppProvider'
import { useEventForm, isCustomField } from './hooks/useEventForm'
import { useEventValidation, type ApiFieldDef } from './hooks/useEventValidation'
import { useConflictCheck } from './hooks/useConflictCheck'
import FieldSection from './fields/FieldSection'
import { EventFieldRenderer } from './fields/EventFieldRenderer'
import ConflictBanner from './ConflictBanner'
import { SaveFooter, type SaveState } from './SaveFooter'
import { DiscardDialog } from './DiscardDialog'

// ---------------------------------------------------------------------------
// Section mapping
// ---------------------------------------------------------------------------

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
  core: 'Core', scheduling: 'Scheduling', broadcast: 'Broadcast',
  reference: 'Reference', custom: 'Custom Fields',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DynamicEventFormProps {
  eventFields: FieldConfig[]
  onClose: () => void
  onSave: (event: Event) => void | Promise<void>
  onBatchSave?: (events: Partial<Event>[], seriesId: string) => void | Promise<void>
  editEvent?: Event | null
  prefill?: Partial<Record<string, string>> | null
  multiDayDates?: string[] | null
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DynamicEventForm({
  eventFields, onClose, onSave, onBatchSave,
  editEvent, prefill, multiDayDates, readOnly,
}: DynamicEventFormProps) {
  const { orgConfig, sports: ctxSports, competitions: ctxComps } = useApp()

  // --- Hooks ---------------------------------------------------------------
  const {
    form, setForm, customValues, setCustomValues,
    initForm, initCustomValues, update, handleCustomValueChange, isDirty,
  } = useEventForm({ eventFields, editEvent, prefill })

  const [apiCustomFields, setApiCustomFields] = useState<ApiFieldDef[]>([])

  const {
    errors, mandatoryErrors, visibleFields,
    validate, validateCustomFields, clearFieldError,
  } = useEventValidation({ eventFields, form, apiCustomFields, customValues })

  const conflictCheck = useConflictCheck()

  // --- Local state ---------------------------------------------------------
  const [repeatDates, setRepeatDates] = useState<string[]>([])
  const [showAllFields, setShowAllFields] = useState(!!editEvent)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [showDiscard, setShowDiscard] = useState(false)

  // --- Re-init on editEvent change -----------------------------------------
  useEffect(() => {
    setForm(initForm())
    setCustomValues(initCustomValues())
    conflictCheck.reset()
    setSaveState('idle')
    setShowAllFields(!!editEvent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEvent?.id, prefill])

  // --- Load API custom fields once -----------------------------------------
  useEffect(() => {
    api.get<ApiFieldDef[]>('/fields?section=event')
      .then(setApiCustomFields)
      .catch(() => { /* API not available */ })
  }, [])

  // --- Options map ---------------------------------------------------------
  const sportsList = ctxSports.length ? ctxSports : SPORTS
  const compsList = ctxComps.length ? ctxComps : COMPETITIONS

  const optionsMap = useMemo<Record<string, { value: string | number; label: string }[]>>(() => ({
    sports: sportsList.map(s => ({ value: s.id, label: `${s.icon} ${s.name}` })),
    competitions: compsList
      .filter(c => !form.sport || c.sportId === parseInt(form.sport as string))
      .map(c => ({ value: c.id, label: c.name })),
    phases: orgConfig.phases.map(p => ({ value: p, label: p })),
    categories: orgConfig.categories.map(c => ({ value: c, label: c })),
    complexes: orgConfig.complexes.map(c => ({ value: c, label: c })),
  }), [sportsList, compsList, form.sport, orgConfig])

  // --- Field change handler ------------------------------------------------
  const handleFieldChange = useCallback((key: string, value: string | boolean) => {
    update(key, value)
    clearFieldError(key)
    conflictCheck.reset()
  }, [update, clearFieldError, conflictCheck])

  const handleLinkImport = useCallback((data: Record<string, string | undefined>) => {
    Object.entries(data).forEach(([key, value]) => {
      if (value) handleFieldChange(key, value)
    })
  }, [handleFieldChange])

  // --- Close with dirty guard ----------------------------------------------
  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDiscard(true)
    } else {
      onClose()
    }
  }, [isDirty, onClose])

  // --- Build event object --------------------------------------------------
  const buildEvent = useCallback((): Event => {
    const customFields: Record<string, unknown> = {
      ...(editEvent?.customFields as Record<string, unknown>),
    }
    eventFields.forEach(field => {
      if (isCustomField(field.id, eventFields)) {
        customFields[field.id] = form[field.id]
      }
    })

    const channelId = form.linearChannel ? Number(form.linearChannel) || null : null
    const radioChannelId = form.radioChannel ? Number(form.radioChannel) || null : null
    const onDemandChannelId = form.onDemandChannel ? Number(form.onDemandChannel) || null : null

    return {
      id: editEvent?.id || genId(),
      sportId: parseInt(form.sport as string) || 0,
      competitionId: parseInt(form.competition as string) || 0,
      phase: form.phase as string,
      category: form.category as string,
      participants: form.participants as string,
      content: form.content as string,
      startDateBE: form.startDateBE as string,
      startTimeBE: form.startTimeBE as string,
      startDateOrigin: form.startDateOrigin as string,
      startTimeOrigin: form.startTimeOrigin as string,
      complex: form.complex as string,
      livestreamDate: form.livestreamDate as string,
      livestreamTime: form.livestreamTime as string,
      channelId,
      radioChannelId,
      onDemandChannelId,
      linearChannel: undefined,
      radioChannel: undefined,
      linearStartTime: form.linearStartTime as string,
      onDemandChannel: undefined,
      isLive: form.isLive as boolean,
      isDelayedLive: form.isDelayedLive as boolean,
      videoRef: form.videoRef as string,
      winner: form.winner as string,
      score: form.score as string,
      duration: form.duration as string,
      customFields,
      customValues: Object.entries(customValues).map(([fieldId, fieldValue]) => ({
        fieldId,
        fieldValue,
      })),
    }
  }, [form, customValues, editEvent, eventFields])

  // --- Save ----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    setSaveState('saving')

    // 1. Validate core fields
    if (!validate()) { setSaveState('idle'); return }

    // 2. Conflict check
    if (form.competition && form.startDateBE && form.startTimeBE) {
      const channelId = form.linearChannel ? Number(form.linearChannel) || undefined : undefined
      const radioChannelId = form.radioChannel ? Number(form.radioChannel) || undefined : undefined
      const onDemandChannelId = form.onDemandChannel ? Number(form.onDemandChannel) || undefined : undefined

      const outcome = await conflictCheck.checkOrConfirm({
        id: editEvent?.id,
        competitionId: Number(form.competition),
        channelId,
        radioChannelId,
        onDemandChannelId,
        startDateBE: form.startDateBE as string,
        startTimeBE: form.startTimeBE as string,
        status: editEvent?.status,
      }, !!conflictCheck.conflicts)

      if (outcome === 'blocked') { setSaveState('idle'); return }
    }

    // 3. Validate custom fields
    const missingCustom = validateCustomFields()
    if (missingCustom.length > 0) { setSaveState('idle'); return }

    // 4. Build event
    const event = buildEvent()

    try {
      // Batch mode: multi-day series
      if (multiDayDates && multiDayDates.length > 1 && onBatchSave) {
        const seriesId = crypto.randomUUID()
        const events = multiDayDates.map(date => ({
          ...event,
          id: undefined,
          startDateBE: date,
          seriesId,
        }))
        await onBatchSave(events as Partial<Event>[], seriesId)
        setSaveState('success')
        setTimeout(onClose, 600)
        return
      }

      // Repeat pattern mode
      if (repeatDates.length > 1 && onBatchSave) {
        const seriesId = crypto.randomUUID()
        const events = repeatDates.map(date => ({
          ...event,
          id: undefined,
          startDateBE: date,
          seriesId,
        }))
        await onBatchSave(events as Partial<Event>[], seriesId)
        setSaveState('success')
        setTimeout(onClose, 600)
        return
      }

      // Single save
      await onSave(event)
      setSaveState('success')
      setTimeout(onClose, 600)
    } catch {
      setSaveState('error')
    }
  }, [
    validate, validateCustomFields, conflictCheck, buildEvent,
    form, editEvent, multiDayDates, repeatDates,
    onSave, onBatchSave, onClose,
  ])

  // --- Section grouping ----------------------------------------------------
  const fieldsBySection = useMemo(() => {
    const groups: Record<string, FieldConfig[]> = {}
    for (const s of SECTION_ORDER) groups[s] = []

    for (const f of visibleFields) {
      const section = FIELD_SECTIONS[f.id] ?? 'custom'
      ;(groups[section] ??= []).push(f)
    }
    return groups
  }, [visibleFields])

  // --- Render helpers ------------------------------------------------------
  const renderFieldItem = (field: FieldConfig) => (
    <div key={field.id} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
      <label className="field-label flex items-center gap-1.5">
        {field.label}
        {field.required && <span className="text-danger">*</span>}
        {field.isCustom && (
          <span className="rounded-sm border border-border bg-surface-2 px-1 text-[10px] text-text-2">
            custom
          </span>
        )}
      </label>
      <EventFieldRenderer
        field={field}
        value={form[field.id] ?? ''}
        error={errors[field.id]}
        onChange={v => handleFieldChange(field.id, v)}
        optionsMap={optionsMap}
      />
      {errors[field.id] && (
        <p className="mt-1 text-xs text-danger">{errors[field.id]}</p>
      )}
    </div>
  )

  const essentialFields = visibleFields.filter(f => ESSENTIAL_FIELD_IDS.has(f.id))

  // --- JSX -----------------------------------------------------------------
  return (
    <Modal
      onClose={handleClose}
      title={readOnly ? 'View Event (Locked)' : editEvent ? 'Edit Event' : 'New Sports Event'}
    >
      {readOnly && (
        <div className="flex items-center gap-2 mx-6 mt-4 mb-0 px-3 py-2 bg-warning/10 border border-warning/20 rounded-lg text-sm text-warning">
          <Lock className="w-4 h-4 flex-shrink-0" />
          This event is locked and cannot be edited.
        </div>
      )}

      {multiDayDates && multiDayDates.length > 1 && (
        <div className="bg-primary/10 border border-primary/30 rounded px-3 py-2 mx-6 mt-4 mb-0 text-sm">
          <span className="font-bold text-primary">Series</span>
          <span className="text-text-2 ml-2">
            Creating events on{' '}
            {multiDayDates
              .map(d =>
                new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short',
                }),
              )
              .join(', ')}
          </span>
        </div>
      )}

      {!editEvent && (
        <div className="px-6 pt-4 pb-0">
          <LinkFromImport onLink={handleLinkImport} />
        </div>
      )}

      <fieldset disabled={readOnly} className="contents">
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto">
          {!showAllFields ? (
            <>
              {essentialFields.map(renderFieldItem)}
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowAllFields(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Show all fields...
                </button>
              </div>
            </>
          ) : (
            <>
              {SECTION_ORDER.map(section => {
                const fields = fieldsBySection[section] ?? []
                if (section === 'custom' && fields.length === 0 && apiCustomFields.length === 0) return null
                if (section !== 'custom' && fields.length === 0) return null

                return (
                  <FieldSection
                    key={section}
                    title={SECTION_LABELS[section]}
                    fieldCount={section === 'custom' ? (fields.length + apiCustomFields.length) : fields.length}
                    defaultOpen={!!editEvent || section === 'core' || section === 'scheduling'}
                  >
                    {fields.map(renderFieldItem)}
                    {section === 'custom' && apiCustomFields.length > 0 && (
                      <div className="sm:col-span-2">
                        <DynamicForm
                          fields={apiCustomFields}
                          values={customValues}
                          onChange={handleCustomValueChange}
                          mandatoryErrors={mandatoryErrors}
                        />
                      </div>
                    )}
                  </FieldSection>
                )
              })}
            </>
          )}

          {/* API custom fields in minimal mode */}
          {!showAllFields && apiCustomFields.length > 0 && (
            <div className="sm:col-span-2 border-t border-border pt-4">
              <p className="text-xs uppercase tracking-wide text-text-2 mb-3">Custom Fields</p>
              <DynamicForm
                fields={apiCustomFields}
                values={customValues}
                onChange={handleCustomValueChange}
                mandatoryErrors={mandatoryErrors}
              />
            </div>
          )}
        </div>
      </fieldset>

      {!editEvent && !multiDayDates?.length && !readOnly && (
        <div className="px-6 pb-2">
          <RepeatSection
            startDate={form.startDateBE as string}
            onDatesChange={setRepeatDates}
            competitionId={Number(form.competition) || undefined}
          />
        </div>
      )}

      <div className="px-6">
        <ConflictBanner conflicts={conflictCheck.conflicts} />
      </div>

      <SaveFooter
        onSave={handleSave}
        onCancel={handleClose}
        saveState={saveState}
        requiredCount={visibleFields.filter(f => f.required).length}
        readOnly={readOnly}
        isEdit={!!editEvent}
      />

      {showDiscard && (
        <DiscardDialog
          onDiscard={onClose}
          onKeepEditing={() => setShowDiscard(false)}
        />
      )}
    </Modal>
  )
}
