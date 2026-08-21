/**
 * UnplacedTray — FM Schedule board's UNPLACED tray (FM2-1-T2, Story FM2-1,
 * README §2 Schedule board: "Unplaced tray (top, bg #141A1E): 'UNPLACED (n)'
 * mono amber label; per-event dashed-border chips (amber; teal when
 * selected) with slot suggestion hint; right-aligned '⚡ AUTO-SUGGEST SLOTS'
 * (teal outline)").
 *
 * Pure, prop-driven (anti-smart-ui): no fetching, no useApp, no mutation
 * calls of its own — FmScheduleBoard owns the data (useScheduleSuggestions)
 * and the PLACE/AUTO-SUGGEST mutation wiring (eventsApi.update), and hands
 * this component a pre-joined `events` list (eventId + display title +
 * candidates) plus two callbacks. Kept in its own file (not co-located in
 * FmScheduleBoard.tsx) so its chip-state/interaction contract is directly
 * unit-testable without AppProvider/router/fetch scaffolding — the story's
 * own "your call, document it" note on this split.
 *
 * PLACE (AC): clicking a has-suggestion chip IS "PLACE IN SUGGESTED SLOT
 * (from a chip...)" — it calls `onPlace(eventId, topCandidate.channelId)`.
 * The caller is responsible for that call reaching the exact same
 * slot-mutation path (`eventsApi.update`) a manual placement would use —
 * this component only reports the intent.
 *
 * "no safe slot" (AC error flow): a chip whose `candidates` array is empty
 * renders NO suggestion hint and is disabled — never a misleading
 * empty-looking chip; `data-suggestion-state` distinguishes the two chip
 * states for tests/inspection.
 *
 * Tokens: ops-tokens v3 vars only (FmShell v1's own header rule) — never hex.
 */
import type { CSSProperties } from 'react'

export interface UnplacedTrayCandidate {
  channelId: number
  channelName: string
  channelLoad: number
}

/** A pre-joined tray row: FmScheduleBoard resolves `eventId` → display title before handing this list down. */
export interface UnplacedTrayEvent {
  eventId: number
  title: string
  candidates: UnplacedTrayCandidate[]
}

export interface UnplacedTrayProps {
  events: UnplacedTrayEvent[]
  /** Currently inspector-selected event id, for the chip's "teal when selected" visual state only (README §2). */
  selectedEventId?: number | null
  /** Fired with (eventId, topCandidate.channelId) when a has-suggestion chip is clicked. */
  onPlace: (eventId: number, channelId: number) => void
  /** Fired when AUTO-SUGGEST SLOTS is clicked. */
  onAutoSuggest: () => void
}

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

const trayStyle: CSSProperties = {
  ...monoStyle,
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 16px',
  background: 'var(--surface-shell-2)',
  borderBottom: '1px solid var(--border-shell)',
  flexWrap: 'wrap',
}

const labelStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '9.5px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  color: 'var(--alert-warning)',
  flexShrink: 0,
}

const chipsWrapStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  flex: 1,
}

type ChipVisualState = 'suggested' | 'selected' | 'none'

function chipStyle(state: ChipVisualState): CSSProperties {
  const color =
    state === 'selected' ? 'var(--accent-shell)' : state === 'suggested' ? 'var(--alert-warning)' : 'var(--text-shell-3)'
  return {
    ...monoStyle,
    fontSize: '10.5px',
    fontWeight: 500,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    padding: '6px 10px',
    borderRadius: 'var(--r-sm)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: color,
    color,
    background: 'transparent',
    cursor: state === 'none' ? 'default' : 'pointer',
  }
}

const autoSuggestStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '10.5px',
  fontWeight: 700,
  letterSpacing: '0.5px',
  padding: '7px 12px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--accent-shell)',
  background: 'transparent',
  color: 'var(--accent-shell)',
  marginLeft: 'auto',
  flexShrink: 0,
  cursor: 'pointer',
}

const autoSuggestDisabledStyle: CSSProperties = {
  ...autoSuggestStyle,
  opacity: 0.5,
  cursor: 'default',
}

export function UnplacedTray({ events, selectedEventId = null, onPlace, onAutoSuggest }: UnplacedTrayProps) {
  const placeable = events.some((e) => e.candidates.length > 0)

  return (
    <div data-testid="fm-unplaced-tray" style={trayStyle}>
      <span data-testid="fm-tray-label" style={labelStyle}>
        UNPLACED ({events.length})
      </span>

      <div style={chipsWrapStyle}>
        {events.map((event) => {
          const hasSuggestion = event.candidates.length > 0
          const top = hasSuggestion ? event.candidates[0] : null
          const selected = event.eventId === selectedEventId
          const state: ChipVisualState = !hasSuggestion ? 'none' : selected ? 'selected' : 'suggested'

          return (
            <button
              key={event.eventId}
              type="button"
              data-testid={`fm-tray-chip-${event.eventId}`}
              data-suggestion-state={hasSuggestion ? 'has-suggestion' : 'no-safe-slot'}
              data-selected={selected ? 'true' : 'false'}
              style={chipStyle(state)}
              disabled={!hasSuggestion}
              onClick={() => {
                if (top) onPlace(event.eventId, top.channelId)
              }}
            >
              <span>{event.title}</span>
              <span>{hasSuggestion ? `→ ${top!.channelName}` : 'no safe slot'}</span>
            </button>
          )
        })}
      </div>

      {events.length > 0 && (
        <button
          type="button"
          data-testid="fm-tray-auto-suggest"
          style={placeable ? autoSuggestStyle : autoSuggestDisabledStyle}
          disabled={!placeable}
          onClick={onAutoSuggest}
        >
          ⚡ AUTO-SUGGEST SLOTS
        </button>
      )}
    </div>
  )
}
