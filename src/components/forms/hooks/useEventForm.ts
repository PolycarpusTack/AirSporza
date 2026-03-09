import { useState, useRef, useCallback } from 'react'
import type { FieldConfig, Event, ChannelType } from '../../../data/types'

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

/** Maps dropdown option keys to Channel FK fields and type filters */
export const CHANNEL_FIELD_MAP: Record<string, { fkField: keyof Event; typeFilter?: ChannelType }> = {
  channels:         { fkField: 'channelId',         typeFilter: 'linear' },
  radioChannels:    { fkField: 'radioChannelId',    typeFilter: 'radio' },
  onDemandChannels: { fkField: 'onDemandChannelId', typeFilter: 'on-demand' },
}

export const CORE_FIELD_IDS = new Set([
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type FormState = Record<string, string | boolean>
export type CustomValuesState = Record<string, string>

interface UseEventFormOptions {
  eventFields: FieldConfig[]
  editEvent?: Event | null
  prefill?: Partial<Record<string, string>> | null
}

interface UseEventFormReturn {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  customValues: CustomValuesState
  setCustomValues: React.Dispatch<React.SetStateAction<CustomValuesState>>
  initForm: () => FormState
  initCustomValues: () => CustomValuesState
  update: (key: string, value: string | boolean) => void
  handleCustomValueChange: (fieldId: string, value: string) => void
  isDirty: boolean
  resetDirty: () => void
}

function buildFormState(
  eventFields: FieldConfig[],
  editEvent?: Event | null,
  prefill?: Partial<Record<string, string>> | null,
): FormState {
  const f: FormState = {}
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

function buildCustomValues(editEvent?: Event | null): CustomValuesState {
  if (editEvent?.customValues && editEvent.customValues.length > 0) {
    const map: CustomValuesState = {}
    for (const cv of editEvent.customValues) {
      map[cv.fieldId] = cv.fieldValue
    }
    return map
  }
  return {}
}

function snapshot(form: FormState, customValues: CustomValuesState): string {
  return JSON.stringify({ form, customValues })
}

export function useEventForm({ eventFields, editEvent, prefill }: UseEventFormOptions): UseEventFormReturn {
  const initForm = useCallback(
    () => buildFormState(eventFields, editEvent, prefill),
    // We intentionally depend on editEvent?.id rather than the full object
    // to avoid re-init on every render while still catching actual edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventFields, editEvent?.id, prefill],
  )

  const initCustomValues = useCallback(
    () => buildCustomValues(editEvent),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editEvent?.id],
  )

  const [form, setForm] = useState<FormState>(initForm)
  const [customValues, setCustomValues] = useState<CustomValuesState>(initCustomValues)

  // Dirty tracking — snapshot of last-saved / initial state
  const snapshotRef = useRef<string>(snapshot(form, customValues))

  const isDirty = snapshot(form, customValues) !== snapshotRef.current

  const resetDirty = useCallback(() => {
    snapshotRef.current = snapshot(form, customValues)
  }, [form, customValues])

  const update = useCallback((key: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleCustomValueChange = useCallback((fieldId: string, value: string) => {
    setCustomValues(prev => ({ ...prev, [fieldId]: value }))
  }, [])

  return {
    form,
    setForm,
    customValues,
    setCustomValues,
    initForm,
    initCustomValues,
    update,
    handleCustomValueChange,
    isDirty,
    resetDirty,
  }
}
