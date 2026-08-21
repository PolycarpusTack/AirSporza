/**
 * FmScheduleBoard — the FM Schedule board screen scaffold at `/fm/schedule`
 * (Story FM2-1, FM2-1-T2). README §2 Schedule board: fluid table pane (sticky
 * header, day-header strips, grid `56px 1fr 118px 90px 90px 70px` — TIME /
 * EVENT / CHANNEL / STATUS / RIGHTS / CREW) + fixed 320px inspector +
 * top UNPLACED tray.
 *
 * Data/derivation is REUSED, not rebuilt (CLAUDE.md's "reuse before build"):
 * `groupEventsByDay`/`deriveRightsStatus`/`deriveCrewHealth` (ops/selectors.ts,
 * ops-selectors v3), `detectCrewConflicts`/`groupConflictsByPerson`
 * (utils/crewConflicts.ts), `useContracts` (ops/useContracts.ts, the same
 * shared quiet-fetch `useFmActionItems.ts` already reuses across the fm/ops
 * boundary) — same precedent, not a new one. `EventInspector` is mounted in
 * its EXISTING v1 shape only — v2's `fm2Actions` prop is FM2-2 scope, NOT
 * added here.
 *
 * Table grid/day-header-strip markup follows the SAME column-width/
 * typography conventions as `ops/ScheduleScreen.tsx` — the story's own
 * Abstraction Check note: "structural precedent, not imported" (this is FM's
 * own screen, `ops/ScheduleScreen.tsx` itself is read-only reference here,
 * never touched or imported).
 *
 * DRY FLAG (Abstraction Check, recorded not silently reproduced): the
 * RIGHTS_COLOR/CREW_COLOR/EDITORIAL_COLOR word-color maps below are a 3RD
 * occurrence of maps already duplicated in `ops/ScheduleScreen.tsx` (1st)
 * and `ops/EventInspector.tsx` (2nd, whose own header already flags
 * "Occurrence TWO... Rule of Three says duplicate locally; extract at the
 * third consumer"). Rule of Three is now met — ordinarily this would trigger
 * extraction into a shared token-color module. NOT done here: this task's
 * scope is constrained to touching only new fm/ files (+ FmShell.tsx's
 * override map), and the extraction target (`ops/selectors.ts` or a new
 * shared module both of ops+fm would import) requires editing
 * `ops/ScheduleScreen.tsx`/`ops/EventInspector.tsx`, which is out of bounds
 * here. Recorded as TD for a follow-up PREPARATORY task, not silently
 * re-duplicated as if novel.
 *
 * Week/day URL state: `useFmScheduleDay()` (fmScheduleUrlState.ts, a NEW
 * sibling hook — see that module's header for why it is a structural copy of
 * `ops/opsUrlState.ts`'s `useOpsDay`, not an import of it). Event/inspector
 * SELECTION on this screen is local component state, NOT URL-persisted — a
 * bounded scope call (the task brief's point 7 only asked about week/day
 * context); deep-linking a specific event into this screen is deferred to
 * whichever future task needs it.
 *
 * PLACE / AUTO-SUGGEST (ADR-023 "never auto-commit... share the exact same
 * mutation call as manual PLACE — no separate commit code path"): both call
 * `eventsApi.update(id, { channelId })` — the EXISTING slot-mutation path
 * (confirmed this session: the backend's `PUT /events/:id` already syncs the
 * linked BroadcastSlot via eventSlotBridge; no separate broadcast-slots call
 * is made here) — then `useScheduleSuggestions`'s `refresh()` to pull the
 * tray back to the server's fresh unplaced set. AUTO-SUGGEST fires that same
 * call for EVERY unplaced event's top-ranked candidate at once, skipping
 * "no safe slot" events entirely (never a partial/garbage placement).
 */
import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { eventsApi } from '../../services'
import { useApp } from '../../context/AppProvider'
import { useToast } from '../Toast'
import type { Event } from '../../data/types'
import { detectCrewConflicts, groupConflictsByPerson } from '../../utils/crewConflicts'
import { dateStr, weekMonday } from '../../utils/dateTime'
import { EventInspector } from '../ops/EventInspector'
import { getRowActivationProps } from '../ops/rowActivation'
import { formatOpsDayLabel } from '../ops/dayLabels'
import { useContracts } from '../ops/useContracts'
import {
  deriveCrewHealth,
  deriveRightsStatus,
  groupEventsByDay,
  type CrewHealth,
  type RightsStatus,
} from '../ops/selectors'
import { useFmScheduleDay } from './fmScheduleUrlState'
import { useScheduleSuggestions } from './useScheduleSuggestions'
import { UnplacedTray, type UnplacedTrayEvent } from './UnplacedTray'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

/** README §2 literal grid: `56px 1fr 118px 90px 90px 70px`. */
const GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '56px 1fr 118px 90px 90px 70px',
  gap: '10px',
  padding: '9px 16px',
  alignItems: 'center',
}

// See module header's DRY FLAG — structural duplicate, 3rd occurrence, TD-flagged.
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

const EDITORIAL_COLOR: Record<string, string> = {
  draft: 'var(--status-draft)',
  ready: 'var(--status-ready)',
  approved: 'var(--status-approved)',
}

const dayHeaderLabel = (dateKey: string) => formatOpsDayLabel(dateKey, { month: 'full' })

const wordStyle = (color: string): CSSProperties => ({
  ...monoStyle,
  fontSize: '10.5px',
  fontWeight: 600,
  letterSpacing: '0.5px',
  color,
})

export interface FmScheduleBoardProps {
  /** Testability seam — the ONLY impure edge; tests pass FIXTURE_NOW (mirrors ops/ScheduleScreen.tsx's own `now` prop). */
  now?: Date
}

export function FmScheduleBoard({ now = new Date() }: FmScheduleBoardProps = {}) {
  const { events, techPlans, crewFields, competitions } = useApp()
  const { contracts } = useContracts()
  const { day } = useFmScheduleDay()
  const toast = useToast()

  // Inspector selection: local state, NOT URL-persisted — see module header.
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null)

  // Week: ?day= wins; otherwise the week containing `now` (mirrors ops/ScheduleScreen.tsx).
  const weekStart = dateStr(weekMonday(day ? new Date(`${day}T00:00:00`) : now))

  const { unplaced, refresh } = useScheduleSuggestions(weekStart)

  const conflicts = useMemo(() => detectCrewConflicts(techPlans, events), [techPlans, events])
  const conflictGroups = useMemo(() => groupConflictsByPerson(techPlans, events), [techPlans, events])

  const weekGroups = useMemo(() => groupEventsByDay(events, { start: weekStart }), [events, weekStart])
  const weekEvents = useMemo(() => weekGroups.flatMap((g) => g.events), [weekGroups])
  const visibleGroups = useMemo(() => weekGroups.filter((group) => group.events.length > 0), [weekGroups])

  const competitionById = useMemo(() => new Map(competitions.map((c) => [c.id, c])), [competitions])

  const selectedEvent = useMemo(
    () => (selectedEventId === null ? null : events.find((e) => e.id === selectedEventId) ?? null),
    [events, selectedEventId],
  )

  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  const trayEvents = useMemo<UnplacedTrayEvent[]>(
    () =>
      unplaced.map((u) => ({
        eventId: u.eventId,
        title: eventsById.get(u.eventId)?.participants ?? `Event #${u.eventId}`,
        candidates: u.candidates,
      })),
    [unplaced, eventsById],
  )

  const place = useCallback(
    async (eventId: number, channelId: number) => {
      try {
        await eventsApi.update(eventId, { channelId })
        await refresh()
      } catch {
        toast.error('Could not place event — please try again')
      }
    },
    [refresh, toast],
  )

  const handleAutoSuggest = useCallback(async () => {
    const placements = unplaced.filter((u) => u.candidates.length > 0)
    if (placements.length === 0) return

    const settled = await Promise.allSettled(
      placements.map((u) => eventsApi.update(u.eventId, { channelId: u.candidates[0].channelId })),
    )
    if (settled.some((r) => r.status === 'rejected')) {
      toast.error('Some events could not be placed — please try again')
    }
    await refresh()
  }, [unplaced, refresh, toast])

  return (
    <div data-testid="fm-screen-schedule" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <UnplacedTray events={trayEvents} selectedEventId={selectedEventId} onPlace={place} onAutoSuggest={() => void handleAutoSuggest()} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          {weekEvents.length === 0 ? (
            <div
              data-testid="fm-schedule-empty"
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
              <div
                data-testid="fm-schedule-header"
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
                    data-testid={`fm-schedule-day-${group.date}`}
                    style={{
                      ...monoStyle,
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 16px',
                      background: 'var(--surface-shell-2)',
                      fontSize: '9.5px',
                      fontWeight: 600,
                      letterSpacing: '2px',
                      color: 'var(--text-shell-2)',
                    }}
                  >
                    <span>{dayHeaderLabel(group.date)}</span>
                    <span>{group.events.length}</span>
                  </div>
                  {group.events.map((event) => (
                    <FmScheduleRow
                      key={event.id}
                      event={event}
                      competitionName={competitionById.get(event.competitionId)?.name ?? ''}
                      rights={deriveRightsStatus(event, contracts, now)}
                      crew={deriveCrewHealth(event, techPlans, conflicts, crewFields)}
                      selected={selectedEventId === event.id}
                      onSelect={() => setSelectedEventId(event.id)}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}
        </main>

        <EventInspector
          event={selectedEvent}
          contracts={contracts}
          techPlans={techPlans}
          conflicts={conflicts}
          conflictGroups={conflictGroups}
          crewFields={crewFields}
          competitionName={selectedEvent ? competitionById.get(selectedEvent.competitionId)?.name : undefined}
          now={now}
        />
      </div>
    </div>
  )
}

function FmScheduleRow({
  event,
  competitionName,
  rights,
  crew,
  selected,
  onSelect,
}: {
  event: Event
  competitionName: string
  rights: RightsStatus
  crew: CrewHealth
  selected: boolean
  onSelect: () => void
}) {
  const editorialColor = event.status ? EDITORIAL_COLOR[event.status] : undefined

  return (
    <div
      data-testid={`fm-schedule-row-${event.id}`}
      data-event-id={String(event.id)}
      data-selected={selected ? 'true' : 'false'}
      {...getRowActivationProps(onSelect)}
      onClick={onSelect}
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
        <span
          style={{
            display: 'block',
            fontSize: '12.5px',
            fontWeight: 600,
            color: 'var(--text-shell)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.participants}
        </span>
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-shell-3)' }}>{competitionName}</span>
      </span>
      <span
        data-testid="fm-cell-channel"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-shell-2)' }}
      >
        {event.channel ? (
          <>
            <span aria-hidden="true" style={{ width: '7px', height: '7px', background: event.channel.color, display: 'inline-block' }} />
            {event.channel.name}
          </>
        ) : (
          '—'
        )}
      </span>
      <span data-testid="fm-cell-status" style={editorialColor ? wordStyle(editorialColor) : wordStyle('var(--text-shell-3)')}>
        {editorialColor ? event.status!.toUpperCase() : '—'}
      </span>
      <span style={wordStyle(RIGHTS_COLOR[rights])}>{rights}</span>
      <span style={wordStyle(CREW_COLOR[crew])}>{crew}</span>
    </div>
  )
}
