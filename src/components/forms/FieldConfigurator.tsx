import { useState } from 'react'
import { Modal, Toggle, Btn, Grip } from '../ui'
import type { FieldConfig, FieldType } from '../../data/types'
import { genId } from '../../utils'

interface FieldConfiguratorProps {
  fields: FieldConfig[]
  setFields: (fields: FieldConfig[]) => void
  title: string
  onClose: () => void
}

interface NewFieldForm {
  label: string
  type: FieldType
  optionsList?: string
}

const PROTECTED_FIELDS = new Set(['sport', 'competition'])
const CORE_REQUIRED_FIELDS = new Set(['sport', 'competition', 'participants', 'startDateBE', 'startTimeBE'])

export function FieldConfigModal({ fields, setFields, title, onClose }: FieldConfiguratorProps) {
  const [editingField, setEditingField] = useState<string | null>(null)
  const [newFieldForm, setNewFieldForm] = useState<NewFieldForm | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const sorted = [...fields].sort((a, b) => a.order - b.order)

  const moveField = (fromIdx: number, toIdx: number) => {
    const reordered = [...sorted]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setFields(reordered.map((f, i) => ({ ...f, order: i })))
  }

  const toggleVisible = (id: string) => {
    if (PROTECTED_FIELDS.has(id)) return
    setFields(fields.map(f => f.id === id ? { ...f, visible: !f.visible } : f))
  }

  const toggleRequired = (id: string) => {
    if (CORE_REQUIRED_FIELDS.has(id)) return
    setFields(fields.map(f => f.id === id ? { ...f, required: !f.required } : f))
  }

  const updateFieldLabel = (id: string, label: string) => {
    if (PROTECTED_FIELDS.has(id)) return
    setFields(fields.map(f => f.id === id ? { ...f, label } : f))
  }

  const deleteField = (id: string) => {
    if (PROTECTED_FIELDS.has(id)) return
    setFields(fields.filter(f => f.id !== id))
  }

  const addField = () => {
    if (!newFieldForm?.label) return
    const newF: FieldConfig = {
      id: 'custom_' + genId(),
      label: newFieldForm.label,
      type: newFieldForm.type || 'text',
      required: false,
      visible: true,
      order: fields.length,
      isCustom: true,
      options: newFieldForm.type === 'dropdown' ? newFieldForm.optionsList || '' : undefined,
    }
    setFields([...fields, newF])
    setNewFieldForm(null)
  }

  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.classList.add('drag-over')
  }
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('drag-over')
  }
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    e.currentTarget.classList.remove('drag-over')
    if (dragIdx !== null) moveField(dragIdx, idx)
    setDragIdx(null)
  }

  const isProtected = (id: string) => PROTECTED_FIELDS.has(id)
  const isCoreRequired = (id: string) => CORE_REQUIRED_FIELDS.has(id)

  return (
    <Modal onClose={onClose} title={title} width='max-w-xl'>
      <div className='p-4 max-h-[65vh] overflow-y-auto'>
        <div className='mb-4 rounded-md border border-border bg-surface-2 p-3'>
          <p className='text-xs uppercase tracking-wide text-text-2'>
            Drag fields to reorder. Toggle visibility and mandatory status. Add custom fields at the bottom.
          </p>
          <p className='text-xs text-text-3 mt-1'>
            Sport and Competition are protected and cannot be hidden or deleted.
          </p>
        </div>

        <div className='space-y-1.5'>
          {sorted.map((field, idx) => (
            <div
              key={field.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, idx)}
              className={`flex items-center gap-3 rounded-md border px-3 py-2.5 transition-all ${
                field.visible ? 'border-border bg-surface' : 'border-border/60 bg-surface-2 opacity-60'
              } ${isProtected(field.id) ? 'ring-1 ring-primary/20' : ''}`}
            >
              <Grip />
              <div className='flex-1 min-w-0'>
                {editingField === field.id && !isProtected(field.id) ? (
                  <input
                    autoFocus
                    value={field.label}
                    onChange={e => updateFieldLabel(field.id, e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
                    className='w-full border-b border-primary bg-transparent text-sm font-medium outline-none'
                  />
                ) : (
                  <span
                    className={`cursor-pointer text-sm font-medium ${isProtected(field.id) ? '' : 'hover:text-primary'}`}
                    onClick={() => !isProtected(field.id) && setEditingField(field.id)}
                  >
                    {field.label}
                    {isProtected(field.id) && <span className='ml-2 text-xs text-primary'>protected</span>}
                  </span>
                )}
                <div className='flex items-center gap-2 mt-0.5'>
                  <span className='text-xs uppercase tracking-wide text-text-2'>{field.type}</span>
                  {field.isCustom && <span className='rounded-sm border border-border bg-surface-2 px-1 text-xs text-text-2'>custom</span>}
                </div>
              </div>
              <div className='flex items-center gap-3'>
                <Toggle
                  active={field.required}
                  onChange={() => toggleRequired(field.id)}
                  label='Required'
                  disabled={isCoreRequired(field.id)}
                />
                <Toggle
                  active={field.visible}
                  onChange={() => toggleVisible(field.id)}
                  label='Visible'
                  disabled={isProtected(field.id)}
                />
                {field.isCustom && !isProtected(field.id) && (
                  <button onClick={() => deleteField(field.id)} className='p-1 text-danger'>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className='mt-4 border-t border-border pt-4'>
          {!newFieldForm ? (
            <Btn variant='default' onClick={() => setNewFieldForm({ label: '', type: 'text' })}>
              <span className='text-lg leading-none'>+</span> Add Custom Field
            </Btn>
          ) : (
            <div className='animate-fade-in space-y-3 rounded-md border border-border bg-surface-2 p-3'>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='field-label'>Field Label</label>
                  <input
                    autoFocus
                    value={newFieldForm.label}
                    onChange={e => setNewFieldForm({ ...newFieldForm, label: e.target.value })}
                    className='field-input py-1.5'
                    placeholder='e.g. Sponsor Logo'
                  />
                </div>
                <div>
                  <label className='field-label'>Field Type</label>
                  <select
                    value={newFieldForm.type}
                    onChange={e => setNewFieldForm({ ...newFieldForm, type: e.target.value as FieldType })}
                    className='field-input bg-surface py-1.5'
                  >
                    <option value='text'>Text</option>
                    <option value='number'>Number</option>
                    <option value='date'>Date</option>
                    <option value='time'>Time</option>
                    <option value='checkbox'>Checkbox</option>
                    <option value='textarea'>Long Text</option>
                    <option value='dropdown'>Dropdown (custom)</option>
                  </select>
                </div>
              </div>
              {newFieldForm.type === 'dropdown' && (
                <div>
                  <label className='field-label'>Options (comma-separated)</label>
                  <input
                    value={newFieldForm.optionsList || ''}
                    onChange={e => setNewFieldForm({ ...newFieldForm, optionsList: e.target.value })}
                    className='field-input py-1.5'
                    placeholder='e.g. Option A, Option B, Option C'
                  />
                </div>
              )}
              <div className='flex gap-2'>
                <Btn variant='accent' onClick={addField} disabled={!newFieldForm.label}>Add Field</Btn>
                <Btn variant='ghost' onClick={() => setNewFieldForm(null)}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className='flex justify-end border-t border-border px-6 py-3'>
        <Btn variant='primary' onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  )
}
