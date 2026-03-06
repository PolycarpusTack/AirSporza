import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react'
import { Autocomplete } from '../ui/Autocomplete'
import { crewMembersApi } from '../../services/crewMembers'
import { crewTemplatesApi } from '../../services/crewTemplates'
import type { Event, TechPlan, FieldConfig, CrewTemplate } from '../../data/types'
import type { ConflictMap } from '../../utils/crewConflicts'

interface CrewTabProps {
  plans: TechPlan[]
  events: Event[]
  crewFields: FieldConfig[]
  conflicts: ConflictMap
  onCrewEdit: (planId: number, fieldId: string, value: string) => void
  onBatchApply: (planIds: number[], crewData: Record<string, unknown>) => void
}

type SortDir = 'asc' | 'desc' | null

export function CrewTab({ plans, events, crewFields, conflicts, onCrewEdit, onBatchApply }: CrewTabProps) {
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editingCell, setEditingCell] = useState<string | null>(null) // "planId:fieldId"
  const [templates, setTemplates] = useState<CrewTemplate[]>([])
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const visibleFields = crewFields
    .filter(f => f.visible && f.type !== 'checkbox')
    .sort((a, b) => a.order - b.order)

  // Load templates once
  useEffect(() => {
    crewTemplatesApi.list().then(setTemplates).catch(() => {})
  }, [])

  // Close template dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTemplateDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Build event lookup
  const eventMap = new Map(events.map(e => [e.id, e]))

  // Filter plans
  const searchLower = search.toLowerCase()
  const filtered = plans.filter(plan => {
    if (!search) return true
    const ev = eventMap.get(plan.eventId)
    const participants = (ev?.participants ?? '').toLowerCase()
    const planType = plan.planType.toLowerCase()
    const crewValues = Object.values(plan.crew)
      .filter(v => typeof v === 'string')
      .join(' ')
      .toLowerCase()
    return (
      participants.includes(searchLower) ||
      planType.includes(searchLower) ||
      crewValues.includes(searchLower)
    )
  })

  // Sort plans
  const sorted = [...filtered]
  if (sortCol && sortDir) {
    sorted.sort((a, b) => {
      let valA = ''
      let valB = ''
      if (sortCol === '__event') {
        valA = eventMap.get(a.eventId)?.participants ?? ''
        valB = eventMap.get(b.eventId)?.participants ?? ''
      } else if (sortCol === '__plan') {
        valA = a.planType
        valB = b.planType
      } else {
        valA = (a.crew[sortCol] as string) ?? ''
        valB = (b.crew[sortCol] as string) ?? ''
      }
      const cmp = valA.localeCompare(valB, undefined, { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  const toggleSort = useCallback((col: string) => {
    if (sortCol !== col) {
      setSortCol(col)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortCol(null)
      setSortDir(null)
    }
  }, [sortCol, sortDir])

  const toggleSelectAll = () => {
    if (selected.size === sorted.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(sorted.map(p => p.id)))
    }
  }

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applyTemplate = (template: CrewTemplate) => {
    onBatchApply(Array.from(selected), template.crewData)
    setSelected(new Set())
    setTemplateDropdownOpen(false)
  }

  const handleCrewSearch = useCallback((fieldId: string) => {
    return async (q: string) => {
      const results = await crewMembersApi.autocomplete(q, fieldId)
      return results.map(r => ({
        id: r.id,
        label: r.name,
        subtitle: r.roles.join(', '),
      }))
    }
  }, [])

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="inline w-3 h-3 ml-1 opacity-40" />
    if (sortDir === 'asc') return <ArrowUp className="inline w-3 h-3 ml-1 text-primary" />
    return <ArrowDown className="inline w-3 h-3 ml-1 text-primary" />
  }

  if (plans.length === 0) {
    return <div className="card p-8 text-center text-text-3 text-sm">No crew assignments yet</div>
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search crew, events, plan types..."
            className="inp pl-8 pr-3 py-1.5 w-full text-sm"
          />
        </div>

        {/* Plan count */}
        <span className="text-xs text-muted whitespace-nowrap">
          {filtered.length} plan{filtered.length !== 1 ? 's' : ''}
        </span>

        {/* Bulk apply */}
        {selected.size > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setTemplateDropdownOpen(!templateDropdownOpen)}
              className="btn btn-p text-xs flex items-center gap-1"
            >
              Apply Template ({selected.size})
              <ChevronDown className="w-3 h-3" />
            </button>
            {templateDropdownOpen && (
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-border bg-surface shadow-lg max-h-60 overflow-y-auto">
                {templates.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-text-3">No templates available</div>
                ) : (
                  templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2 transition"
                    >
                      <div className="font-medium">{t.name}</div>
                      {t.planType && (
                        <div className="text-xs text-text-3 font-mono uppercase">{t.planType}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                {/* Select all */}
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={sorted.length > 0 && selected.size === sorted.length}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort('__event')}
                >
                  Event <SortIcon col="__event" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort('__plan')}
                >
                  Plan <SortIcon col="__plan" />
                </th>
                {visibleFields.map(f => (
                  <th
                    key={f.id}
                    className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none whitespace-nowrap"
                    onClick={() => toggleSort(f.id)}
                  >
                    {f.label} <SortIcon col={f.id} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sorted.map(plan => {
                const ev = eventMap.get(plan.eventId)
                return (
                  <tr
                    key={plan.id}
                    className={`hover:bg-surface-2 transition ${selected.has(plan.id) ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selected.has(plan.id)}
                        onChange={() => toggleSelect(plan.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {ev?.participants ?? `Event #${plan.eventId}`}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs font-mono uppercase whitespace-nowrap">
                      {plan.planType}
                    </td>
                    {visibleFields.map(f => {
                      const cellKey = `${plan.id}:${f.id}`
                      const cellConflicts = conflicts.get(cellKey)
                      const cellValue = (plan.crew[f.id] as string) ?? ''
                      const isEditing = editingCell === cellKey

                      return (
                        <td key={f.id} className="px-4 py-2 min-w-[140px]">
                          <div className="flex items-center gap-1.5">
                            {isEditing ? (
                              <div className="flex-1" onBlur={() => {
                                // Delay to allow autocomplete selection
                                setTimeout(() => setEditingCell(null), 200)
                              }}>
                                <Autocomplete
                                  value={cellValue}
                                  onChange={v => onCrewEdit(plan.id, f.id, v)}
                                  onSearch={handleCrewSearch(f.id)}
                                  placeholder={f.label}
                                  className="text-sm w-full"
                                />
                              </div>
                            ) : (
                              <span
                                className="flex-1 cursor-pointer text-text-2 hover:text-text transition py-0.5"
                                onClick={() => setEditingCell(cellKey)}
                                title="Click to edit"
                              >
                                {cellValue || <span className="text-text-3">---</span>}
                              </span>
                            )}
                            {cellConflicts && cellConflicts.length > 0 && (
                              <span
                                className="text-warning flex-shrink-0"
                                title={cellConflicts
                                  .map(c => `${c.personName} also assigned to "${c.eventName}" at ${c.startTime} (${c.severity})`)
                                  .join('\n')}
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
