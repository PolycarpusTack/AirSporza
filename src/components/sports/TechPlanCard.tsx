import { useState } from 'react'
import { Plus, ChevronDown, AlertTriangle } from 'lucide-react'
import { Autocomplete, Badge, Btn } from '../ui'
import { crewMembersApi } from '../../services/crewMembers'
import type { TechPlan, FieldConfig, CrewTemplate } from '../../data/types'
import { ResourceSection } from './ResourceSection'
import type { Resource, ResourceAssignment } from '../../services/resources'

interface CustomField {
  name: string
  value: string
}

interface TechPlanCardProps {
  plan: TechPlan
  crewFields: FieldConfig[]
  isEditing: boolean
  showCrew: boolean
  onToggleEdit: () => void
  onCrewEdit: (field: string, value: string) => void
  onOpenSwap: () => void
  onAddCustomField: () => void
  onUpdateCustomField: (idx: number, key: string, val: string) => void
  onRemoveCustomField: (idx: number) => void
  onApplyTemplate: (crewData: Record<string, unknown>) => void
  onSaveAsTemplate: (crewData: Record<string, unknown>) => void
  templates?: CrewTemplate[]
  conflicts?: Map<string, { personName: string; eventName: string; role: string; startTime: string; severity: 'full' | 'partial' }[]>
  resources?: Resource[]
  planAssignments?: ResourceAssignment[]
  onAssignmentChange?: () => void
}

function getCustomFields(plan: TechPlan): CustomField[] {
  return Array.isArray(plan.customFields) ? plan.customFields as CustomField[] : []
}

export function TechPlanCard({
  plan, crewFields, isEditing, showCrew,
  onToggleEdit, onCrewEdit, onOpenSwap,
  onAddCustomField, onUpdateCustomField, onRemoveCustomField,
  onApplyTemplate, onSaveAsTemplate, templates: templatesProp,
  conflicts, resources, planAssignments, onAssignmentChange,
}: TechPlanCardProps) {
  const customFields = getCustomFields(plan)
  const templates = templatesProp ?? []
  const [showTemplates, setShowTemplates] = useState(false)

  const defaults = templates.filter(t => t.planType !== null)
  const shared = templates.filter(t => t.planType === null && t.isShared)
  const personal = templates.filter(t => t.planType === null && !t.isShared && t.createdById !== null)

  return (
    <div className="card mb-3 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-bold">{plan.planType}</span>
        </div>
        <div className="flex items-center gap-2">
          {plan.isLivestream && <Badge variant="live">Livestream</Badge>}
          <div className="relative">
            <Btn variant="ghost" size="xs" onClick={() => setShowTemplates(!showTemplates)}>
              Apply Template <ChevronDown className="w-3 h-3" />
            </Btn>
            {showTemplates && (
              <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-surface shadow-md">
                {defaults.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-bold uppercase text-text-3">Defaults</div>
                    {defaults.map(t => (
                      <button key={t.id} onClick={() => { onApplyTemplate(t.crewData); setShowTemplates(false) }}
                        className="w-full px-3 py-2 text-left text-sm text-text-2 hover:bg-surface-2 transition">{t.name}</button>
                    ))}
                  </>
                )}
                {shared.length > 0 && (
                  <>
                    <div className="border-t border-border px-3 py-1.5 text-xs font-bold uppercase text-text-3">Shared</div>
                    {shared.map(t => (
                      <button key={t.id} onClick={() => { onApplyTemplate(t.crewData); setShowTemplates(false) }}
                        className="w-full px-3 py-2 text-left text-sm text-text-2 hover:bg-surface-2 transition">{t.name}</button>
                    ))}
                  </>
                )}
                {personal.length > 0 && (
                  <>
                    <div className="border-t border-border px-3 py-1.5 text-xs font-bold uppercase text-text-3">My Templates</div>
                    {personal.map(t => (
                      <button key={t.id} onClick={() => { onApplyTemplate(t.crewData); setShowTemplates(false) }}
                        className="w-full px-3 py-2 text-left text-sm text-text-2 hover:bg-surface-2 transition">{t.name}</button>
                    ))}
                  </>
                )}
                {templates.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-text-3">No templates yet</div>
                )}
              </div>
            )}
          </div>
          <Btn variant="ghost" size="xs" onClick={onToggleEdit}>
            {isEditing ? "Done Editing" : "Edit Crew"}
          </Btn>
        </div>
      </div>
      <div className="p-4">
        {showCrew && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {crewFields.filter(f => f.type !== "checkbox").map(field => (
              <div key={field.id} className="rounded-md border border-border bg-surface-2 p-3">
                <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-text-2">
                  {field.label}
                  {field.required && <span className="text-danger">*</span>}
                  {field.isCustom && <span className="rounded-sm border border-border bg-surface px-1 text-[9px] text-text-2">custom</span>}
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <div className="flex-1">
                      <Autocomplete
                        value={(plan.crew[field.id] as string) || ""}
                        onChange={val => onCrewEdit(field.id, val)}
                        onSearch={async (q) => {
                          const results = await crewMembersApi.autocomplete(q, field.id)
                          return results.map(r => ({
                            id: r.id,
                            label: r.name,
                            subtitle: (r.roles as string[]).filter(role => role !== field.id).join(', ') || undefined,
                          }))
                        }}
                        placeholder={field.label}
                      />
                    </div>
                    {(() => {
                      const fieldConflicts = conflicts?.get(`${plan.id}:${field.id}`)
                      if (!fieldConflicts || fieldConflicts.length === 0) return null
                      return (
                        <div className="relative group">
                          <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 w-56 rounded-md border border-border bg-surface p-2 shadow-md text-xs">
                            {fieldConflicts.map((c, i) => (
                              <div key={i} className="mb-1 last:mb-0">
                                <span className="text-warning font-medium">Also assigned to</span>{' '}
                                <span className="font-medium text-text">{c.eventName}</span>{' '}
                                as <span className="font-mono">{c.role}</span> at {c.startTime}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-medium ${field.id === "encoder" ? "font-mono font-bold" : ""}`}>
                        {(plan.crew[field.id] as string) || "—"}
                      </span>
                      {(() => {
                        const fieldConflicts = conflicts?.get(`${plan.id}:${field.id}`)
                        if (!fieldConflicts || fieldConflicts.length === 0) return null
                        return (
                          <div className="relative group">
                            <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 w-56 rounded-md border border-border bg-surface p-2 shadow-md text-xs">
                              {fieldConflicts.map((c, i) => (
                                <div key={i} className="mb-1 last:mb-0">
                                  <span className="text-warning font-medium">Also assigned to</span>{' '}
                                  <span className="font-medium text-text">{c.eventName}</span>{' '}
                                  as <span className="font-mono">{c.role}</span> at {c.startTime}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                    {field.id === "encoder" && (
                      <button
                        onClick={onOpenSwap}
                        className="rounded-sm border border-border bg-surface px-2 py-1 text-xs font-semibold uppercase tracking-wide text-text transition hover:border-primary hover:text-primary"
                      >
                        Swap
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {customFields.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-2">Custom Fields</div>
            <div className="flex flex-wrap gap-2">
              {customFields.map((cf, i) => (
                <div key={i} className="flex items-center gap-1">
                  {isEditing ? (
                    <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 p-1">
                      <input
                        value={cf.name}
                        onChange={e => onUpdateCustomField(i, "name", e.target.value)}
                        placeholder="Name"
                        className="field-input w-24 px-2 py-0.5 text-xs"
                      />
                      <input
                        value={cf.value}
                        onChange={e => onUpdateCustomField(i, "value", e.target.value)}
                        placeholder="Value"
                        className="field-input w-24 px-2 py-0.5 text-xs"
                      />
                      <button onClick={() => onRemoveCustomField(i)} className="px-1 text-xs text-danger">✕</button>
                    </div>
                  ) : (
                    <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text">
                      {cf.name}: <strong>{cf.value}</strong>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {isEditing && (
          <div className="mt-2 flex gap-2">
            <Btn variant="ghost" size="xs" onClick={onAddCustomField}><Plus className="w-3 h-3" /> Add Custom Field</Btn>
            <Btn variant="ghost" size="xs" onClick={() => onSaveAsTemplate(plan.crew as Record<string, unknown>)}>
              Save as Template
            </Btn>
          </div>
        )}
        {resources && planAssignments && onAssignmentChange && (
          <ResourceSection
            planId={plan.id}
            resources={resources}
            assignments={planAssignments}
            onAssignmentChange={onAssignmentChange}
          />
        )}
      </div>
    </div>
  )
}
