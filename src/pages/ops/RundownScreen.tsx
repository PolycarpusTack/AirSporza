/**
 * RUNDOWN — per-channel day timeline (B-1-T2; replaces the A-2-T1 placeholder).
 * Design: docs/design_handoff_planza_ops/README.md §2 PLANNER. Glossary: the
 * screen is named Rundown in code (the name "Planner" belongs to the legacy
 * PlannerView); the URL id stays /ops/planner — ADR-014 public contract, and so
 * does the root testid ops-screen-planner (OpsShell contract).
 * Contracts consumed: rundown-layout v1 (all geometry/lane derivation),
 * EventInspector v1 (embedded right pane, screen-side obligations honored),
 * ops-selection v1 (?day/?event), ops-tokens v3.
 *
 * Story B-1 pins owned here:
 *   pin 3 — ?day absent/invalid → TODAY resolved from the `now` prop seam.
 *   pin 4 — schedulesApi.listSlots({date}) per selected day; contracts fetched
 *           in-screen duplicating ScheduleScreen's quiet pattern (2nd
 *           occurrence — see the marked B-3 extraction trigger below);
 *           channels via channelsApi.list() (NOT in AppProvider — its
 *           orgConfig.channels is deprecated; ChannelSelect precedent).
 *   pin 7 — Channel.color stays DATA (A-3 precedent); unmapped/UNASSIGNED
 *           fall back to the --text-shell-3 family.
 * Outline precedence: SELECTED wins over conflicted — pinned from the design
 * HTML (`blockOl: isSel ? accent : conflict ? danger : none`).
 * Derived logic lives in rundownLayout/selectors (anti-smart-ui); this
 * component only renders and wires.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { BroadcastSlot, Channel, Contract } from '../../data/types'
import { useApp } from '../../context/AppProvider'
import { channelsApi, contractsApi, schedulesApi } from '../../services'
import { detectCrewConflicts, groupConflictsByPerson } from '../../utils/crewConflicts'
import { dateStr } from '../../utils/dateTime'
import { EventInspector } from '../../components/ops/EventInspector'
import { useOpsDay, useOpsSelection } from '../../components/ops/opsUrlState'
import { deriveCrewHealth } from '../../components/ops/selectors'
import {
  AXIS_SPAN_MIN,
  AXIS_START_MIN,
  layoutRundown,
  type RundownBlock,
} from '../../components/ops/rundownLayout'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

/** Neutral fallback for unmapped channels / UNASSIGNED (pin 7 — real channel vars are an E-2 item). */
const FALLBACK_LANE_COLOR = 'var(--text-shell-3)'

/** Axis ticks every 2h from 06:00 (design HTML: [6..22].map — 9 ticks). */
const TICK_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22]

const pad2 = (n: number) => String(n).padStart(2, '0')
const minutesToHHMM = (minutes: number) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`

/** Axis minutes → CSS left percentage STRING (rundownLayout's leftPct is the numeric sibling). */
const minutesToLeftPercent = (minutes: number) => `${((minutes - AXIS_START_MIN) / AXIS_SPAN_MIN) * 100}%`

/** Tooltip: raw window + axis flags (pin 5: EVERY block carries one). */
function blockTitle(block: RundownBlock): string {
  const rawDurationMin = block.rawEndMin - block.rawStartMin
  const base = `${block.event.participants} · ${minutesToHHMM(block.rawStartMin)} · ${rawDurationMin} min`
  if (block.isOffAxis) return `${base} · OUTSIDE THE 05:00–24:00 AXIS`
  if (block.isClamped) return `${base} · CLAMPED TO THE 05:00–24:00 AXIS`
  return base
}

export interface RundownScreenProps {
  /** Testability seam — the ONLY impure edge; tests pass a fixed clock. */
  now?: Date
}

export function RundownScreen({ now = new Date() }: RundownScreenProps) {
  const { events, competitions, techPlans, crewFields } = useApp()
  const { eventId, setEventId } = useOpsSelection()
  const { day: dayParam } = useOpsDay()

  // Pin 3: ?day wins; absent/invalid (hook yields null) → today, LOCAL components.
  const day = dayParam ?? dateStr(now)

  // Contracts live outside AppProvider — quiet in-screen fetch. SECOND
  // occurrence of this pattern (first: ScheduleScreen, A-3-T2) — the Rule of
  // Three extraction triggers at the THIRD consumer (B-3, as a PREP task there).
  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    let isActive = true
    contractsApi
      .list()
      .then((list: Contract[]) => {
        if (isActive) setContracts(list)
      })
      .catch(() => {
        /* quiet per ops design — rights stay MISSING in the inspector */
      })
    return () => {
      isActive = false
    }
  }, [])

  // Channel inventory — NOT in AppProvider (orgConfig.channels is deprecated);
  // channelsApi is the sanctioned source (ChannelSelect precedent). Quiet:
  // until it arrives every block renders in the UNASSIGNED lane.
  const [channels, setChannels] = useState<Channel[]>([])
  useEffect(() => {
    let isActive = true
    channelsApi
      .list()
      .then((list: Channel[]) => {
        if (isActive) setChannels(list)
      })
      .catch(() => {
        /* quiet — UNASSIGNED lane absorbs everything */
      })
    return () => {
      isActive = false
    }
  }, [])

  // Pin 4: slots per selected day; day change refetches, selection does not.
  const [slots, setSlots] = useState<BroadcastSlot[]>([])
  useEffect(() => {
    let isActive = true
    schedulesApi
      .listSlots({ date: day })
      .then((list: BroadcastSlot[]) => {
        if (isActive) setSlots(list)
      })
      .catch(() => {
        /* quiet — event-window fallback still positions blocks */
      })
    return () => {
      isActive = false
    }
  }, [day])

  // EventInspector v1 obligations: ONE detect pass + ONE grouping pass per screen.
  const conflicts = useMemo(() => detectCrewConflicts(techPlans, events), [techPlans, events])
  const conflictGroups = useMemo(() => groupConflictsByPerson(techPlans, events), [techPlans, events])

  const lanes = useMemo(() => layoutRundown(events, slots, channels, day), [events, slots, channels, day])

  const competitionById = useMemo(() => new Map(competitions.map((c) => [c.id, c])), [competitions])

  // ?event= is an opaque id (ops-selection v1 rule 5) — unknown ids render as no selection.
  const selectedEvent = useMemo(
    () => (eventId === null ? null : events.find((e) => String(e.id) === eventId) ?? null),
    [events, eventId],
  )

  // Block outline rule 1 consistency: conflicted = deriveCrewHealth CONFLICT
  // (any ConflictMap hit on the event's plans) — the same selector the words use.
  const isConflicted = (block: RundownBlock) =>
    deriveCrewHealth(block.event, techPlans, conflicts, crewFields) === 'CONFLICT'

  return (
    <div data-testid="ops-screen-planner" style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 48px)' }}>
      {/* ── Timeline pane (fluid; the 320px inspector follows) ── */}
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '6px 16px 16px' }}>
        {/* axis tick row — offset by the 112px lane-label column */}
        <div style={{ position: 'relative', height: '22px', marginLeft: '112px' }}>
          {TICK_HOURS.map((hour) => (
            <div
              key={hour}
              style={{
                ...monoStyle,
                position: 'absolute',
                top: '4px',
                left: minutesToLeftPercent(hour * 60),
                fontSize: '9.5px',
                fontWeight: 500,
                color: 'var(--text-shell-3)',
                transform: 'translateX(-50%)',
              }}
            >
              {minutesToHHMM(hour * 60)}
            </div>
          ))}
        </div>

        {lanes.length === 0 ? (
          <div
            data-testid="ops-rundown-empty"
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
            NO EVENTS THIS DAY
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {lanes.map((lane) => {
                const laneKey = lane.channel ? String(lane.channel.id) : 'unassigned'
                const laneColor = lane.channel?.color || FALLBACK_LANE_COLOR
                return (
                  <div key={laneKey} data-testid={`ops-rundown-lane-${laneKey}`} style={{ display: 'flex', alignItems: 'center' }}>
                    {/* lane label: 8px swatch + mono 600 11px (112px column) */}
                    <div style={{ width: '112px', flex: 'none', display: 'flex', alignItems: 'center', gap: '7px', paddingRight: '10px' }}>
                      <span
                        data-testid={`ops-rundown-lane-swatch-${laneKey}`}
                        aria-hidden="true"
                        style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: laneColor, flex: 'none' }}
                      />
                      <span
                        data-testid={`ops-rundown-lane-label-${laneKey}`}
                        style={{ ...monoStyle, fontSize: '11px', fontWeight: 600, color: 'var(--text-shell)' }}
                      >
                        {lane.channel?.name ?? 'UNASSIGNED'}
                      </span>
                    </div>
                    {/* 64px track */}
                    <div
                      style={{
                        position: 'relative',
                        flex: 1,
                        height: '64px',
                        background: 'var(--surface-shell)',
                        border: '1px solid var(--border-shell)',
                        borderRadius: '6px',
                      }}
                    >
                      {lane.blocks.map((laneBlock) => {
                        const isSelected = eventId === String(laneBlock.event.id)
                        // SELECTED wins over conflicted (design HTML precedence)
                        const outlineColor = isSelected
                          ? 'var(--accent-shell)'
                          : isConflicted(laneBlock)
                            ? 'var(--alert-danger)'
                            : null
                        return (
                          <div
                            key={laneBlock.event.id}
                            data-testid={`ops-rundown-block-${laneBlock.event.id}`}
                            data-event-id={String(laneBlock.event.id)}
                            data-selected={isSelected ? 'true' : 'false'}
                            role="button"
                            tabIndex={0}
                            title={blockTitle(laneBlock)}
                            onClick={() => setEventId(String(laneBlock.event.id))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') setEventId(String(laneBlock.event.id))
                            }}
                            style={{
                              position: 'absolute',
                              top: '6px',
                              bottom: '6px',
                              left: `${laneBlock.leftPct}%`,
                              width: `${laneBlock.widthPct}%`,
                              minWidth: '96px', // design visual floor, on top of the 80-min geometry floor
                              backgroundColor: `color-mix(in srgb, ${laneColor} 15%, transparent)`,
                              borderLeftWidth: '3px',
                              borderLeftStyle: 'solid',
                              borderLeftColor: laneColor,
                              borderRadius: '4px',
                              padding: '6px 10px',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              outlineWidth: '1px',
                              outlineStyle: outlineColor ? 'solid' : 'none',
                              ...(outlineColor ? { outlineColor } : {}),
                            }}
                          >
                            <div style={{ ...monoStyle, fontSize: '9.5px', fontWeight: 600, color: 'var(--text-shell-2)' }}>
                              {minutesToHHMM(laneBlock.rawStartMin)} · {laneBlock.rawEndMin - laneBlock.rawStartMin} min
                            </div>
                            <div
                              style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: 'var(--text-shell)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                marginTop: '2px',
                              }}
                            >
                              {laneBlock.event.participants}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* legend row (design §2; --status-* here are EDITORIAL words — tokens guard ok) */}
            <div
              style={{
                ...monoStyle,
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                margin: '16px 0 0 112px',
                fontSize: '10px',
                fontWeight: 400,
                color: 'var(--text-shell-3)',
              }}
            >
              {(
                [
                  ['DRAFT', 'var(--status-draft)'],
                  ['READY', 'var(--status-ready)'],
                  ['APPROVED', 'var(--status-approved)'],
                ] as const
              ).map(([label, color]) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }} />
                  {label}
                </span>
              ))}
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span
                  aria-hidden="true"
                  style={{ width: '10px', height: '10px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--alert-danger)', borderRadius: '3px' }}
                />
                CREW CONFLICT
              </span>
              <span style={{ marginLeft: 'auto' }}>CLICK A BLOCK TO SELECT · FULL DETAIL IN SCHEDULE</span>
            </div>
          </>
        )}
      </main>

      {/* ── Right inspector (EventInspector v1 — panel chrome lives in the component) ── */}
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
  )
}
