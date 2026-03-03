import { useState, useEffect } from 'react'
import { api } from '../../utils/api'

type FieldDef = {
  id: string
  label: string
  fieldType: string
  section: string
  required: boolean
  visible: boolean
  sortOrder: number
  isSystem: boolean
}

export function FieldConfigurator() {
  const [fields, setFields] = useState<FieldDef[]>([])
  const [section, setSection] = useState<'event' | 'crew' | 'contract'>('event')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<FieldDef[]>(`/fields?section=${section}`)
      .then(setFields)
      .finally(() => setLoading(false))
  }, [section])

  const toggleVisible = async (field: FieldDef) => {
    await api.put(`/fields/${field.id}`, { visible: !field.visible })
    setFields(prev => prev.map(f => f.id === field.id ? { ...f, visible: !f.visible } : f))
  }

  const deleteField = async (field: FieldDef) => {
    if (field.isSystem) return
    if (!confirm(`Delete field "${field.label}"?`)) return
    await api.delete(`/fields/${field.id}`)
    setFields(prev => prev.filter(f => f.id !== field.id))
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">Field Configuration</h2>
      <div className="flex gap-2 mb-4">
        {(['event', 'crew', 'contract'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-3 py-1 rounded text-sm ${section === s ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">Label</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Required</th>
              <th className="py-2 pr-4">Visible</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(field => (
              <tr key={field.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4">
                  {field.label}
                  {field.isSystem && <span className="ml-2 text-xs text-gray-400">(system)</span>}
                </td>
                <td className="py-2 pr-4 text-gray-500">{field.fieldType}</td>
                <td className="py-2 pr-4">{field.required ? 'Yes' : 'No'}</td>
                <td className="py-2 pr-4">
                  <button
                    onClick={() => toggleVisible(field)}
                    className={`px-2 py-0.5 rounded text-xs ${field.visible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {field.visible ? 'Visible' : 'Hidden'}
                  </button>
                </td>
                <td className="py-2">
                  {!field.isSystem && (
                    <button
                      onClick={() => deleteField(field)}
                      className="text-red-500 hover:underline text-xs"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
