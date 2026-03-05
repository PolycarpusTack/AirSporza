import type { Event } from '../../data/types'
import { fmtDate } from '../../utils'

interface SportNode {
  id: number
  name: string
  icon: string
  comps: CompNode[]
}

interface CompNode {
  id: number
  name: string
  events: Event[]
}

interface SportTreePanelProps {
  sportTree: SportNode[]
  filteredTree: SportNode[]
  selectedSport: number | null
  onSelectSport: (id: number | null) => void
  expanded: Set<number>
  onToggle: (id: number) => void
  selectedEventId: number | null
  onSelectEvent: (event: Event) => void
}

export function SportTreePanel({
  sportTree, filteredTree, selectedSport, onSelectSport,
  expanded, onToggle, selectedEventId, onSelectEvent,
}: SportTreePanelProps) {
  return (
    <div className="space-y-1 p-2">
      <div className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-text-2">Sports &amp; Events</div>
      {sportTree.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-2 pb-2">
          <button
            onClick={() => onSelectSport(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              !selectedSport
                ? 'bg-primary text-white border-primary'
                : 'text-text-2 border-border hover:bg-surface-2'
            }`}
          >
            All
          </button>
          {sportTree.map(s => (
            <button
              key={s.id}
              onClick={() => onSelectSport(selectedSport === s.id ? null : s.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                selectedSport === s.id
                  ? 'bg-primary text-white border-primary'
                  : 'text-text-2 border-border hover:bg-surface-2'
              }`}
            >
              {s.icon} {s.name}
            </button>
          ))}
        </div>
      )}
      {filteredTree.map(sport => (
        <div key={sport.id}>
          <button
            onClick={() => onToggle(sport.id)}
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
                  onClick={() => onSelectEvent(ev)}
                  className={`mb-0.5 w-full rounded-sm border px-2 py-2 text-left text-sm transition ${
                    selectedEventId === ev.id
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
}
