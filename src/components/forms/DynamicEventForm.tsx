import { useState, useEffect } from 'react'
import { Modal, Btn } from '../ui'
import type { FieldConfig, Event, MandatoryFieldConfig } from '../../data/types'
import { SPORTS, COMPETITIONS } from '../../data'
import { genId } from '../../utils'
import { api } from '../../utils/api'
import { DynamicForm } from './DynamicForm'
import { useApp } from '../../context/AppProvider'
import { conflictsApi, type ConflictResult } from '../../services/conflicts'
import { fieldsApi } from '../../services'

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
  editEvent?: Event | null
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

export function DynamicEventForm({ eventFields, onClose, onSave, editEvent }: DynamicEventFormProps) {
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
      } else if (editEvent && editEvent[field.id as keyof Event] !== undefined) {
        f[field.id] = editEvent[field.id as keyof Event] as string | boolean
      } else if (field.type === 'checkbox') {
        f[field.id] = false
      } else {
        f[field.id] = ''
      }
    })
    return f
  }

  const [form, setForm] = useState<Record<string, string | boolean>>(initForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiCustomFields, setApiCustomFields] = useState<ApiFieldDef[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [conflicts, setConflicts] = useState<ConflictResult | null>(null)
  const [mandatoryFieldIds, setMandatoryFieldIds] = useState<string[]>([])
  const [mandatoryErrors, setMandatoryErrors] = useState<string[]>([])

  useEffect(() => {
    setForm(initForm())
    setCustomValues({})
    setConflicts(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEvent?.id])

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

  const sportsList = ctxSports.length ? ctxSports : SPORTS
  const compsList  = ctxComps.length  ? ctxComps  : COMPETITIONS

  const optionsMap: Record<string, { value: string | number; label: string }[]> = {
    sports: sportsList.map(s => ({ value: s.id, label: `${s.icon} ${s.name}` })),
    competitions: compsList.filter(c => !form.sport || c.sportId === parseInt(form.sport as string)).map(c => ({ value: c.id, label: c.name })),
    phases: orgConfig.phases.map(p => ({ value: p, label: p })),
    categories: orgConfig.categories.map(c => ({ value: c, label: c })),
    complexes: orgConfig.complexes.map(c => ({ value: c, label: c })),
    channels: orgConfig.channels.map(c => ({ value: c.name, label: c.name })),
    onDemandChannels: orgConfig.onDemandChannels.map(c => ({ value: c.name, label: c.name })),
    radioChannels: orgConfig.radioChannels.map(c => ({ value: c, label: c })),
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
      linearChannel: form.linearChannel as string,
      radioChannel: form.radioChannel as string,
      linearStartTime: form.linearStartTime as string,
      onDemandChannel: form.onDemandChannel as string,
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
        linearChannel: form.linearChannel as string | undefined,
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

    onSave(event)
    onClose()
  }

  const inputCls = 'field-input'
  const errCls = 'border-danger focus:border-danger focus:ring-danger/20'

  const renderField = (field: FieldConfig) => {
    const hasErr = errors[field.id]
    const cls = `${inputCls} ${hasErr ? errCls : 'border-border'}`

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
    <Modal onClose={onClose} title={editEvent ? 'Edit Event' : 'New Sports Event'}>
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
          <span className='text-xs uppercase tracking-wide text-text-2'>{visibleFields.filter(f => f.required).length} required fields</span>
          <div className='flex gap-2'>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant='primary' onClick={handleSave}>{editEvent ? 'Save Changes' : 'Create Event'}</Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}
