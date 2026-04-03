import type { TransformType, FieldMapping, FieldOverride } from './types.js'
import { logger } from '../utils/logger.js'

export function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)]/g, '.$1').split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = Array.isArray(current)
      ? current[Number(part)]
      : (current as Record<string, unknown>)[part]
  }
  return current
}

export function applyTransform(
  value: unknown,
  transform: TransformType,
  config: Record<string, unknown>,
  source: Record<string, unknown>
): unknown {
  try {
    switch (transform) {
      case 'map_value': {
        const mapping = config.mapping
        if (!mapping || typeof mapping !== 'object') return value
        return (mapping as Record<string, unknown>)[String(value)] ?? value
      }
      case 'default_value':
        return value == null || value === '' ? config.value : value
      case 'date_format': {
        if (!value) return value
        const date = new Date(String(value))
        if (isNaN(date.getTime())) return value
        if (config.to === 'YYYY-MM-DD') return date.toISOString().split('T')[0]
        if (config.to === 'HH:mm') return date.toISOString().split('T')[1].slice(0, 5)
        return date.toISOString()
      }
      case 'string_concat': {
        const fields = Array.isArray(config.fields) ? config.fields as string[] : []
        const separator = typeof config.separator === 'string' ? config.separator : ' '
        return fields.map(f => getValueByPath(source, f)).filter(Boolean).join(separator)
      }
      case 'alias_lookup':
        return value
      case 'json_path': {
        const path = typeof config.path === 'string' ? config.path : ''
        return path ? getValueByPath(source, path) : value
      }
      default: {
        const _exhaustive: never = transform
        return value
      }
    }
  } catch (err) {
    logger.warn('Transform failed, using raw value', { transform, config, err })
    return value
  }
}

export function applyFieldMappings(
  source: Record<string, unknown>,
  templateMappings: FieldMapping[],
  overrides: FieldOverride[] = []
): Record<string, unknown> {
  const overrideTargets = new Set(overrides.map(o => o.targetField))
  const effective: FieldMapping[] = [
    ...templateMappings.filter(m => !overrideTargets.has(m.targetField)),
    ...overrides,
  ]
  const result: Record<string, unknown> = {}
  for (const mapping of effective) {
    const raw = getValueByPath(source, mapping.sourceField)
    const value = mapping.transform
      ? applyTransform(raw, mapping.transform, mapping.transformConfig || {}, source)
      : raw
    if (value !== undefined) result[mapping.targetField] = value
  }
  return result
}
