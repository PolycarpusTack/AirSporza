import { useState, useMemo, useEffect, useCallback } from 'react'
import { Menu, X } from 'lucide-react'
import { Badge, Btn, EmptyState } from '../components/ui'
import type { Event, TechPlan, FieldConfig, DashboardWidget, Sport, Competition, Encoder } from '../data/types'
import { encodersApi, techPlansApi } from '../services'
import { crewMembersApi } from '../services/crewMembers'
import { crewTemplatesApi } from '../services/crewTemplates'
import { resourcesApi } from '../services/resources'
import type { Resource } from '../services/resources'
import { fmtDate } from '../utils'
import { useSocket } from '../hooks'
import { useToast } from '../components/Toast'
import { EncoderSwapModal } from '../components/sports/EncoderSwapModal'
import { EventDetailCard } from '../components/sports/EventDetailCard'
import { TechPlanCard } from '../components/sports/TechPlanCard'
import { SportTreePanel } from '../components/sports/SportTreePanel'
import { CrewTab } from '../components/sports/CrewTab'
import { ResourcesTab } from '../components/sports/ResourcesTab'

interface SportsWorkspaceProps {
  events: Event[]
  techPlans: TechPlan[]
  setTechPlans: (plans: TechPlan[] | ((prev: TechPlan[]) => TechPlan[])) => void
  crewFields: FieldConfig[]
  widgets: DashboardWidget[]
  sports: Sport[]
  competitions: Competition[]
}

interface CustomField {
  name: string
  value: string
}

export function SportsWorkspace({ events, techPlans, setTechPlans, crewFields, widgets, sports, competitions }: SportsWorkspaceProps) {
  const [selEvent, setSelEvent] = useState<Event | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1]))
  const [swapModal, setSwapModal] = useState<number | null>(null)
  const [editingPlanCrew, setEditingPlanCrew] = useState<number | null>(null)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [realtimePlans, setRealtimePlans] = useState<TechPlan[]>(techPlans)
  const [encoders, setEncoders] = useState<Encoder[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [saveTemplateData, setSaveTemplateData] = useState<Record<string, unknown> | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateShared, setTemplateShared] = useState(false)
  const toast = useToast()

  const { on } = useSocket()

  useEffect(() => {
    encodersApi.list().then(setEncoders).catch(() => {})
    resourcesApi.list().then(setResources).catch(() => {})
  }, [])

  useEffect(() => {
    setRealtimePlans(techPlans)
  }, [techPlans])

  useEffect(() => {
    const unsubCreated = on('techPlan:created', (plan: TechPlan) => {
      setRealtimePlans(prev => [...prev, plan])
    })
    const unsubUpdated = on('techPlan:updated', (plan: TechPlan) => {
      setRealtimePlans(prev => prev.map(p => p.id === plan.id ? plan : p))
    })
    const unsubDeleted = on('techPlan:deleted', ({ id }: { id: number }) => {
      setRealtimePlans(prev => prev.filter(p => p.id !== id))
    })
    const unsubSwapped = on('encoder:swapped', ({ planId, plan }: { planId: number; plan: TechPlan }) => {
      setRealtimePlans(prev => prev.map(p => p.id === planId ? plan : p))
    })
    return () => {
      unsubCreated()
      unsubUpdated()
      unsubDeleted()
      unsubSwapped()
    }
  }, [on])

  const [selectedSport, setSelectedSport] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'events' | 'plans' | 'crew' | 'resources'>('events')

  const visWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order)
  const showTree = visWidgets.some(w => w.id === "sportTree")
  const showDetail = visWidgets.some(w => w.id === "eventDetail")
  const showPlans = visWidgets.some(w => w.id === "techPlans")
  const showCrew = visWidgets.some(w => w.id === "crewOverview")

  const toggle = (id: number) => {
    setExpanded(p => {
      const n = new Set(p)
      if (n.has(id)) { n.delete(id) } else { n.add(id) }
      return n
    })
  }

  const sportTree = useMemo(() => {
    return sports.map(s => ({
      ...s,
      comps: competitions.filter(c => c.sportId === s.id).map(comp => ({
        ...comp,
        events: events.filter(e => e.competitionId === comp.id)
      }))
    })).filter(s => s.comps.some(c => c.events.length > 0))
  }, [sports, competitions, events])

  const filteredTree = useMemo(
    () => selectedSport ? sportTree.filter(s => s.id === selectedSport) : sportTree,
    [sportTree, selectedSport]
  )

  const eventPlans = useMemo(() => selEvent ? realtimePlans.filter(p => p.eventId === selEvent.id) : [], [selEvent, realtimePlans])
  const visibleCrewFields = crewFields.filter(f => f.visible).sort((a, b) => a.order - b.order)

  const handleCrewEdit = useCallback(async (planId: number, field: string, value: string) => {
    const updated = realtimePlans.map(p => p.id === planId ? { ...p, crew: { ...p.crew as Record<string, unknown>, [field]: value } } : p)
    setRealtimePlans(updated)
    setTechPlans(updated)
    const plan = updated.find(p => p.id === planId)
    if (plan) {
      try {
        await techPlansApi.update(planId, { crew: plan.crew, eventId: plan.eventId, planType: plan.planType, isLivestream: plan.isLivestream, customFields: plan.customFields })
        // Auto-add new crew member to roster
        if (value.trim()) {
          crewMembersApi.create({ name: value.trim(), roles: [field] }).catch(() => {})
        }
      } catch {
        // non-blocking — local state already updated
      }
    }
  }, [realtimePlans, setTechPlans])

  const handleCrewBatchApply = useCallback(async (planId: number, crewData: Record<string, unknown>) => {
    const updated = realtimePlans.map(p => p.id === planId ? { ...p, crew: { ...p.crew as Record<string, unknown>, ...crewData } } : p)
    setRealtimePlans(updated)
    setTechPlans(updated)
    const plan = updated.find(p => p.id === planId)
    if (plan) {
      try {
        await techPlansApi.update(planId, { crew: plan.crew, eventId: plan.eventId, planType: plan.planType, isLivestream: plan.isLivestream, customFields: plan.customFields })
        toast.success('Template applied')
      } catch {
        toast.error('Failed to apply template')
      }
    }
  }, [realtimePlans, setTechPlans, toast])

  const getCustomFields = (plan: TechPlan): CustomField[] => {
    if (Array.isArray(plan.customFields)) {
      return plan.customFields as CustomField[]
    }
    return []
  }

  const persistPlan = (planId: number, plans: TechPlan[]) => {
    const plan = plans.find(p => p.id === planId)
    if (plan) {
      techPlansApi.update(planId, {
        crew: plan.crew,
        eventId: plan.eventId,
        planType: plan.planType,
        isLivestream: plan.isLivestream ?? false,
        customFields: plan.customFields ?? [],
      }).catch(err => console.error('Failed to persist plan update:', err))
    }
  }

  const addCustomToPlan = (planId: number) => {
    const updated = realtimePlans.map(p => {
      if (p.id !== planId) return p
      const cf = getCustomFields(p)
      return { ...p, customFields: [...cf, { name: "", value: "" }] }
    })
    setRealtimePlans(updated)
    setTechPlans(updated)
    persistPlan(planId, updated)
  }

  const updatePlanCustomField = (planId: number, idx: number, key: string, val: string) => {
    const updated = realtimePlans.map(p => {
      if (p.id !== planId) return p
      const cf = getCustomFields(p)
      cf[idx] = { ...cf[idx], [key]: val }
      return { ...p, customFields: cf }
    })
    setRealtimePlans(updated)
    setTechPlans(updated)
    persistPlan(planId, updated)
  }

  const removePlanCustomField = (planId: number, idx: number) => {
    const updated = realtimePlans.map(p => {
      if (p.id !== planId) return p
      const cf = getCustomFields(p)
      cf.splice(idx, 1)
      return { ...p, customFields: cf }
    })
    setRealtimePlans(updated)
    setTechPlans(updated)
    persistPlan(planId, updated)
  }

  return (
    <div>
      {/* ── Tab bar ── */}
      <div className="flex border-b border-border mb-5">
        {([
          { id: 'events',    label: 'Events' },
          { id: 'plans',     label: `Tech Plans${realtimePlans.length ? ` (${realtimePlans.length})` : ''}` },
          { id: 'crew',      label: 'Crew' },
          { id: 'resources', label: `Resources${resources.length ? ` (${resources.length})` : ''}` },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-text-2 hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sport filter chips — visible on Events and Plans tabs */}
      {(activeTab === 'events' || activeTab === 'plans') && sportTree.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setSelectedSport(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              !selectedSport ? 'bg-primary text-white border-primary' : 'text-text-2 border-border hover:bg-surface-2'
            }`}
          >
            All Sports
          </button>
          {sportTree.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedSport(selectedSport === s.id ? null : s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                selectedSport === s.id ? 'bg-primary text-white border-primary' : 'text-text-2 border-border hover:bg-surface-2'
              }`}
            >
              {s.icon} {s.name}
            </button>
          ))}
        </div>
      )}

      {/* ── EVENTS TAB ── */}
      {activeTab === 'events' && (
        <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 280px)' }}>
          <button
            onClick={() => setMobileSidebar(!mobileSidebar)}
            className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-fg shadow-md lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>

          {showTree && (
            <div className={`${mobileSidebar ? 'fixed inset-0 z-40 overflow-y-auto bg-surface' : 'hidden'} card lg:block lg:relative lg:w-72 flex-shrink-0 overflow-y-auto`}>
              {mobileSidebar && (
                <div className="flex justify-end p-2">
                  <button onClick={() => setMobileSidebar(false)} className="rounded-sm p-2 transition hover:bg-surface-2"><X className="w-5 h-5" /></button>
                </div>
              )}
              <SportTreePanel
                sportTree={sportTree}
                filteredTree={filteredTree}
                selectedSport={selectedSport}
                onSelectSport={setSelectedSport}
                expanded={expanded}
                onToggle={toggle}
                selectedEventId={selEvent?.id ?? null}
                onSelectEvent={(ev) => { setSelEvent(ev); setMobileSidebar(false); setEditingPlanCrew(null) }}
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {!selEvent ? (
              <EmptyState icon="📋" title="Select an event from the sidebar" subtitle="to view and manage technical plans" />
            ) : (
              <div className="space-y-4 animate-fade-in">
                {showDetail && (
                  <EventDetailCard
                    event={selEvent}
                    sport={sports.find(s => s.id === selEvent.sportId)}
                    competition={competitions.find(c => c.id === selEvent.competitionId)}
                  />
                )}

                {showPlans && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold">Technical Plans ({eventPlans.length})</h4>
                    </div>
                    {eventPlans.map(plan => (
                      <TechPlanCard
                        key={plan.id}
                        plan={plan}
                        crewFields={visibleCrewFields}
                        isEditing={editingPlanCrew === plan.id}
                        showCrew={showCrew}
                        onToggleEdit={() => setEditingPlanCrew(editingPlanCrew === plan.id ? null : plan.id)}
                        onCrewEdit={(field, value) => handleCrewEdit(plan.id, field, value)}
                        onOpenSwap={() => setSwapModal(plan.id)}
                        onAddCustomField={() => addCustomToPlan(plan.id)}
                        onUpdateCustomField={(idx, key, val) => updatePlanCustomField(plan.id, idx, key, val)}
                        onRemoveCustomField={(idx) => removePlanCustomField(plan.id, idx)}
                        onApplyTemplate={(crewData) => {
                          const hasExisting = Object.values(plan.crew).some(v => typeof v === 'string' && v.trim())
                          if (hasExisting && !window.confirm('This will overwrite current crew fields. Continue?')) return
                          handleCrewBatchApply(plan.id, crewData)
                        }}
                        onSaveAsTemplate={(crewData) => { setSaveTemplateData(crewData); setTemplateName(''); setTemplateShared(false) }}
                      />
                    ))}
                    {eventPlans.length === 0 && (
                      <div className="rounded-md border-2 border-dashed border-border bg-surface p-8 text-center text-sm text-text-2">
                        No technical plans for this event yet
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PLANS TAB ── */}
      {activeTab === 'plans' && (
        <div className="space-y-5 animate-fade-in">
          {encoders.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-2 mb-3">Encoders</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
                {encoders.map(enc => {
                  const inUse = enc.inUse !== null && enc.inUse !== undefined
                  return (
                    <div
                      key={enc.id}
                      className={`card p-3 border ${inUse ? 'border-warning/30 bg-warning/5' : enc.isActive ? 'border-success/30 bg-success/5' : 'opacity-50'}`}
                    >
                      <div className="font-mono font-semibold text-sm mb-1">{enc.name}</div>
                      <div className="text-xs text-text-2 mb-2">{enc.location ?? '—'}</div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${inUse ? 'bg-warning animate-pulse' : enc.isActive ? 'bg-success' : 'bg-text-3'}`} />
                        <span className={`text-xs font-mono ${inUse ? 'text-warning' : enc.isActive ? 'text-success' : 'text-text-3'}`}>
                          {inUse ? 'In Use' : enc.isActive ? 'Available' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-2 mb-3">
              Tech Plans ({realtimePlans.filter(p => !selectedSport || events.find(e => e.id === p.eventId && sports.find(s => s.id === e.sportId)?.id === selectedSport)).length})
            </h4>
            {realtimePlans.length === 0 ? (
              <div className="card p-8 text-center text-text-3 text-sm">No tech plans yet</div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2">
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Event</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Encoder</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Livestream</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {realtimePlans.map(plan => {
                      const ev = events.find(e => e.id === plan.eventId)
                      const encoderName = plan.crew.encoder as string | undefined
                      return (
                        <tr key={plan.id} className="hover:bg-surface-2 transition">
                          <td className="px-4 py-3 font-medium">{ev?.participants ?? `Event #${plan.eventId}`}</td>
                          <td className="px-4 py-3 text-muted text-xs font-mono uppercase">{plan.planType}</td>
                          <td className="px-4 py-3">
                            {encoderName
                              ? <span className="font-mono text-sm">{encoderName}</span>
                              : <span className="text-text-3">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-muted text-xs font-mono">{ev ? fmtDate(ev.startDateBE) : '—'}</td>
                          <td className="px-4 py-3">
                            {plan.isLivestream ? <Badge variant="live">Yes</Badge> : <span className="text-text-3 text-xs">No</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setSwapModal(plan.id)}
                              className="btn btn-g btn-sm"
                            >
                              Swap encoder
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CREW TAB ── */}
      {activeTab === 'crew' && (
        <div className="animate-fade-in">
          <CrewTab plans={realtimePlans} events={events} crewFields={crewFields} />
        </div>
      )}

      {/* ── RESOURCES TAB ── */}
      {activeTab === 'resources' && (
        <div className="animate-fade-in">
          <ResourcesTab resources={resources} />
        </div>
      )}

      {swapModal !== null && (
        <EncoderSwapModal
          planId={swapModal}
          encoders={encoders}
          currentEncoderName={realtimePlans.find(p => p.id === swapModal)?.crew.encoder as string | undefined}
          onSwapComplete={(planId, updated) => {
            setRealtimePlans(prev => prev.map(p => p.id === planId ? updated : p))
            setTechPlans(prev => {
              const arr = Array.isArray(prev) ? prev : []
              return arr.map(p => p.id === planId ? updated : p)
            })
            setSwapModal(null)
          }}
          onClose={() => setSwapModal(null)}
        />
      )}

      {saveTemplateData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setSaveTemplateData(null)}>
          <div className="card w-full max-w-sm rounded-lg p-5 shadow-md animate-scale-in" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold text-lg mb-4">Save as Template</h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-text-2 mb-1 block">Template Name</label>
                <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. Standard Football Crew" className="inp w-full" autoFocus />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={templateShared} onChange={e => setTemplateShared(e.target.checked)} className="rounded border-border" />
                Share with all users
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <Btn variant="primary" className="flex-1" onClick={async () => {
                if (!templateName.trim()) return
                try {
                  await crewTemplatesApi.create({ name: templateName.trim(), crewData: saveTemplateData, isShared: templateShared })
                  toast.success('Template saved')
                  setSaveTemplateData(null)
                } catch { toast.error('Failed to save template') }
              }}>Save</Btn>
              <Btn variant="default" className="flex-1" onClick={() => setSaveTemplateData(null)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
