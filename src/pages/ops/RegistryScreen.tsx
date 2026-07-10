/**
 * REGISTRY — sports CMS: toolbar + facet rail + record table with ?record
 * selection (C-2-T2; replaces the A-2-T1 placeholder).
 * Design: docs/design_handoff_planza_ops/README.md §4 REGISTRY + Story C-2 AC.
 * Contracts consumed (NO derivation here — anti-smart-ui; everything from the
 * selectors): registry-selectors v1 (buildRegistryIndex / projectRegistryRows /
 * registryFacetCounts / registryToolbarCounts), useRegistryData v1 (isSettled —
 * this screen's PRIMARY data, incl. the failure path), ops-selection v2
 * (useOpsRecord → ?record), ops-tokens v3 (--kind-* chip aliases).
 *
 * Pins owned here (Story C-2):
 *   pin 2 — `+ NEW` opens the create modal (C-4-T1 wired it; the C-2 inert state is superseded).
 *   pin 3 — root testid ops-screen-registry (replaces the OpsShell placeholder).
 *   pin 4 — search/facet state is COMPONENT-LOCAL; only ?record is URL-backed.
 *   pin 5 — counters read `N PLAYERS` (the design's `12 PEOPLE` assumed person
 *           Kinds that don't exist under AS-5 — display-honesty deviation).
 * Loading: quiet skeleton until isSettled; a FAILED fetch also settles → the
 * (possibly empty) universe renders honestly, never a hang (RightsScreen pin 7).
 * Grid: the BACKLOG grid `minmax(220px,1fr) …` — the README's `1fr` shorthand
 * loses the NAME min-width.
 * STATUS color: the selector returns a semantic RegistryStatusColor token; the
 * COMPONENT owns the token→CSS-var map (reusing the --status-approved /
 * --alert-warning VALUES as colors — NOT adding to the --status-* family). A
 * dedicated --registry-* family, if ever wanted, is an E-2 designer note (text
 * debt candidate) — not added now.
 */
import { memo, useCallback, useMemo, useRef, useState, type CSSProperties } from 'react'
import { computeVisibleWindow } from './registryWindow'
import { useRegistryData } from '../../components/ops/useRegistryData'
import { useLinkedRecords } from '../../components/ops/useLinkedRecords'
import { RecordInspector } from '../../components/ops/RecordInspector'
import { RegistryCreateModal } from '../../components/ops/RegistryCreateModal'
import { useOpsRecord } from '../../components/ops/opsUrlState'
import { getRowActivationProps } from '../../components/ops/rowActivation'
import { playersApi, teamsApi } from '../../services'
import {
  buildRegistryIndex,
  makeRecordId,
  projectRegistryRows,
  registryFacetCounts,
  registryToolbarCounts,
  type RegistryFacet,
  type RegistryFacetCounts,
  type RegistryKind,
  type RegistryRecord,
  type RegistryRow,
  type RegistryStatusColor,
  type RegistryToolbarCounts,
} from '../../components/ops/registrySelectors'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

/**
 * E-1 remediation (EPIC E · HARDENING · FEATURE) — row windowing constants.
 * The registry rows are single-line, so a UNIFORM row height is exact enough for
 * the offset math (registryWindow.ts). Measured current row ≈ 44px (11px padding
 * top+bottom + a ~21px 12.5px line + 1px bottom border). If the row ever becomes
 * multi-line this must switch to a measured height.
 */
const ROW_HEIGHT = 44
const WINDOW_OVERSCAN = 8

/** BACKLOG grid (keeps the NAME min-width the README's `1fr` shorthand drops). */
const TABLE_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px,1fr) 110px 110px 150px 84px 78px',
  gap: '10px',
  alignItems: 'center',
}

/** Selector token → CSS var (component-owned; no hex, no new tokens). */
const STATUS_COLOR: Record<RegistryStatusColor, string> = {
  green: 'var(--status-approved)',
  amber: 'var(--alert-warning)',
  neutral: 'var(--text-shell-3)',
}

const FACET_DEFS: { facet: RegistryFacet; label: string; countKey: keyof RegistryFacetCounts }[] = [
  { facet: 'all', label: 'All records', countKey: 'all' },
  { facet: 'sport', label: 'Sports', countKey: 'sport' },
  { facet: 'competition', label: 'Competitions', countKey: 'competition' },
  { facet: 'team', label: 'Teams', countKey: 'team' },
  { facet: 'player', label: 'Players', countKey: 'player' },
]

/** pin 5: `N PLAYERS`, never the design's `12 PEOPLE` (AS-5 — no person Kinds). */
const COUNTER_DEFS: { key: keyof RegistryToolbarCounts; label: string }[] = [
  { key: 'sports', label: 'SPORTS' },
  { key: 'competitions', label: 'COMPETITIONS' },
  { key: 'teams', label: 'TEAMS' },
  { key: 'players', label: 'PLAYERS' },
]

const COLUMN_HEADERS = ['NAME', 'TYPE', 'SPORT', 'LINKED', 'SOURCE', 'STATUS']

const quietPanelStyle: CSSProperties = {
  ...monoStyle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '40vh',
  fontSize: '10.5px',
  fontWeight: 600,
  letterSpacing: '2px',
  color: 'var(--text-shell-3)',
}

export function RegistryScreen() {
  const { sports, competitions, teams, players, isSettled, refresh } = useRegistryData()
  const { recordId, setRecordId } = useOpsRecord()

  // component-local search/facet (pin 4) — only ?record is URL-backed.
  const [query, setQuery] = useState('')
  const [facet, setFacet] = useState<RegistryFacet>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const index = useMemo(
    () => buildRegistryIndex(sports, competitions, teams, players),
    [sports, competitions, teams, players],
  )
  const rows = useMemo(() => projectRegistryRows(index, { query, facet }), [index, query, facet])
  const facetCounts = useMemo(() => registryFacetCounts(index), [index]) // ALWAYS unfiltered
  const counters = useMemo(() => registryToolbarCounts(index), [index])

  // E-1 #7 — STABLE selection handler so React.memo can skip unchanged rows. In
  // react-router v7 `setRecordId` is NOT referentially stable (its setSearchParams
  // closes over the current location.search), so a `useCallback([setRecordId])`
  // wrapper would still change on every selection and re-render the whole list. A
  // latest-ref indirection gives a callback that is stable for the component's life
  // yet always invokes the current setter. Rows are useMemo'd (identical refs on a
  // selection change), so only the 2 rows whose `selected` flips re-render.
  const setRecordIdRef = useRef(setRecordId)
  setRecordIdRef.current = setRecordId
  const handleSelectRow = useCallback((id: string) => setRecordIdRef.current(id), [])

  // E-1 #5 — windowing state. `viewportHeight` defaults to 0 → the render-all
  // fallback (jsdom/pre-measure/SSR); a positive height measured in a real browser
  // engages windowing. `measureRef` is a stable callback ref that reads clientHeight
  // on attach and observes resizes (where ResizeObserver exists).
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = null
    if (!el) return
    setViewportHeight(el.clientHeight)
    if (typeof ResizeObserver === 'undefined') return // jsdom / SSR — keep render-all
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    observer.observe(el)
    resizeObserverRef.current = observer
  }, [])

  // Deep-link hydration is automatic: recordId (URL) → index.byId → record;
  // unknown/malformed id → null → inspector empty state (no crash). Hops REPLACE.
  const selectedRecord = recordId ? index.byId.get(recordId) ?? null : null
  const { sections } = useLinkedRecords(selectedRecord, index)

  // Post-create (pin 4): refresh from the server (provenance/LINKED come from the
  // fresh row — NO optimistic append), clear filters, select the new record, close.
  const handleCreated = async (kind: RegistryKind, id: number) => {
    await refresh()
    setQuery('')
    setFacet('all')
    setRecordId(makeRecordId(kind, id))
    setCreateOpen(false)
  }

  // Remark save (C-5-T1) — team/player only (the inspector's ghost is kind-gated).
  // A thrown saveNotes/refresh propagates to the inspector's SAVE handler (editor
  // stays open + error). Refresh re-derives record.notes → REMARKS box + label update.
  const handleSaveRemark = async (record: RegistryRecord, remarkText: string) => {
    const notesApi = record.kind === 'team' ? teamsApi : playersApi
    await notesApi.saveNotes(record.dbId, remarkText)
    await refresh()
  }

  return (
    <div
      data-testid="ops-screen-registry"
      style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 'calc(100vh - 48px)' }}
    >
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <input
          data-testid="ops-registry-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search records…"
          style={{
            ...monoStyle,
            width: '280px',
            fontSize: '11px',
            padding: '8px 12px',
            background: 'var(--surface-shell-2)',
            border: '1px solid var(--border-shell)',
            borderRadius: '6px',
            color: 'var(--text-shell)',
          }}
        />
        <div
          data-testid="ops-registry-counters"
          style={{ ...monoStyle, fontSize: '10.5px', fontWeight: 500, letterSpacing: '1px', color: 'var(--text-shell-3)' }}
        >
          {COUNTER_DEFS.map(({ key, label }) => `${counters[key]} ${label}`).join(' · ')}
        </div>
        <button
          type="button"
          data-testid="ops-registry-new"
          onClick={() => setCreateOpen(true)} // C-4-T1 — opens the create modal
          style={{
            ...monoStyle,
            marginLeft: 'auto',
            fontSize: '10.5px',
            fontWeight: 600,
            letterSpacing: '1px',
            padding: '8px 14px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--accent-shell)',
            color: 'var(--accent-shell-fg)',
            cursor: 'pointer',
          }}
        >
          + NEW
        </button>
      </div>

      {!isSettled ? (
        // registry is this screen's PRIMARY data — no empty-flash before settle.
        <div data-testid="ops-registry-loading" style={quietPanelStyle}>
          LOADING REGISTRY
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 320px', gap: '16px', alignItems: 'start' }}>
          {/* ── Left facet rail ── */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ ...monoStyle, fontSize: '9px', fontWeight: 600, letterSpacing: '1.5px', color: 'var(--text-shell-3)', padding: '0 10px 6px' }}>
              BROWSE
            </div>
            {FACET_DEFS.map(({ facet: facetOption, label, countKey }) => {
              const isActive = facet === facetOption
              return (
                <button
                  type="button"
                  key={facetOption}
                  data-testid={`ops-registry-facet-${facetOption}`}
                  onClick={() => setFacet(facetOption)}
                  style={{
                    ...monoStyle,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '11px',
                    fontWeight: isActive ? 600 : 500,
                    textAlign: 'left',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: isActive ? '1px solid var(--accent-shell)' : '1px solid transparent',
                    background: isActive ? 'var(--surface-shell-2)' : 'transparent',
                    color: isActive ? 'var(--text-shell)' : 'var(--text-shell-2)',
                    cursor: 'pointer',
                  }}
                >
                  <span>{label}</span>
                  <span style={{ color: 'var(--text-shell-3)' }}>{facetCounts[countKey]}</span>
                </button>
              )
            })}
          </nav>

          {/* ── Center table ── */}
          <div>
            <div
              style={{
                ...TABLE_GRID,
                ...monoStyle,
                position: 'sticky',
                top: 0,
                padding: '0 12px 8px',
                fontSize: '9px',
                fontWeight: 600,
                letterSpacing: '1.5px',
                color: 'var(--text-shell-3)',
                background: 'var(--surface-shell)',
                borderBottom: '1px solid var(--border-shell)',
              }}
            >
              {COLUMN_HEADERS.map((header) => (
                <span key={header}>{header}</span>
              ))}
            </div>

            {rows.length === 0 ? (
              <div data-testid="ops-registry-empty" style={quietPanelStyle}>
                NO MATCHING RECORDS
              </div>
            ) : (
              (() => {
                const total = rows.length
                const { start, end } = computeVisibleWindow(scrollTop, viewportHeight, ROW_HEIGHT, total, WINDOW_OVERSCAN)
                const topSpacer = start * ROW_HEIGHT
                const bottomSpacer = (total - end) * ROW_HEIGHT
                return (
                  <div
                    ref={measureRef}
                    data-testid="ops-registry-scroll"
                    onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                    style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}
                  >
                    {topSpacer > 0 && <div aria-hidden style={{ height: `${topSpacer}px` }} />}
                    {rows.slice(start, end).map((row) => (
                      <RegistryTableRow
                        key={row.id}
                        row={row}
                        selected={recordId === row.id}
                        onSelect={handleSelectRow}
                      />
                    ))}
                    {bottomSpacer > 0 && <div aria-hidden style={{ height: `${bottomSpacer}px` }} />}
                  </div>
                )
              })()
            )}
          </div>

          {/* ── Right inspector (C-3-T1) — onHop REPLACEs ?record (ops-selection rule 7) ── */}
          <RecordInspector
            record={selectedRecord}
            linkedSections={sections}
            onHop={setRecordId}
            onSaveRemark={handleSaveRemark}
          />
        </div>
      )}

      {/* ── Create modal (C-4-T1, first write path) ── */}
      {createOpen && (
        <RegistryCreateModal sports={sports} onCancel={() => setCreateOpen(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}

// E-1 #7 — memoized so a selection change re-renders ONLY the rows whose `selected`
// boolean flips (row objects are useMemo'd; `onSelect` is the stable handleSelectRow).
const RegistryTableRow = memo(function RegistryTableRow({
  row,
  selected,
  onSelect,
}: {
  row: RegistryRow
  selected: boolean
  onSelect: (id: string) => void
}) {
  const activate = () => onSelect(row.id)
  return (
    <div
      data-testid={`ops-registry-row-${row.id}`}
      data-kind={row.kind}
      {...getRowActivationProps(activate)}
      onClick={activate}
      style={{
        ...TABLE_GRID,
        padding: '11px 12px',
        borderBottom: '1px solid var(--border-shell)',
        cursor: 'pointer',
        background: selected ? 'var(--surface-shell-2)' : 'transparent',
        boxShadow: selected ? 'inset 2px 0 0 var(--accent-shell)' : 'none',
      }}
    >
      {/* NAME */}
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-shell)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {row.name}
      </span>

      {/* TYPE — kind chip */}
      <span>
        <span
          data-testid="ops-registry-chip"
          style={{
            ...monoStyle,
            fontSize: '8.5px',
            fontWeight: 600,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            padding: '3px 6px',
            borderRadius: '4px',
            color: `var(--kind-${row.kind})`,
            background: `var(--kind-${row.kind}-bg)`,
          }}
        >
          {row.kind.toUpperCase()}
        </span>
      </span>

      {/* SPORT */}
      <span style={{ fontSize: '11px', color: 'var(--text-shell-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {row.sportLabel}
      </span>

      {/* LINKED */}
      <span style={{ fontSize: '11px', color: 'var(--text-shell-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {row.linkedSummary}
      </span>

      {/* SOURCE */}
      <span
        data-testid="ops-registry-source"
        style={{ ...monoStyle, fontSize: '10px', fontWeight: 500, color: 'var(--text-shell-3)' }}
      >
        {row.source}
      </span>

      {/* STATUS */}
      <span
        data-testid="ops-registry-status"
        style={{ ...monoStyle, fontSize: '10px', fontWeight: 600, color: STATUS_COLOR[row.status.color] }}
      >
        {row.status.word}
      </span>
    </div>
  )
})
