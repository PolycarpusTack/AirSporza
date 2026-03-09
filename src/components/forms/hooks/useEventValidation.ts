import { useState, useEffect, useMemo, useCallback } from 'react'
import type { FieldConfig, MandatoryFieldConfig } from '../../../data/types'
import { fieldsApi } from '../../../services'

export type ApiFieldDef = {
  id: string
  label: string
  fieldType: string
  required: boolean
  visible: boolean
  options: string[]
  defaultValue?: string
}

interface UseEventValidationArgs {
  eventFields: FieldConfig[]
  form: Record<string, string | boolean>
  apiCustomFields: ApiFieldDef[]
  customValues: Record<string, string>
}

interface UseEventValidationReturn {
  errors: Record<string, string>
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
  mandatoryFieldIds: string[]
  mandatoryErrors: string[]
  setMandatoryErrors: React.Dispatch<React.SetStateAction<string[]>>
  visibleFields: FieldConfig[]
  validate: () => boolean
  validateCustomFields: () => string[]
  clearFieldError: (fieldId: string) => void
}

export function useEventValidation({
  eventFields,
  form,
  apiCustomFields,
  customValues,
}: UseEventValidationArgs): UseEventValidationReturn {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [mandatoryFieldIds, setMandatoryFieldIds] = useState<string[]>([])
  const [mandatoryErrors, setMandatoryErrors] = useState<string[]>([])

  const visibleFields = useMemo(
    () => eventFields.filter(f => f.visible).sort((a, b) => a.order - b.order),
    [eventFields],
  )

  // Load mandatory fields when sport changes
  useEffect(() => {
    setMandatoryErrors([])
    const id = Number(form.sport)
    if (!id) {
      setMandatoryFieldIds([])
      return
    }
    fieldsApi
      .getMandatory(id)
      .then((cfg: MandatoryFieldConfig) => setMandatoryFieldIds(cfg.fieldIds))
      .catch(() => setMandatoryFieldIds([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.sport])

  const validate = useCallback((): boolean => {
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
  }, [visibleFields, form])

  const validateCustomFields = useCallback((): string[] => {
    // API custom fields required enforcement
    const missingApiRequired = apiCustomFields
      .filter(f => f.required && f.visible)
      .filter(f => {
        const val = customValues[f.id]
        // Checkbox fields store 'true'/'false' as strings — 'false' means unchecked
        if (f.fieldType === 'checkbox') return val !== 'true'
        return !val || (typeof val === 'string' && val.trim() === '')
      })
      .map(f => f.id)

    // Mandatory field enforcement (sport-specific)
    const missingMandatory = mandatoryFieldIds.filter(fieldId => {
      const val = customValues[fieldId]
      return !val || (typeof val === 'string' && val.trim() === '')
    })

    const allMissing = [...new Set([...missingApiRequired, ...missingMandatory])]
    setMandatoryErrors(allMissing.length > 0 ? allMissing : [])
    return allMissing
  }, [apiCustomFields, customValues, mandatoryFieldIds])

  const clearFieldError = useCallback((fieldId: string) => {
    setErrors(prev => ({ ...prev, [fieldId]: '' }))
  }, [])

  return {
    errors,
    setErrors,
    mandatoryFieldIds,
    mandatoryErrors,
    setMandatoryErrors,
    visibleFields,
    validate,
    validateCustomFields,
    clearFieldError,
  }
}
