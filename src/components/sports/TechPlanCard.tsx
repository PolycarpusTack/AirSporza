import { Plus } from 'lucide-react'
import { Badge, Btn } from '../ui'
import type { TechPlan, FieldConfig } from '../../data/types'

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
}

function getCustomFields(plan: TechPlan): CustomField[] {
  return Array.isArray(plan.customFields) ? plan.customFields as CustomField[] : []
}

export function TechPlanCard({
  plan, crewFields, isEditing, showCrew,
  onToggleEdit, onCrewEdit, onOpenSwap,
  onAddCustomField, onUpdateCustomField, onRemoveCustomField,
}: TechPlanCardProps) {
  const customFields = getCustomFields(plan)

  return (
    <div className="card mb-3 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-bold">{plan.planType}</span>
        </div>
        <div className="flex items-center gap-2">
          {plan.isLivestream && <Badge variant="live">Livestream</Badge>}
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
                  <input
                    value={(plan.crew[field.id] as string) || ""}
                    onChange={e => onCrewEdit(field.id, e.target.value)}
                    className="field-input px-2 py-1"
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${field.id === "encoder" ? "font-mono font-bold" : ""}`}>
                      {(plan.crew[field.id] as string) || "—"}
                    </span>
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
          <div className="mt-2">
            <Btn variant="ghost" size="xs" onClick={onAddCustomField}><Plus className="w-3 h-3" /> Add Custom Field</Btn>
          </div>
        )}
      </div>
    </div>
  )
}
