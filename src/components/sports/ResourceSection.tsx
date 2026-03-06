import { useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { Badge, Btn } from '../ui'
import { resourcesApi, RESOURCE_TYPE_LABELS } from '../../services/resources'
import type { Resource, ResourceAssignment, ResourceType } from '../../services/resources'
import { useToast } from '../Toast'

interface ResourceSectionProps {
  planId: number
  resources: Resource[]
  assignments: ResourceAssignment[]
  onAssignmentChange: () => void
}

export function ResourceSection({ planId, resources, assignments, onAssignmentChange }: ResourceSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const assignedResourceIds = new Set(assignments.map(a => a.resourceId))
  const available = resources.filter(r => r.isActive && !assignedResourceIds.has(r.id))

  // Group available resources by type
  const grouped = available.reduce<Record<string, Resource[]>>((acc, r) => {
    const label = RESOURCE_TYPE_LABELS[r.type] || r.type
    if (!acc[label]) acc[label] = []
    acc[label].push(r)
    return acc
  }, {})

  async function handleAssign(resourceId: number) {
    setBusy(true)
    try {
      await resourcesApi.assign(resourceId, { techPlanId: planId })
      toast.success('Resource assigned')
      onAssignmentChange()
    } catch {
      toast.error('Failed to assign resource')
    } finally {
      setBusy(false)
      setShowDropdown(false)
    }
  }

  async function handleUnassign(resourceId: number) {
    setBusy(true)
    try {
      await resourcesApi.unassign(resourceId, planId)
      toast.success('Resource removed')
      onAssignmentChange()
    } catch {
      toast.error('Failed to remove resource')
    } finally {
      setBusy(false)
    }
  }

  function getResourceName(resourceId: number): string {
    return resources.find(r => r.id === resourceId)?.name ?? `Resource #${resourceId}`
  }

  function getResourceType(resourceId: number): ResourceType | undefined {
    return resources.find(r => r.id === resourceId)?.type
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-text-2 hover:text-text transition"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Resources ({assignments.length})
      </button>

      {!collapsed && (
        <div>
          {assignments.length === 0 ? (
            <div className="text-xs text-text-3 py-2">No resources assigned</div>
          ) : (
            <div className="flex flex-wrap gap-2 mb-2">
              {assignments.map(a => {
                const rType = getResourceType(a.resourceId)
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5"
                  >
                    <span className="text-xs font-medium">{getResourceName(a.resourceId)}</span>
                    {rType && (
                      <span className="text-[10px] text-text-3">{RESOURCE_TYPE_LABELS[rType]}</span>
                    )}
                    {a.quantity > 1 && <Badge variant="default">{a.quantity}</Badge>}
                    <button
                      onClick={() => handleUnassign(a.resourceId)}
                      disabled={busy}
                      className="ml-0.5 text-text-3 hover:text-danger transition"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="relative inline-block">
            <Btn
              variant="ghost"
              size="xs"
              onClick={() => setShowDropdown(!showDropdown)}
              disabled={available.length === 0}
            >
              + Add Resource
            </Btn>
            {showDropdown && (
              <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-surface shadow-md max-h-60 overflow-y-auto">
                {Object.entries(grouped).map(([typeLabel, items]) => (
                  <div key={typeLabel}>
                    <div className="px-3 py-1.5 text-xs font-bold uppercase text-text-3">{typeLabel}</div>
                    {items.map(r => (
                      <button
                        key={r.id}
                        onClick={() => handleAssign(r.id)}
                        disabled={busy}
                        className="w-full px-3 py-2 text-left text-sm text-text-2 hover:bg-surface-2 transition"
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                ))}
                {available.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-text-3">All resources assigned</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
