import type { Event, TechPlan, FieldConfig } from '../../data/types'

interface CrewTabProps {
  plans: TechPlan[]
  events: Event[]
  crewFields: FieldConfig[]
}

export function CrewTab({ plans, events, crewFields }: CrewTabProps) {
  const visibleFields = crewFields.filter(f => f.visible).sort((a, b) => a.order - b.order)

  if (plans.length === 0) {
    return <div className="card p-8 text-center text-text-3 text-sm">No crew assignments yet</div>
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Event</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Plan</th>
            {visibleFields.slice(0, 4).map(f => (
              <th key={f.id} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {plans.map(plan => {
            const ev = events.find(e => e.id === plan.eventId)
            return (
              <tr key={plan.id} className="hover:bg-surface-2 transition">
                <td className="px-4 py-3 font-medium">{ev?.participants ?? `Event #${plan.eventId}`}</td>
                <td className="px-4 py-3 text-muted text-xs font-mono uppercase">{plan.planType}</td>
                {visibleFields.slice(0, 4).map(f => (
                  <td key={f.id} className="px-4 py-3 text-text-2">
                    {(plan.crew[f.id] as string) || <span className="text-text-3">—</span>}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
