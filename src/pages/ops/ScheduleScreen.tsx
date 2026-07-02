/**
 * SCHEDULE — dense week table (A-3-T2; replaces the A-2-T1 placeholder).
 * Design: docs/design_handoff_planza_ops/README.md §1 SCHEDULE.
 * Contracts consumed: ops-selectors v1 (all derivation), ops-selection v1
 * (?event= shared with Rundown), ops-tokens v3 (rights/crew word aliases).
 *
 * Layout is a flex row (rail | table pane) so A-4's 320px inspector can slot in
 * as a third child without rework. Derived logic lives in selectors (anti-smart-ui);
 * this component only renders and wires.
 *
 * Contracts are NOT in AppProvider — fetched here once on mount. Loading/error
 * are deliberately QUIET per the ops design: rights render as MISSING until the
 * list arrives (documented judgment call, A-3-T2). If a second ops screen ever
 * duplicates this fetch, that is the Rule-of-Three extraction moment (backlog TD note).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Contract, Event } from '../../data/types'
import { useApp } from '../../context/AppProvider'
import { contractsApi } from '../../services'
import { detectCrewConflicts } from '../../utils/crewConflicts'
import { dateStr, weekMonday } from '../../utils/dateTime'
import { useOpsDay, useOpsSelection } from '../../components/ops/opsUrlState'
import {
  deriveCrewHealth,
  deriveRightsStatus,
  groupEventsByDay,
  type CrewHealth,
  type RightsStatus,
} from '../../components/ops/selectors'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

const GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '64px 1fr 110px 96px 104px 76px',
  gap: '10px',
  padding: '9px 16px',
  alignItems: 'center',
}

const RIGHTS_COLOR: Record<RightsStatus, string> = {
  VALID: 'var(--rights-valid)',
  EXPIRING: 'var(--rights-expiring)',
  NEGOTIATION: 'var(--rights-negotiation)',
  MISSING: 'var(--rights-missing)',
}

const CREW_COLOR: Record<CrewHealth, string> = {
  OK: 'var(--crew-ok)',
  OPEN: 'var(--crew-open)',
  CONFLICT: 'var(--crew-conflict)',
}

/** Editorial Status words — --status-* family is Editorial-only (ops-tokens guard). */
const EDITORIAL_COLOR: Record<string, string> = {
  draft: 'var(--status-draft)',
  ready: 'var(--status-ready)',
  approved: 'var(--status-approved)',
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

/** "2026-03-02" → "MON 2 MARCH" (local components — no TZ drift). */
function dayHeaderLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return `${WEEKDAYS[date.getDay()]} ${day} ${MONTHS[month - 1]}`
}

const wordStyle = (color: string): CSSProperties => ({
  ...monoStyle,
  fontSize: '10.5px',
  fontWeight: 600,
  letterSpacing: '0.5px',
  color,
})

export interface ScheduleScreenProps {
  /** Testability seam — the ONLY impure edge; tests pass FIXTURE_NOW. */
  now?: Date
}

export function ScheduleScreen({ now = new Date() }: ScheduleScreenProps) {
  const { events, sports, competitions, techPlans, crewFields } = useApp()
  const { eventId, setEventId } = useOpsSelection()
  const { day } = useOpsDay()

  // Contracts live outside AppProvider — quiet in-screen fetch (see header).
  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    let active = true
    contractsApi
      .list()
      .then((list: Contract[]) => {
        if (active) setContracts(list)
      })
      .catch(() => {
        /* quiet per ops design — rights stay MISSING/empty */
      })
    return () => {
      active = false
    }
  }, [])

  const [sportFilter, setSportFilter] = useState<number | null>(null)

  // Week: ?day= (ops-selection v1) wins; otherwise the week containing `now`.
  const weekStart = dateStr(weekMonday(day ? new Date(`${day}T00:00:00`) : now))

  // ONE conflict pass per render set (ops-selectors v1 contract).
  const conflicts = useMemo(() => detectCrewConflicts(techPlans, events), [techPlans, events])

  const weekGroups = useMemo(() => groupEventsByDay(events, { start: weekStart }), [events, weekStart])

  // Facet counts ALWAYS reflect the unfiltered week (story AC).
  const weekEvents = useMemo(() => weekGroups.flatMap((g) => g.events), [weekGroups])
  const countBySport = useMemo(() => {
    const counts = new Map<number, number>()
    for (const event of weekEvents) counts.set(event.sportId, (counts.get(event.sportId) ?? 0) + 1)
    return counts
  }, [weekEvents])

  // Filter composes AFTER counts, before rendering.
  const visibleGroups = useMemo(
    () =>
      weekGroups
        .map((group) => ({
          ...group,
          events: sportFilter === null ? group.events : group.events.filter((e) => e.sportId === sportFilter),
        }))
        .filter((group) => group.events.length > 0),
    [weekGroups, sportFilter],
  )

  const sportById = useMemo(() => new Map(sports.map((s) => [s.id, s])), [sports])
  const competitionById = useMemo(() => new Map(competitions.map((c) => [c.id, c])), [competitions])

  return (
    <div data-testid="ops-screen-schedule" style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 48px)' }}>
      {/* ── Left rail (190px): FILTER label + sport facets ── */}
      <aside style={{ width: '190px', flexShrink: 0, borderRight: '1px solid var(--border-shell)', padding: '16px 12px' }}>
        <div style={{ ...monoStyle, fontSize: '9.5px', fontWeight: 600, letterSpacing: '2px', color: 'var(--text-shell-3)', marginBottom: '10px' }}>
          FILTER
        </div>
        {sports.map((sport) => {
          const active = sportFilter === sport.id
          return (
            <button
              key={sport.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSportFilter(active ? null : sport.id)}
              style={{
                ...monoStyle,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                fontSize: '11px',
                padding: '6px 8px',
                marginBottom: '2px',
                borderRadius: 'var(--r-sm)',
                border: active ? '1px solid var(--accent-shell)' : '1px solid transparent',
                background: active ? 'var(--surface-shell-2)' : 'transparent',
                color: 'var(--text-shell)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span aria-hidden="true">{sport.icon}</span>
              <span style={{ flex: 1 }}>{sport.name}</span>
              <span style={{ color: 'var(--text-shell-3)' }}>{countBySport.get(sport.id) ?? 0}</span>
            </button>
          )
        })}
      </aside>

      {/* ── Center table pane (fluid; A-4 appends the 320px inspector after this) ── */}
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {weekEvents.length === 0 ? (
          <div
            data-testid="ops-schedule-empty"
            style={{
              ...monoStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '40vh',
              fontSize: '10.5px',
              fontWeight: 600,
              letterSpacing: '2px',
              color: 'var(--text-shell-3)',
            }}
          >
            NO EVENTS THIS WEEK
          </div>
        ) : (
          <div>
            {/* sticky column header row */}
            <div
              style={{
                ...GRID,
                ...monoStyle,
                position: 'sticky',
                top: 0,
                zIndex: 1,
                background: 'var(--surface-shell)',
                borderBottom: '1px solid var(--border-shell)',
                fontSize: '9px',
                fontWeight: 600,
                letterSpacing: '1px',
                color: 'var(--text-shell-3)',
              }}
            >
              <span>TIME</span>
              <span>EVENT</span>
              <span>CHANNEL</span>
              <span>STATUS</span>
              <span>RIGHTS</span>
              <span>CREW</span>
            </div>

            {visibleGroups.map((group) => (
              <section key={group.date}>
                <div
                  style={{
                    ...monoStyle,
                    padding: '6px 16px',
                    background: 'var(--surface-shell-2)',
                    fontSize: '9.5px',
                    fontWeight: 600,
                    letterSpacing: '2px',
                    color: 'var(--text-shell-2)',
                  }}
                >
                  {dayHeaderLabel(group.date)}
                </div>
                {group.events.map((event) => (
                  <ScheduleRow
                    key={event.id}
                    event={event}
                    sportIcon={sportById.get(event.sportId)?.icon ?? ''}
                    competitionName={competitionById.get(event.competitionId)?.name ?? ''}
                    rights={deriveRightsStatus(event, contracts, now)}
                    crew={deriveCrewHealth(event, techPlans, conflicts, crewFields)}
                    selected={eventId === String(event.id)}
                    onSelect={() => setEventId(String(event.id))}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function ScheduleRow({
  event,
  sportIcon,
  competitionName,
  rights,
  crew,
  selected,
  onSelect,
}: {
  event: Event
  sportIcon: string
  competitionName: string
  rights: RightsStatus
  crew: CrewHealth
  selected: boolean
  onSelect: () => void
}) {
  const editorialColor = event.status ? EDITORIAL_COLOR[event.status] : undefined

  return (
    <div
      data-testid={`ops-schedule-row-${event.id}`}
      data-event-id={String(event.id)}
      data-selected={selected ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
      style={{
        ...GRID,
        padding: '10px 16px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border-shell)',
        background: selected ? 'var(--surface-shell-2)' : 'transparent',
        boxShadow: selected ? 'inset 2px 0 0 var(--accent-shell)' : 'none',
      }}
    >
      <span style={{ ...monoStyle, fontSize: '11px', fontWeight: 600, color: 'var(--text-shell-2)' }}>{event.startTimeBE}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-shell)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span aria-hidden="true">{sportIcon}</span> {event.participants}
        </span>
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-shell-3)' }}>{competitionName}</span>
      </span>
      <span data-testid="ops-cell-channel" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-shell-2)' }}>
        {event.channel ? (
          <>
            {/* swatch color is DATA (channel record), not a code literal; --channel-* var
                adoption awaits BroadcastSlot resolution in AS-3/B-1 */}
            <span aria-hidden="true" style={{ width: '7px', height: '7px', background: event.channel.color, display: 'inline-block' }} />
            {event.channel.name}
          </>
        ) : (
          '—'
        )}
      </span>
      <span data-testid="ops-cell-status" style={editorialColor ? wordStyle(editorialColor) : wordStyle('var(--text-shell-3)')}>
        {editorialColor ? event.status!.toUpperCase() : '—'}
      </span>
      <span style={wordStyle(RIGHTS_COLOR[rights])}>{rights}</span>
      <span style={wordStyle(CREW_COLOR[crew])}>{crew}</span>
    </div>
  )
}
