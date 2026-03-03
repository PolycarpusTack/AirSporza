import { useState, useMemo, useEffect } from 'react'
import { Menu, X, Plus } from 'lucide-react'
import { Badge, Btn, EmptyState } from '../components/ui'
import type { Event, TechPlan, FieldConfig, DashboardWidget } from '../data/types'
import { SPORTS, COMPETITIONS, ENCODERS } from '../data'
import { fmtDate } from '../utils'
import { useSocket } from '../hooks'

interface SportsWorkspaceProps {
  events: Event[]
  techPlans: TechPlan[]
  setTechPlans: (plans: TechPlan[]) => void
  crewFields: FieldConfig[]
  widgets: DashboardWidget[]
}

interface CustomField {
  name: string
  value: string
}

export function SportsWorkspace({ events, techPlans, setTechPlans, crewFields, widgets }: SportsWorkspaceProps) {
  const [selEvent, setSelEvent] = useState<Event | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1]))
  const [swapModal, setSwapModal] = useState<number | null>(null)
  const [editingPlanCrew, setEditingPlanCrew] = useState<number | null>(null)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [realtimePlans, setRealtimePlans] = useState<TechPlan[]>(techPlans)
  
  const { on } = useSocket()

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

  const visWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order)
  const showTree = visWidgets.some(w => w.id === "sportTree")
  const showDetail = visWidgets.some(w => w.id === "eventDetail")
  const showPlans = visWidgets.some(w => w.id === "techPlans")
  const showCrew = visWidgets.some(w => w.id === "crewOverview")

  const toggle = (id: number) => {
    setExpanded(p => {
      const n = new Set(p)
      if (n.has(id)) {
        n.delete(id)
      } else {
        n.add(id)
      }
      return n
    })
  }

  const sportTree = useMemo(() => {
    return SPORTS.map(s => ({
      ...s,
      comps: COMPETITIONS.filter(c => c.sportId === s.id).map(comp => ({
        ...comp,
        events: events.filter(e => e.competitionId === comp.id)
      }))
    })).filter(s => s.comps.some(c => c.events.length > 0))
  }, [events])

  const eventPlans = useMemo(() => selEvent ? realtimePlans.filter(p => p.eventId === selEvent.id) : [], [selEvent, realtimePlans])

  const handleSwap = (planId: number, enc: string) => {
    const updated = realtimePlans.map(p => p.id === planId ? { ...p, crew: { ...p.crew, encoder: enc } } : p)
    setRealtimePlans(updated)
    setTechPlans(updated)
    setSwapModal(null)
  }

  const handleCrewEdit = (planId: number, field: string, value: string) => {
    const updated = realtimePlans.map(p => p.id === planId ? { ...p, crew: { ...p.crew, [field]: value } } : p)
    setRealtimePlans(updated)
    setTechPlans(updated)
  }

  const getCustomFields = (plan: TechPlan): CustomField[] => {
    if (Array.isArray(plan.customFields)) {
      return plan.customFields as CustomField[]
    }
    return []
  }

  const addCustomToPlan = (planId: number) => {
    const updated = realtimePlans.map(p => {
      if (p.id !== planId) return p
      const cf = getCustomFields(p)
      return { ...p, customFields: [...cf, { name: "", value: "" }] }
    })
    setRealtimePlans(updated)
    setTechPlans(updated)
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
  }

  const visibleCrewFields = crewFields.filter(f => f.visible).sort((a, b) => a.order - b.order)

  const TreePanel = () => (
    <div className="space-y-1 p-2">
      <div className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-text-2">Sports & Events</div>
      {sportTree.map(sport => (
        <div key={sport.id}>
          <button
            onClick={() => toggle(sport.id)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-surface-2"
          >
            <span className={`transition-transform text-xs ${expanded.has(sport.id) ? "rotate-90" : ""}`}>▶</span>
            <span className="text-base">{sport.icon}</span>
            <span className="text-sm font-semibold flex-1">{sport.name}</span>
            <span className="rounded-sm bg-surface-2 px-1.5 text-xs text-text-2">{sport.comps.reduce((s, c) => s + c.events.length, 0)}</span>
          </button>
          {expanded.has(sport.id) && sport.comps.map(comp => (
            <div key={comp.id} className="ml-6">
              <div className="px-2 py-1 text-xs font-medium text-text-2">{comp.name}</div>
              {comp.events.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => { setSelEvent(ev); setMobileSidebar(false); setEditingPlanCrew(null); }}
                  className={`mb-0.5 w-full rounded-sm border px-2 py-2 text-left text-sm transition ${
                    selEvent?.id === ev.id
                      ? 'border-primary bg-primary/10 text-text'
                      : 'border-transparent text-text-2 hover:bg-surface-2 hover:text-text'
                  }`}
                >
                  <div className="font-medium truncate">{ev.participants}</div>
                  <div className="text-xs text-text-3">{fmtDate(ev.startDateBE)} - {ev.startTimeBE}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex gap-4" style={{ minHeight: "calc(100vh - 200px)" }}>
      <button
        onClick={() => setMobileSidebar(!mobileSidebar)}
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-fg shadow-md lg:hidden"
      >
        <Menu className="w-5 h-5" />
      </button>

      {showTree && (
        <div className={`${mobileSidebar ? "fixed inset-0 z-40 overflow-y-auto bg-surface" : "hidden"} card lg:block lg:relative lg:w-72 flex-shrink-0 overflow-y-auto`}>
          {mobileSidebar && (
            <div className="flex justify-end p-2">
              <button onClick={() => setMobileSidebar(false)} className="rounded-sm p-2 transition hover:bg-surface-2"><X className="w-5 h-5" /></button>
            </div>
          )}
          <TreePanel />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!selEvent ? (
          <EmptyState icon="📋" title="Select an event from the sidebar" subtitle="to view and manage technical plans" />
        ) : (
          <div className="space-y-4 animate-fade-in">
            {showDetail && (
              <div className="card p-5">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{SPORTS.find(s => s.id === selEvent.sportId)?.icon}</span>
                      <h3 className="font-bold text-xl">{selEvent.participants}</h3>
                    </div>
                    <div className="meta">{COMPETITIONS.find(c => c.id === selEvent.competitionId)?.name} - {selEvent.phase} - {selEvent.complex}</div>
                  </div>
                  <div className="flex gap-2">
                    {selEvent.isLive && <Badge variant="live">LIVE</Badge>}
                    {selEvent.isDelayedLive && <Badge variant="warning">DELAYED</Badge>}
                    {selEvent.category && <Badge>{selEvent.category}</Badge>}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
                  <div><div className="text-xs uppercase tracking-wide text-text-2">Date (BE)</div><div className="text-sm font-medium">{fmtDate(selEvent.startDateBE)}</div></div>
                  <div><div className="text-xs uppercase tracking-wide text-text-2">Time (BE)</div><div className="font-mono text-sm font-semibold">{selEvent.startTimeBE}</div></div>
                  <div><div className="text-xs uppercase tracking-wide text-text-2">Channel</div><div className="text-sm font-medium">{selEvent.linearChannel || '—'}</div></div>
                  <div><div className="text-xs uppercase tracking-wide text-text-2">Radio</div><div className="text-sm font-medium">{selEvent.radioChannel || '—'}</div></div>
                </div>
              </div>
            )}

            {showPlans && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold">Technical Plans ({eventPlans.length})</h4>
                </div>
                {eventPlans.map(plan => {
                  const customFields = getCustomFields(plan)
                  return (
                    <div key={plan.id} className="card mb-3 overflow-hidden">
                      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                          <span className="font-bold">{plan.planType}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {plan.isLivestream && <Badge variant="live">Livestream</Badge>}
                          <Btn variant="ghost" size="xs" onClick={() => setEditingPlanCrew(editingPlanCrew === plan.id ? null : plan.id)}>
                            {editingPlanCrew === plan.id ? "Done Editing" : "Edit Crew"}
                          </Btn>
                        </div>
                      </div>
                      <div className="p-4">
                        {showCrew && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {visibleCrewFields.filter(f => f.type !== "checkbox").map(field => (
                              <div key={field.id} className="rounded-md border border-border bg-surface-2 p-3">
                                <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-text-2">
                                  {field.label}
                                  {field.required && <span className="text-danger">*</span>}
                                  {field.isCustom && <span className="rounded-sm border border-border bg-surface px-1 text-[9px] text-text-2">custom</span>}
                                </div>
                                {editingPlanCrew === plan.id ? (
                                  <input
                                    value={(plan.crew[field.id] as string) || ""}
                                    onChange={e => handleCrewEdit(plan.id, field.id, e.target.value)}
                                    className="field-input px-2 py-1"
                                  />
                                ) : (
                                  <div className="flex items-center justify-between">
                                    <span className={`text-sm font-medium ${field.id === "encoder" ? "font-mono font-bold" : ""}`}>
                                      {(plan.crew[field.id] as string) || "—"}
                                    </span>
                                    {field.id === "encoder" && (
                                      <button
                                        onClick={() => setSwapModal(plan.id)}
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
                                  {editingPlanCrew === plan.id ? (
                                    <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 p-1">
                                      <input
                                        value={cf.name}
                                        onChange={e => updatePlanCustomField(plan.id, i, "name", e.target.value)}
                                        placeholder="Name"
                                        className="field-input w-24 px-2 py-0.5 text-xs"
                                      />
                                      <input
                                        value={cf.value}
                                        onChange={e => updatePlanCustomField(plan.id, i, "value", e.target.value)}
                                        placeholder="Value"
                                        className="field-input w-24 px-2 py-0.5 text-xs"
                                      />
                                      <button onClick={() => removePlanCustomField(plan.id, i)} className="px-1 text-xs text-danger">✕</button>
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
                        {editingPlanCrew === plan.id && (
                          <div className="mt-2">
                            <Btn variant="ghost" size="xs" onClick={() => addCustomToPlan(plan.id)}><Plus className="w-3 h-3" /> Add Custom Field</Btn>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
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

      {swapModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setSwapModal(null)}
        >
          <div className="card w-full max-w-sm animate-scale-in rounded-lg p-5 shadow-md" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold text-lg mb-1">Quick Encoder Swap</h4>
            <p className="meta mb-4">Change propagates immediately via WebSocket.</p>
            <div className="grid grid-cols-2 gap-2">
              {ENCODERS.map(enc => {
                const inUse = realtimePlans.some(p => p.crew.encoder === enc)
                const cur = (realtimePlans.find(p => p.id === swapModal)?.crew.encoder as string) === enc
                return (
                  <button
                    key={enc}
                    onClick={() => !inUse && handleSwap(swapModal, enc)}
                    disabled={inUse}
                    className={`rounded-md border p-3 text-sm font-mono font-semibold transition ${
                      cur
                        ? 'border-primary bg-primary/10 text-text'
                        : inUse
                          ? 'cursor-not-allowed border-border bg-surface-2 text-text-3'
                          : 'border-border bg-surface text-text hover:border-primary hover:text-primary'
                    }`}
                  >
                    {enc}
                    {cur && <span className="mt-0.5 block text-xs font-sans text-primary">Current</span>}
                    {inUse && !cur && <span className="block text-xs font-sans mt-0.5">In use</span>}
                  </button>
                )
              })}
            </div>
            <Btn variant="default" className="w-full mt-4" onClick={() => setSwapModal(null)}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  )
}
