import { useState, useEffect, useRef } from 'react'
import { fieldsApi, sportsApi } from '../../services'
import { Toggle } from '../ui/Toggle'
import type { FieldDefinition, DropdownList, DropdownOption } from '../../data/types'
import type { FieldSection } from '../../services/fields'

type Panel = 'fields' | 'dropdowns' | 'mandatory'
type Section = FieldSection

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

// ── Panel 1: Field Definitions ──────────────────────────────────────────────

function FieldPanel() {
  const [section, setSection] = useState<Section>('event')
  const [fields, setFields] = useState<FieldDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ label: '', fieldType: 'text', required: false, options: '' })
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const dragIndex = useRef<number | null>(null)

  useEffect(() => {
    setLoading(true)
    fieldsApi.list(section)
      .then(data => setFields(data.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [section])

  const toggleVisible = async (field: FieldDefinition) => {
    await fieldsApi.update(field.id, { visible: !field.visible })
    setFields(prev => prev.map(f => f.id === field.id ? { ...f, visible: !f.visible } : f))
  }

  const deleteField = async (id: string) => {
    await fieldsApi.delete(id)
    setFields(prev => prev.filter(f => f.id !== id))
    setConfirmDelete(null)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const created = await fieldsApi.create({
        name: slugify(createForm.label),
        label: createForm.label,
        fieldType: createForm.fieldType,
        section,
        required: createForm.required,
        options: createForm.fieldType === 'dropdown' ? createForm.options : undefined,
      })
      setFields(prev => [...prev, created])
      setShowCreate(false)
      setCreateForm({ label: '', fieldType: 'text', required: false, options: '' })
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  const handleDragStart = (i: number) => { dragIndex.current = i }
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    if (dragIndex.current === null || dragIndex.current === i) return
    const next = [...fields]
    const [moved] = next.splice(dragIndex.current, 1)
    next.splice(i, 0, moved)
    dragIndex.current = i
    setFields(next)
  }
  const handleDrop = async () => {
    const items = fields.map((f, i) => ({ id: f.id, sortOrder: i }))
    await fieldsApi.reorder(items).catch(() => {})
    dragIndex.current = null
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['event', 'crew', 'contract'] as Section[]).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide transition ${
              section === s
                ? 'bg-primary text-primary-fg'
                : 'border border-border bg-surface text-muted hover:border-primary hover:text-primary'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-surface-2 rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="divide-y divide-border/60 border border-border rounded-md overflow-hidden">
          {fields.map((field, i) => (
            <div
              key={field.id}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={handleDrop}
              className="flex items-center gap-3 px-3 py-2.5 bg-surface hover:bg-surface-2 cursor-grab"
            >
              <span className="text-muted select-none">⠿</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{field.label}</span>
                {field.isSystem && <span className="ml-2 text-xs text-muted">(system)</span>}
                <span className="ml-2 text-xs text-muted">{field.fieldType}</span>
              </div>
              <Toggle
                active={field.visible}
                onChange={() => toggleVisible(field)}
                label={field.visible ? 'Visible' : 'Hidden'}
              />
              {!field.isSystem && (
                confirmDelete === field.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-danger">Delete?</span>
                    <button onClick={() => deleteField(field.id)} className="text-xs font-semibold text-danger hover:underline">Yes</button>
                    <button onClick={() => setConfirmDelete(null)} className="text-xs text-muted hover:underline">No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(field.id)} className="text-xs text-danger hover:underline">Delete</button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        {showCreate ? (
          <form onSubmit={handleCreate} className="border border-border rounded-md p-4 bg-surface space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">New Field</div>
            <input
              type="text"
              className="inp w-full"
              placeholder="Label"
              value={createForm.label}
              onChange={e => setCreateForm(p => ({ ...p, label: e.target.value }))}
              required
            />
            <select
              className="inp w-full"
              value={createForm.fieldType}
              onChange={e => setCreateForm(p => ({ ...p, fieldType: e.target.value }))}
            >
              {['text', 'number', 'date', 'time', 'checkbox', 'textarea', 'dropdown'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {createForm.fieldType === 'dropdown' && (
              <input
                type="text"
                className="inp w-full"
                placeholder="Dropdown list ID"
                value={createForm.options}
                onChange={e => setCreateForm(p => ({ ...p, options: e.target.value }))}
              />
            )}
            <Toggle
              active={createForm.required}
              onChange={v => setCreateForm(p => ({ ...p, required: v }))}
              label="Required"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn btn-s btn-sm">Cancel</button>
              <button type="submit" className="btn btn-p btn-sm" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowCreate(true)} className="btn btn-g btn-sm">+ Add Field</button>
        )}
      </div>
    </div>
  )
}

// ── Panel 2: Dropdown Lists ──────────────────────────────────────────────────

function DropdownPanel() {
  const [lists, setLists] = useState<DropdownList[]>([])
  const [loading, setLoading] = useState(true)
  const [createForm, setCreateForm] = useState({ id: '', name: '', description: '' })
  const [creating, setCreating] = useState(false)
  const [optionForms, setOptionForms] = useState<Record<string, { label: string; value: string }>>({})
  const [addingOption, setAddingOption] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setLoading(true)
    fieldsApi.listDropdowns()
      .then(setLists)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const created = await fieldsApi.createDropdown(createForm)
      setLists(prev => [...prev, created])
      setCreateForm({ id: '', name: '', description: '' })
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  const handleAddOption = async (listId: string) => {
    const form = optionForms[listId]
    if (!form?.label || !form?.value) return
    setAddingOption(p => ({ ...p, [listId]: true }))
    try {
      const option: DropdownOption = await fieldsApi.createDropdownOption(listId, form)
      setLists(prev => prev.map(l =>
        l.id === listId ? { ...l, options: [...(l.options ?? []), option] } : l
      ))
      setOptionForms(p => ({ ...p, [listId]: { label: '', value: '' } }))
    } catch {
      // ignore
    } finally {
      setAddingOption(p => ({ ...p, [listId]: false }))
    }
  }

  if (loading) return <div className="text-sm text-muted py-4">Loading…</div>

  return (
    <div className="space-y-6">
      {lists.map(list => (
        <div key={list.id} className="border border-border rounded-md overflow-hidden">
          <div className="px-4 py-3 bg-surface-2 border-b border-border">
            <div className="font-semibold">{list.name}</div>
            <div className="text-xs text-muted">{list.id}{list.description ? ` — ${list.description}` : ''}</div>
          </div>
          <div className="divide-y divide-border/60">
            {(list.options ?? []).map((opt: DropdownOption) => (
              <div key={opt.value} className="px-4 py-2 flex justify-between text-sm">
                <span>{opt.label}</span>
                <span className="text-muted font-mono text-xs">{opt.value}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-surface border-t border-border flex gap-2 items-center">
            <input
              type="text"
              className="inp flex-1"
              placeholder="Label"
              value={optionForms[list.id]?.label ?? ''}
              onChange={e => setOptionForms(p => ({ ...p, [list.id]: { ...p[list.id], label: e.target.value } }))}
            />
            <input
              type="text"
              className="inp flex-1"
              placeholder="Value"
              value={optionForms[list.id]?.value ?? ''}
              onChange={e => setOptionForms(p => ({ ...p, [list.id]: { ...p[list.id], value: e.target.value } }))}
            />
            <button
              onClick={() => handleAddOption(list.id)}
              className="btn btn-g btn-sm"
              disabled={addingOption[list.id]}
            >
              {addingOption[list.id] ? '…' : 'Add'}
            </button>
          </div>
        </div>
      ))}

      <form onSubmit={handleCreateList} className="border border-border rounded-md p-4 bg-surface space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Create List</div>
        <input type="text" className="inp w-full" placeholder="ID (e.g. my_list)" value={createForm.id} onChange={e => setCreateForm(p => ({ ...p, id: e.target.value }))} required />
        <input type="text" className="inp w-full" placeholder="Name" value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} required />
        <input type="text" className="inp w-full" placeholder="Description (optional)" value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} />
        <div className="flex justify-end">
          <button type="submit" className="btn btn-p btn-sm" disabled={creating}>{creating ? 'Creating…' : 'Create List'}</button>
        </div>
      </form>
    </div>
  )
}

// ── Panel 3: Mandatory Fields per Sport ─────────────────────────────────────

function MandatoryPanel() {
  const [sports, setSports] = useState<{ id: number; name: string; icon: string }[]>([])
  const [allFields, setAllFields] = useState<FieldDefinition[]>([])
  const [selectedSport, setSelectedSport] = useState<number | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      sportsApi.list().catch(() => []),
      fieldsApi.list().catch(() => []),
    ]).then(([s, f]) => {
      setSports(s)
      setAllFields(f)
    })
  }, [])

  useEffect(() => {
    if (!selectedSport) return
    fieldsApi.getMandatory(selectedSport)
      .then(c => {
        setChecked(new Set(c.fieldIds ?? []))
      })
      .catch(() => setChecked(new Set()))
  }, [selectedSport])

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (!selectedSport) return
    setSaving(true)
    await fieldsApi.setMandatory(selectedSport, { fieldIds: [...checked] }).catch(() => {})
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Select Sport</label>
        <select
          className="inp w-full max-w-xs"
          value={selectedSport ?? ''}
          onChange={e => setSelectedSport(Number(e.target.value) || null)}
        >
          <option value="">Choose sport…</option>
          {sports.map(s => (
            <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
          ))}
        </select>
      </div>

      {selectedSport && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Mandatory Fields</div>
          <div className="border border-border rounded-md divide-y divide-border/60 overflow-hidden">
            {allFields.map(f => (
              <label key={f.id} className="flex items-center gap-3 px-4 py-2.5 bg-surface hover:bg-surface-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.has(f.id)}
                  onChange={() => toggle(f.id)}
                  className="rounded"
                />
                <span className="text-sm">{f.label}</span>
                <span className="text-xs text-muted">{f.section} · {f.fieldType}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={save} className="btn btn-p btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save Mandatory Config'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Root Component ───────────────────────────────────────────────────────────

export function FieldConfigurator() {
  const [activePanel, setActivePanel] = useState<Panel>('fields')

  const panels: { id: Panel; label: string }[] = [
    { id: 'fields', label: 'Fields' },
    { id: 'dropdowns', label: 'Dropdowns' },
    { id: 'mandatory', label: 'Mandatory' },
  ]

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-6 border-b border-border pb-4">
        {panels.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePanel(p.id)}
            className={`px-4 py-1.5 rounded-sm text-sm font-semibold transition ${
              activePanel === p.id
                ? 'bg-primary text-primary-fg'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {activePanel === 'fields' && <FieldPanel />}
      {activePanel === 'dropdowns' && <DropdownPanel />}
      {activePanel === 'mandatory' && <MandatoryPanel />}
    </div>
  )
}
