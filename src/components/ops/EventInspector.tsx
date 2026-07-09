/**
 * EventInspector — 320px right-pane inspector for the selected event (A-4-T1).
 * Design: docs/design_handoff_planza_ops/README.md §1 SCHEDULE inspector spec.
 * Contracts consumed: ops-selectors v2 (deriveRightsInfo / deriveCrewRoles /
 * filterConflictsToEvent), ops-tokens v3 (rights/crew aliases; --status-* is
 * Editorial-only; --alert-danger callout). SHARED component: B-1 Rundown mounts
 * it too — props-driven, NO fetching, NO useApp (anti-smart-ui).
 *
 * Pinned decisions (task card, A-4-T1):
 * - LIVE/DELAYED badge from isLive/isDelayedLive booleans ONLY; both → LIVE
 *   wins; neither → no badge. NEVER derived from event.status === 'live'.
 * - Duration via effectiveDurationMin (TD-24 sanctioned accessor); channel via
 *   the event.channel relation, — when null.
 * - Conflict-callout `role` fields arrive as RAW crew fieldIds — mapped to
 *   labels here via the crewFields prop (unknown ids fall back to the raw id).
 * - RIGHTS: validUntil null → no "until" line; a lapsed date still renders
 *   (informative "until <past date>").
 * - Crew rows derive from crewFields (visible, non-checkbox) — never hard-coded.
 */
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Contract, Event, FieldConfig, TechPlan } from '../../data/types'
import type { ConflictMap, PersonConflictGroup } from '../../utils/crewConflicts'
import { effectiveDurationMin, getDateKey } from '../../utils/dateTime'
import { formatOpsDayLabel } from './dayLabels'
import {
  deriveCrewRoles,
  deriveRightsInfo,
  filterConflictsToEvent,
  type CrewHealth,
  type RightsStatus,
} from './selectors'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

/** Section label — mono 9.5px/600, ls 2px, uppercase (README §Type scale). */
const sectionLabelStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '9.5px',
  fontWeight: 600,
  letterSpacing: '2px',
  color: 'var(--text-shell-3)',
}

/** Bordered-top section wrapper (RIGHTS / CREW / TECH PLANS per design). */
const sectionStyle: CSSProperties = {
  borderTop: '1px solid var(--border-shell)',
  paddingTop: '11px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const metaLineStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '10.5px',
  fontWeight: 400,
  color: 'var(--text-shell-2)',
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

/**
 * Editorial Status words — --status-* family is Editorial-only (ops-tokens
 * guard). Occurrence TWO of this map (ScheduleScreen has the first) — Rule of
 * Three says duplicate locally; extract at the third consumer.
 */
const EDITORIAL_COLOR: Record<string, string> = {
  draft: 'var(--status-draft)',
  ready: 'var(--status-ready)',
  approved: 'var(--status-approved)',
}

const MONTHS_ABBR_TITLE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * startDateBE → "WED 4 MAR". Formatting is shared since B-2-T1 (the Rundown
 * became the family's THIRD consumer — Rule of Three triggered extraction);
 * getDateKey still normalizes API ISO-datetime strings and local Date objects
 * here (local components — no TZ drift), formatOpsDayLabel handles the rest
 * incl. the '—' fallback for date-less events.
 */
function metaDateLabel(startDateBE: Event['startDateBE']): string {
  const key = startDateBE ? getDateKey(startDateBE) : ''
  return formatOpsDayLabel(key, { month: 'abbr' })
}

/** 'YYYY-MM-DD' (deriveRightsInfo.validUntil) → '30 Jun 2027' (design casing). */
function untilDateLabel(validUntil: string): string {
  const [year, month, day] = validUntil.split('-').map(Number)
  return `${day} ${MONTHS_ABBR_TITLE[month - 1]} ${year}`
}

export interface EventInspectorProps {
  /** null → quiet empty state */
  event: Event | null
  contracts: Contract[]
  techPlans: TechPlan[]
  /** the screen's single detectCrewConflicts pass */
  conflicts: ConflictMap
  /** single memoized groupConflictsByPerson pass (screen-side) */
  conflictGroups: PersonConflictGroup[]
  crewFields: FieldConfig[]
  competitionName?: string
  /** testability seam; tests pass FIXTURE_NOW */
  now?: Date
}

export function EventInspector({
  event,
  contracts,
  techPlans,
  conflicts,
  conflictGroups,
  crewFields,
  competitionName,
  now = new Date(),
}: EventInspectorProps) {
  return (
    <aside
      data-testid="ops-inspector"
      style={{
        width: '320px',
        flexShrink: 0,
        borderLeft: '1px solid var(--border-shell)',
        backgroundColor: 'var(--surface-shell)',
        overflow: 'auto',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '13px',
      }}
    >
      <div style={sectionLabelStyle}>INSPECTOR</div>
      {event === null ? (
        <div
          data-testid="ops-inspector-empty"
          style={{
            ...monoStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            minHeight: '120px',
            fontSize: '10.5px',
            fontWeight: 600,
            letterSpacing: '2px',
            color: 'var(--text-shell-3)',
          }}
        >
          NO EVENT SELECTED
        </div>
      ) : (
        <InspectorBody
          event={event}
          contracts={contracts}
          techPlans={techPlans}
          conflicts={conflicts}
          conflictGroups={conflictGroups}
          crewFields={crewFields}
          competitionName={competitionName}
          now={now}
        />
      )}
    </aside>
  )
}

function InspectorBody({
  event,
  contracts,
  techPlans,
  conflicts,
  conflictGroups,
  crewFields,
  competitionName,
  now,
}: Required<Pick<EventInspectorProps, 'now'>> & Omit<EventInspectorProps, 'event' | 'now'> & { event: Event }) {
  const navigate = useNavigate()

  // Pinned badge rule: booleans only; both → LIVE wins; neither → no badge.
  const badge = event.isLive
    ? { label: 'LIVE', color: 'var(--alert-danger)' }
    : event.isDelayedLive
      ? { label: 'DELAYED', color: 'var(--alert-warning)' }
      : null

  const editorialColor = event.status ? EDITORIAL_COLOR[event.status] : undefined

  const rights = deriveRightsInfo(event, contracts, now)
  const crewRows = deriveCrewRoles(event, techPlans, conflicts, crewFields)
  const eventConflictGroups = filterConflictsToEvent(event, conflictGroups)
  const eventPlans = techPlans.filter((plan) => plan.eventId === event.id)

  const getRoleLabel = (fieldId: string) => crewFields.find((field) => field.id === fieldId)?.label ?? fieldId

  const metaLine = [
    metaDateLabel(event.startDateBE),
    event.startTimeBE,
    `${effectiveDurationMin(event)} min`,
    event.channel?.name ?? '—',
  ].join(' · ')

  return (
    <>
      {/* ── header: badge + editorial word, then title ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
          {badge && (
            <span
              data-testid="ops-inspector-badge"
              style={{
                ...monoStyle,
                fontSize: '9px',
                fontWeight: 600,
                color: badge.color,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: badge.color,
                padding: '2px 5px',
                borderRadius: '3px',
              }}
            >
              {badge.label}
            </span>
          )}
          <span
            data-testid="ops-inspector-status"
            style={{
              ...monoStyle,
              fontSize: '10px',
              fontWeight: 500,
              color: editorialColor ?? 'var(--text-shell-3)',
            }}
          >
            {editorialColor ? event.status!.toUpperCase() : '—'}
          </span>
        </div>
        <div
          data-testid="ops-inspector-title"
          style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.3, color: 'var(--text-shell)' }}
        >
          {event.participants}
        </div>
        {competitionName && (
          <div data-testid="ops-inspector-competition" style={{ ...metaLineStyle, marginTop: '5px' }}>
            {competitionName}
          </div>
        )}
        <div data-testid="ops-inspector-meta" style={{ ...metaLineStyle, marginTop: '2px' }}>
          {metaLine}
        </div>
      </div>

      {/* ── conflict callout (groupConflictsByPerson detail, event-scoped) ── */}
      {eventConflictGroups.length > 0 && (
        <div
          data-testid="ops-inspector-conflict"
          style={{
            ...monoStyle,
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--alert-danger)',
            backgroundColor: 'color-mix(in srgb, var(--alert-danger) 10%, transparent)',
            borderRadius: '6px',
            padding: '9px 11px',
            fontSize: '10.5px',
            fontWeight: 500,
            color: 'var(--alert-danger)',
            lineHeight: 1.5,
          }}
        >
          {eventConflictGroups.map((group) =>
            group.conflicts.map((conflict, index) => {
              const ownBooking = conflict.eventA.id === event.id ? conflict.eventA : conflict.eventB
              const clashingBooking = conflict.eventA.id === event.id ? conflict.eventB : conflict.eventA
              return (
                <div key={`${group.personName}-${index}`}>
                  ⚠ {group.personName}: {getRoleLabel(ownBooking.role)} also booked as{' '}
                  {getRoleLabel(clashingBooking.role)} on {clashingBooking.name} · {clashingBooking.time}
                </div>
              )
            }),
          )}
        </div>
      )}

      {/* ── RIGHTS ── */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>RIGHTS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span
            data-testid="ops-inspector-rights-dot"
            aria-hidden="true"
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: RIGHTS_COLOR[rights.status],
              flex: 'none',
            }}
          />
          <span
            data-testid="ops-inspector-rights-word"
            style={{ ...monoStyle, fontSize: '11px', fontWeight: 500, color: RIGHTS_COLOR[rights.status] }}
          >
            {rights.status}
          </span>
        </div>
        {/* validUntil null → no line; lapsed dates still render (informative, pinned) */}
        {rights.validUntil && (
          <div data-testid="ops-inspector-rights-until" style={metaLineStyle}>
            until {untilDateLabel(rights.validUntil)}
          </div>
        )}
      </div>

      {/* ── CREW (rows from crewFields via deriveCrewRoles — never hard-coded) ── */}
      <div style={{ ...sectionStyle, gap: '5px' }}>
        <div style={{ ...sectionLabelStyle, marginBottom: '3px' }}>CREW</div>
        {crewRows.map((row) => (
          <div
            key={row.fieldId}
            data-testid={`ops-inspector-crew-${row.fieldId}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span
              data-testid="ops-crew-dot"
              aria-hidden="true"
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: CREW_COLOR[row.state],
                flex: 'none',
              }}
            />
            <span
              data-testid="ops-crew-name"
              style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-shell)', flex: 'none' }}
            >
              {row.name ?? '—'}
            </span>
            <span
              data-testid="ops-crew-role"
              style={{
                ...monoStyle,
                fontSize: '10px',
                fontWeight: 400,
                color: 'var(--text-shell-3)',
                flex: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {row.label}
            </span>
            <span
              data-testid="ops-crew-state"
              style={{ ...monoStyle, fontSize: '9.5px', fontWeight: 500, color: CREW_COLOR[row.state], flex: 'none' }}
            >
              {row.state}
            </span>
          </div>
        ))}
      </div>

      {/* ── TECH PLANS ── */}
      <div style={{ ...sectionStyle, gap: '7px' }}>
        <div style={sectionLabelStyle}>TECH PLANS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {eventPlans.map((plan) => (
            <span
              key={plan.id}
              data-testid="ops-inspector-plan-chip"
              style={{
                ...monoStyle,
                fontSize: '10px',
                fontWeight: 500,
                border: '1px solid var(--border-shell)',
                background: 'var(--surface-shell-2)',
                borderRadius: '4px',
                padding: '3px 7px',
                color: 'var(--text-shell)',
              }}
            >
              {plan.planType}
            </span>
          ))}
          {/* Plain absolute navigate LEAVING /ops (OpsShell v1 rule applies inside
              /ops only). Known limitations, accepted at the task card:
              SportsWorkspace cannot preselect an event (its selection is
              component-local), and RequireRole may bounce non-planner roles. */}
          <button
            type="button"
            onClick={() => navigate('/sports')}
            style={{
              ...monoStyle,
              fontSize: '10px',
              fontWeight: 500,
              borderWidth: '1px',
              borderStyle: 'dashed',
              borderColor: 'var(--border-shell)',
              background: 'transparent',
              color: 'var(--text-shell-2)',
              borderRadius: '4px',
              padding: '3px 7px',
              cursor: 'pointer',
            }}
          >
            + PLAN
          </button>
        </div>
      </div>
    </>
  )
}
