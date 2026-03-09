import { useState, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { Modal, Btn } from '../ui'
import { ChannelSelect } from '../ui/ChannelSelect'
import type { FieldConfig, Event, MandatoryFieldConfig, ChannelType } from '../../data/types'
import { SPORTS, COMPETITIONS } from '../../data'
import { genId } from '../../utils'
import { api } from '../../utils/api'
import { DynamicForm } from './DynamicForm'
import { RepeatSection } from './RepeatSection'
import { LinkFromImport } from './LinkFromImport'
import { useApp } from '../../context/AppProvider'
import { conflictsApi, type ConflictResult } from '../../services/conflicts'
import { fieldsApi } from '../../services'

/** Maps dropdown option keys to Channel FK fields and type filters */
const CHANNEL_FIELD_MAP: Record<string, { fkField: keyof Event; typeFilter?: ChannelType }> = {
  channels:          { fkField: 'channelId',         typeFilter: 'linear' },
  radioChannels:     { fkField: 'radioChannelId',    typeFilter: 'radio' },
  onDemandChannels:  { fkField: 'onDemandChannelId', typeFilter: 'on-demand' },
}

type ApiFieldDef = {
  id: string
  label: string
  fieldType: string
  required: boolean
  visible: boolean
  options: string[]
  defaultValue?: string
}

interface DynamicEventFormProps {
  eventFields: FieldConfig[]
  onClose: () => void
  onSave: (event: Event) => void
  onBatchSave?: (events: Partial<Event>[], seriesId: string) => void
  editEvent?: Event | null
  prefill?: Partial<Record<string, string>> | null
  multiDayDates?: string[] | null
  readOnly?: boolean
}

const CORE_FIELD_IDS = new Set([
  'sport', 'competition',
  'phase', 'category', 'participants', 'content',
  'startDateBE', 'startTimeBE', 'startDateOrigin', 'startTimeOrigin',
  'complex', 'livestreamDate', 'livestreamTime',
  'linearChannel', 'radioChannel', 'linearStartTime', 'onDemandChannel',
  'isLive', 'isDelayedLive',
  'videoRef', 'winner', 'score', 'duration',
])

function isCustomField(fieldId: string, fieldConfig: FieldConfig[]): boolean {
  if (CORE_FIELD_IDS.has(fieldId)) return false
  const field = fieldConfig.find(f => f.id === fieldId)
  return field?.isCustom === true || !CORE_FIELD_IDS.has(fieldId)
}

export function DynamicEventForm({ eventFields, onClose, onSave, onBatchSave, editEvent, prefill, multiDayDates, readOnly }: DynamicEventFormProps) {
  const { orgConfig, sports: ctxSports, competitions: ctxComps } = useApp()

  const initForm = (): Record<string, string | boolean> => {
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
        // Channel FK fields: store the numeric ID as a string
        const { fkField } = CHANNEL_FIELD_MAP[field.options]
        const fkVal = editEvent?.[fkField]
        if (fkVal != null) {
          f[field.id] = String(fkVal)
        } else {
          f[field.id] = ''
        }
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
  }

  const [form, setForm] = useState<Record<string, string | boolean>>(initForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiCustomFields, setApiCustomFields] = useState<ApiFieldDef[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [conflicts, setConflicts] = useState<ConflictResult | null>(null)
  const [mandatoryFieldIds, setMandatoryFieldIds] = useState<string[]>([])
  const [mandatoryErrors, setMandatoryErrors] = useState<string[]>([])
  const [repeatDates, setRepeatDates] = useState<string[]>([])

  useEffect(() => {
    setForm(initForm())
    // Prefill custom values from editEvent if available
    if (editEvent?.customValues && editEvent.customValues.length > 0) {
      const map: Record<string, string> = {}
      for (const cv of editEvent.customValues) {
        map[cv.fieldId] = cv.fieldValue
      }
      setCustomValues(map)
    } else {
      setCustomValues({})
    }
    setConflicts(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEvent?.id, prefill])

  useEffect(() => {
    api.get<ApiFieldDef[]>('/fields?section=event')
      .then(setApiCustomFields)
      .catch(() => { /* API not available, skip */ })
  }, [])

  useEffect(() => {
    setMandatoryErrors([])
    const id = Number(form.sport)
    if (!id) { setMandatoryFieldIds([]); return }
    fieldsApi.getMandatory(id)
      .then((cfg: MandatoryFieldConfig) => setMandatoryFieldIds(cfg.fieldIds))
      .catch(() => setMandatoryFieldIds([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.sport])

  const handleCustomValueChange = (fieldId: string, value: string) => {
    setCustomValues(prev => ({ ...prev, [fieldId]: value }))
  }

  const update = (k: string, v: string | boolean) => {
    setForm(p => ({ ...p, [k]: v }))
    setErrors(p => ({ ...p, [k]: '' }))
    setConflicts(null)
  }

  const handleLinkImport = (data: Record<string, string | undefined>) => {
    Object.entries(data).forEach(([key, value]) => {
      if (value) update(key, value)
    })
  }

  const sportsList = ctxSports.length ? ctxSports : SPORTS
  const compsList  = ctxComps.length  ? ctxComps  : COMPETITIONS

  const optionsMap: Record<string, { value: string | number; label: string }[]> = {
    sports: sportsList.map(s => ({ value: s.id, label: `${s.icon} ${s.name}` })),
    competitions: compsList.filter(c => !form.sport || c.sportId === parseInt(form.sport as string)).map(c => ({ value: c.id, label: c.name })),
    phases: orgConfig.phases.map(p => ({ value: p, label: p })),
    categories: orgConfig.categories.map(c => ({ value: c, label: c })),
    complexes: orgConfig.complexes.map(c => ({ value: c, label: c })),
    // channels, onDemandChannels, radioChannels removed — CHANNEL_FIELD_MAP intercepts these fields first
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
    if (!sportId || sportId === 0) {
      errs.sport = 'Valid sport required'
    }
    if (!competitionId || competitionId === 0) {
      errs.competition = 'Valid competition required'
    }
    
    if (form.duration && !/^\d{2}:\d{2}:\d{2};\d{2}$/.test(form.duration as string)) {
      errs.duration = 'Format: HH:MM:SS;FF (e.g. 01:45:22;12)'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return

    const customFields: Record<string, unknown> = { ...editEvent?.customFields as Record<string, unknown> }

    eventFields.forEach(field => {
      if (isCustomField(field.id, eventFields)) {
        customFields[field.id] = form[field.id]
      }
    })

    const channelId = form.linearChannel ? Number(form.linearChannel) || null : null
    const radioChannelId = form.radioChannel ? Number(form.radioChannel) || null : null
    const onDemandChannelId = form.onDemandChannel ? Number(form.onDemandChannel) || null : null

    const event: Event = {
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
      linearChannel: undefined,   // @deprecated — channelId FK is source of truth
      radioChannel: undefined,    // @deprecated — radioChannelId FK is source of truth
      linearStartTime: form.linearStartTime as string,
      onDemandChannel: undefined, // @deprecated — onDemandChannelId FK is source of truth
      isLive: form.isLive as boolean,
      isDelayedLive: form.isDelayedLive as boolean,
      videoRef: form.videoRef as string,
      winner: form.winner as string,
      score: form.score as string,
      duration: form.duration as string,
      customFields,
      customValues: Object.entries(customValues).map(([fieldId, fieldValue]) => ({ fieldId, fieldValue })),
    }

    // Only run check if we have the required fields
    if (form.competition && form.startDateBE && form.startTimeBE) {
      const result = await conflictsApi.check({
        id: editEvent?.id,
        competitionId: Number(form.competition),
        channelId: channelId ?? undefined,
        radioChannelId: radioChannelId ?? undefined,
        onDemandChannelId: onDemandChannelId ?? undefined,
        linearChannel: undefined,
        onDemandChannel: undefined,
        radioChannel: undefined,
        startDateBE: form.startDateBE as string,
        startTimeBE: form.startTimeBE as string,
        status: editEvent?.status,
      }).catch(() => null)

      setConflicts(result)

      // Hard errors always block
      if (result?.errors && result.errors.length > 0) return

      // First time we detect warnings, stop and let user review.
      // If conflicts is already set the user already saw them and is confirming.
      if (result?.warnings && result.warnings.length > 0 && !conflicts) return
    }

    // Mandatory field enforcement
    const missingMandatory = mandatoryFieldIds.filter(fieldId => {
      const val = customValues[fieldId]
      return !val || (typeof val === 'string' && val.trim() === '')
    })
    if (missingMandatory.length > 0) {
      setMandatoryErrors(missingMandatory)
      return
    }
    setMandatoryErrors([])

    // Batch mode: create series of events
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

    // Repeat pattern mode
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

    onSave(event)
    onClose()
  }

  const inputCls = 'field-input'
  const errCls = 'border-danger focus:border-danger focus:ring-danger/20'

  const renderField = (field: FieldConfig) => {
    const hasErr = errors[field.id]
    const cls = `${inputCls} ${hasErr ? errCls : 'border-border'}`

    // Channel FK dropdowns — render ChannelSelect with type filter + hierarchy
    if (field.type === 'dropdown' && field.options && CHANNEL_FIELD_MAP[field.options]) {
      const { typeFilter } = CHANNEL_FIELD_MAP[field.options]
      const numVal = form[field.id] ? Number(form[field.id]) : null
      return (
        <ChannelSelect
          value={numVal}
          onChange={(id) => update(field.id, id != null ? String(id) : '')}
          type={typeFilter}
          placeholder={`Select ${field.label.toLowerCase()}...`}
          className={hasErr ? errCls : ''}
        />
      )
    }
    if (field.type === 'dropdown' && field.options && optionsMap[field.options]) {
      return (
        <select
          value={form[field.id] as string || ''}
          onChange={e => update(field.id, e.target.value)}
          className={cls}
        >
          <option value=''>Select...</option>
          {optionsMap[field.options].map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )
    }
    if (field.type === 'dropdown' && field.isCustom && field.options) {
      const opts = (typeof field.options === 'string' ? field.options.split(',') : []).map(o => o.trim()).filter(Boolean)
      return (
        <select
          value={form[field.id] as string || ''}
          onChange={e => update(field.id, e.target.value)}
          className={cls}
        >
          <option value=''>Select...</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    if (field.type === 'checkbox') {
      return (
        <label className='flex items-center gap-2 py-1 cursor-pointer'>
          <input
            type='checkbox'
            checked={!!form[field.id]}
            onChange={e => update(field.id, e.target.checked)}
            className='h-4 w-4 rounded border-border text-primary'
          />
          <span className='text-sm text-text-2'>{form[field.id] ? 'Yes' : 'No'}</span>
        </label>
      )
    }
    if (field.type === 'textarea') {
      return (
        <textarea
          value={form[field.id] as string || ''}
          onChange={e => update(field.id, e.target.value)}
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
            value={form[field.id] as string || ''}
            onChange={e => update(field.id, e.target.value)}
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
        value={form[field.id] as string || ''}
        onChange={e => update(field.id, e.target.value)}
        className={cls}
      />
    )
  }

  return (
    <Modal onClose={onClose} title={readOnly ? 'View Event (Locked)' : editEvent ? 'Edit Event' : 'New Sports Event'}>
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
            {multiDayDates.map(d =>
              new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
            ).join(', ')}
          </span>
        </div>
      )}
      {!editEvent && (
        <div className="px-6 pt-4 pb-0">
          <LinkFromImport onLink={handleLinkImport} />
        </div>
      )}
      <fieldset disabled={readOnly} className="contents">
      <div className='p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto'>
        {visibleFields.map(field => (
          <div key={field.id} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
            <label className='field-label flex items-center gap-1.5'>
              {field.label}
              {field.required && <span className='text-danger'>*</span>}
              {field.isCustom && <span className='rounded-sm border border-border bg-surface-2 px-1 text-[10px] text-text-2'>custom</span>}
            </label>
            {renderField(field)}
            {errors[field.id] && <p className='mt-1 text-xs text-danger'>{errors[field.id]}</p>}
          </div>
        ))}
        {apiCustomFields.length > 0 && (
          <div className='sm:col-span-2 border-t border-border pt-4'>
            <p className='text-xs uppercase tracking-wide text-text-2 mb-3'>Custom Fields</p>
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
      <div className='border-t border-border px-6 pt-4 pb-4 space-y-3'>
        {conflicts && (conflicts.errors.length > 0 || conflicts.warnings.length > 0) && (
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
        )}
        <div className='flex items-center justify-between'>
          <span className='text-xs uppercase tracking-wide text-text-2'>{readOnly ? 'Read-only' : `${visibleFields.filter(f => f.required).length} required fields`}</span>
          <div className='flex gap-2'>
            <Btn onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Btn>
            {!readOnly && <Btn variant='primary' onClick={handleSave}>{editEvent ? 'Save Changes' : 'Create Event'}</Btn>}
          </div>
        </div>
      </div>
    </Modal>
  )
}
