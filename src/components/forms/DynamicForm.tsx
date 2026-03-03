// Renders a list of FieldDefinitions as form inputs.

type FieldDef = {
  id: string
  label: string
  fieldType: string
  required: boolean
  visible: boolean
  options: string[]
  defaultValue?: string
}

type Props = {
  fields: FieldDef[]
  values: Record<string, string>
  onChange: (fieldId: string, value: string) => void
}

export function DynamicForm({ fields, values, onChange }: Props) {
  const visibleFields = fields.filter(f => f.visible)

  return (
    <div className="space-y-3">
      {visibleFields.map(field => (
        <div key={field.id}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>

          {field.fieldType === 'text' && (
            <input
              type="text"
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          )}

          {field.fieldType === 'textarea' && (
            <textarea
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
              rows={3}
            />
          )}

          {field.fieldType === 'number' && (
            <input
              type="number"
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          )}

          {field.fieldType === 'date' && (
            <input
              type="date"
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          )}

          {field.fieldType === 'time' && (
            <input
              type="time"
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          )}

          {field.fieldType === 'checkbox' && (
            <input
              type="checkbox"
              checked={values[field.id] === 'true'}
              onChange={e => onChange(field.id, String(e.target.checked))}
              className="h-4 w-4"
            />
          )}

          {field.fieldType === 'dropdown' && (
            <select
              value={values[field.id] ?? field.defaultValue ?? ''}
              onChange={e => onChange(field.id, e.target.value)}
              required={field.required}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="">— select —</option>
              {field.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  )
}
