/**
 * RecordInspector — 320px right-pane inspector for the selected registry record
 * (C-3-T1). Design: docs/design_handoff_planza_ops/README.md §4 REGISTRY inspector.
 * PURE, props-driven (EventInspector idiom): NO fetch, NO useEffect, NO useApp.
 * The lazy linked-record fetch is isolated in useLinkedRecords; the screen passes
 * the resolved sections in.
 *
 * C-3 pin 1: Registry gets its OWN inspector — NOT a reuse/extract of
 * EventInspector (2nd 320px chrome = Rule-of-Two watch item, recorded; extract
 * only if a THIRD 320px inspector appears).
 *
 * Provenance (DoR flag 1): the design's `· LAST SYNC 2H AGO` suffix is DROPPED —
 * no sync timestamp exists on any payload (registry-selectors v1.1 note). We hold
 * only the SOURCE CODE (e.g. TSDB), not the full name ("THE SPORTS DB"), so
 * `SYNCED FROM TSDB` is shown honestly (minor designer note for E-2).
 *
 * STATUS color: local copy of the C-2 token→CSS-var map. This is occurrence TWO
 * (RegistryScreen has the first) — Rule of Three says duplicate locally; extract
 * at the third consumer. Kept literal so the grep trigger stays detectable
 * (EventInspector EDITORIAL_COLOR precedent).
 */
import type { CSSProperties, ReactNode } from 'react'
import type { LinkedRecord, LinkedRecordSection, RegistryKind, RegistryRecord, RegistryStatusColor } from './registrySelectors'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

const sectionLabelStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '9.5px',
  fontWeight: 600,
  letterSpacing: '2px',
  color: 'var(--text-shell-3)',
}

/** Selector token → CSS var (occurrence TWO — Rule of Three not yet hit; see header). */
const STATUS_COLOR: Record<RegistryStatusColor, string> = {
  green: 'var(--status-approved)',
  amber: 'var(--alert-warning)',
  neutral: 'var(--text-shell-3)',
}

/** 44px icon-tile glyph per kind — pure component decoration (no icon on the record). */
const KIND_GLYPH: Record<RegistryKind, string> = {
  sport: '🏅',
  competition: '🏆',
  team: '🛡️',
  player: '👤',
}

const RELATION_LABEL: Record<LinkedRecordSection['relation'], string> = {
  competitions: 'COMPETITIONS',
  teams: 'TEAMS',
  players: 'PLAYERS',
}

export interface RecordInspectorProps {
  /** null → quiet empty state */
  record: RegistryRecord | null
  /** resolved by useLinkedRecords (registry-selectors v1.1); empty sections already omitted */
  linkedSections: LinkedRecordSection[]
  /** hop → sets ?record (REPLACE, ops-selection rule 7) */
  onHop: (recordId: string) => void
}

export function RecordInspector({ record, linkedSections, onHop }: RecordInspectorProps) {
  return (
    <aside
      data-testid="ops-record-inspector"
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
      <div style={sectionLabelStyle}>RECORD</div>
      {record === null ? (
        <div
          data-testid="ops-record-inspector-empty"
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
          NO RECORD SELECTED
        </div>
      ) : (
        <InspectorBody record={record} linkedSections={linkedSections} onHop={onHop} />
      )}
    </aside>
  )
}

function InspectorBody({ record, linkedSections, onHop }: { record: RegistryRecord } & Omit<RecordInspectorProps, 'record'>) {
  const provenance =
    record.source === 'MANUAL'
      ? 'MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE'
      : `SYNCED FROM ${record.source}`

  // COUNTRY row (design attrsOf): team shows the NAME, player the ISO code — one row.
  const country = record.country ?? record.countryCode
  const remark = record.notes?.trim() ? record.notes : null

  return (
    <>
      {/* ── header: icon tile + name + kind chip ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
        <div
          aria-hidden="true"
          style={{
            width: '44px',
            height: '44px',
            flexShrink: 0,
            border: '1px solid var(--border-shell)',
            background: 'var(--surface-shell-2)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
          }}
        >
          {KIND_GLYPH[record.kind]}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            data-testid="ops-record-name"
            style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.3, color: 'var(--text-shell)' }}
          >
            {record.name}
          </div>
          <KindChip kind={record.kind} />
        </div>
      </div>

      {/* ── provenance (NO last-sync suffix — dropped) ── */}
      <div
        data-testid="ops-record-provenance"
        style={{ ...monoStyle, fontSize: '9.5px', fontWeight: 500, letterSpacing: '0.5px', color: 'var(--text-shell-3)' }}
      >
        {provenance}
      </div>

      {/* ── attribute rows (each rendered only when present) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-shell)', paddingTop: '11px' }}>
        <AttrRow testid="ops-record-attr-type" label="TYPE" value={record.kind.toUpperCase()} />
        {record.sportLabel && <AttrRow testid="ops-record-attr-sport" label="SPORT" value={record.sportLabel} />}
        {country && <AttrRow testid="ops-record-attr-country" label="COUNTRY" value={country} />}
        {record.detail && <AttrRow testid="ops-record-attr-detail" label="DETAIL" value={record.detail} />}
        <AttrRow
          testid="ops-record-attr-status"
          label="STATUS"
          value={
            <span data-testid="ops-record-status-word" style={{ ...monoStyle, fontWeight: 600, color: STATUS_COLOR[record.status.color] }}>
              {record.status.word}
            </span>
          }
        />
        <AttrRow testid="ops-record-attr-source" label="SOURCE" value={record.source} />
      </div>

      {/* ── LINKED hop sections (empties already omitted by the resolver) ── */}
      {linkedSections.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-shell)', paddingTop: '11px' }}>
          <div style={sectionLabelStyle}>LINKED</div>
          {linkedSections.map((section) => (
            <div key={section.relation} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ ...monoStyle, fontSize: '9px', fontWeight: 600, letterSpacing: '1.5px', color: 'var(--text-shell-3)' }}>
                {RELATION_LABEL[section.relation]}
              </div>
              {section.records.map((linked) => (
                <LinkedRow key={linked.recordId} linked={linked} onHop={onHop} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── REMARKS · MANUAL (only when a manual remark exists) ── */}
      {remark && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-shell)', paddingTop: '11px' }}>
          <div style={sectionLabelStyle}>REMARKS · MANUAL</div>
          <div
            data-testid="ops-record-remarks"
            style={{
              fontSize: '11px',
              lineHeight: 1.5,
              color: 'var(--text-shell-2)',
              border: '1px solid var(--border-shell)',
              borderRadius: '6px',
              padding: '9px 11px',
            }}
          >
            {remark}
          </div>
        </div>
      )}

      {/* ── + ADD REMARK ghost — INERT here (pin 4; C-5 wires it) ── */}
      <button
        type="button"
        data-testid="ops-record-add-remark"
        disabled
        title="Add remark — coming soon"
        style={{
          ...monoStyle,
          alignSelf: 'flex-start',
          fontSize: '10px',
          fontWeight: 500,
          letterSpacing: '0.5px',
          borderWidth: '1px',
          borderStyle: 'dashed',
          borderColor: 'var(--border-shell)',
          background: 'transparent',
          color: 'var(--text-shell-3)',
          borderRadius: '4px',
          padding: '5px 9px',
          cursor: 'not-allowed',
          opacity: 0.7,
        }}
      >
        + ADD REMARK
      </button>
    </>
  )
}

function KindChip({ kind }: { kind: RegistryKind }) {
  return (
    <span
      data-testid="ops-record-chip"
      style={{
        ...monoStyle,
        display: 'inline-block',
        marginTop: '4px',
        fontSize: '8.5px',
        fontWeight: 600,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        padding: '3px 6px',
        borderRadius: '4px',
        color: `var(--kind-${kind})`,
        background: `var(--kind-${kind}-bg)`,
      }}
    >
      {kind.toUpperCase()}
    </span>
  )
}

function AttrRow({ testid, label, value }: { testid: string; label: string; value: ReactNode }) {
  return (
    <div data-testid={testid} style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
      <span style={{ ...monoStyle, width: '76px', flexShrink: 0, fontSize: '9px', fontWeight: 600, letterSpacing: '1px', color: 'var(--text-shell-3)' }}>
        {label}
      </span>
      <span style={{ ...monoStyle, fontSize: '11px', color: 'var(--text-shell)', minWidth: 0, wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  )
}

function LinkedRow({ linked, onHop }: { linked: LinkedRecord; onHop: (recordId: string) => void }) {
  return (
    <button
      type="button"
      data-testid={`ops-record-linked-${linked.recordId}`}
      onClick={() => onHop(linked.recordId)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        textAlign: 'left',
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid transparent',
        background: 'var(--surface-shell-2)',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '13px' }}>
        {KIND_GLYPH[linked.kind]}
      </span>
      <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-shell)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {linked.name}
      </span>
      <span style={{ ...monoStyle, fontSize: '9px', fontWeight: 600, letterSpacing: '0.5px', color: 'var(--text-shell-3)' }}>
        {linked.kind.toUpperCase()}
      </span>
    </button>
  )
}
