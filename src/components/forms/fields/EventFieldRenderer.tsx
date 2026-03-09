import type { FieldConfig } from '../../../data/types'
import { CHANNEL_FIELD_MAP } from '../hooks/useEventForm'
import { ChannelSelect } from '../../ui/ChannelSelect'

export interface EventFieldRendererProps {
  field: FieldConfig
  value: string | boolean
  error?: string
  onChange: (value: string | boolean) => void
  optionsMap: Record<string, { value: string | number; label: string }[]>
}

const inputCls = 'field-input'
const errCls = 'border-danger focus:border-danger focus:ring-danger/20'

export function EventFieldRenderer({ field, value, error, onChange, optionsMap }: EventFieldRendererProps) {
  const cls = `${inputCls} ${error ? errCls : 'border-border'}`

  // 1. Custom dropdown with literal comma-separated options
  if (field.type === 'dropdown' && field.isCustom && field.options) {
    const opts = (typeof field.options === 'string' ? field.options.split(',') : [])
      .map(o => o.trim())
      .filter(Boolean)
    return (
      <select
        value={(value as string) || ''}
        onChange={e => onChange(e.target.value)}
        className={cls}
      >
        <option value=''>Select...</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  // 2. Channel FK dropdown — render ChannelSelect with type filter
  if (field.type === 'dropdown' && field.options && CHANNEL_FIELD_MAP[field.options]) {
    const { typeFilter } = CHANNEL_FIELD_MAP[field.options]
    const numVal = value ? Number(value) : null
    return (
      <ChannelSelect
        value={numVal}
        onChange={(id) => onChange(id != null ? String(id) : '')}
        type={typeFilter}
        placeholder={`Select ${field.label.toLowerCase()}...`}
        className={error ? errCls : ''}
      />
    )
  }

  // 3. System dropdown — sports, competitions, phases, etc.
  if (field.type === 'dropdown' && field.options && optionsMap[field.options]) {
    return (
      <select
        value={(value as string) || ''}
        onChange={e => onChange(e.target.value)}
        className={cls}
      >
        <option value=''>Select...</option>
        {optionsMap[field.options].map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  // 4. Checkbox
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

  // 5. Textarea
  if (field.type === 'textarea') {
    return (
      <textarea
        value={(value as string) || ''}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className={cls}
      />
    )
  }

  // 6. Duration — SMPTE timecode input
  if (field.id === 'duration') {
    return (
      <>
        <input
          type='text'
          value={(value as string) || ''}
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

  // 7. Default — map field.type to input type attribute
  const inputType = field.type === 'number' ? 'number'
    : field.type === 'date' ? 'date'
    : field.type === 'time' ? 'time'
    : 'text'

  return (
    <input
      type={inputType}
      value={(value as string) || ''}
      onChange={e => onChange(e.target.value)}
      className={cls}
    />
  )
}
