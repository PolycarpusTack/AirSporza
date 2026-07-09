/**
 * RIGHTS — contract-health stat tiles + competitions × platforms matrix
 * (B-3-T2; replaces the A-2-T1 placeholder).
 * Design: docs/design_handoff_planza_ops/README.md §3 RIGHTS + design HTML.
 * Contracts consumed: ops-selectors v3 (ALL derivation — matrix, tiles,
 * validity progress/band; status words are DERIVED only), useContracts v1
 * (pin 7 loading), ops-tokens v3 (rights word aliases; band colors reuse the
 * same alias family — red→--rights-missing, amber→--rights-expiring,
 * green→--rights-valid, matching the design's fixed colors).
 *
 * Pins owned here (Story B-3 re-gate 2026-07-04):
 *   pin 7 — quiet skeleton until the contracts fetch SETTLES (contracts are
 *           this screen's PRIMARY data; the everything-MISSING flash is not
 *           acceptable). A FAILED fetch also settles the skeleton away (useContracts v1).
 *   pin 9 — root testid ops-screen-rights (OpsShell contract).
 * Bar rule (recorded, design HTML `showBar: c.pct > 0`): the 3px bar renders
 * iff validityProgress !== null && > 0 — lapsed (0) and date-less rows hide
 * it; a DATED draft consequently shows its term bar under 'In negotiation'
 * (data-driven; the demo's draft simply had no dates).
 * NO CONTRACT display variant (glossary): word = 'NO CONTRACT' iff
 * validityLabel === 'No agreement in place' (the selector's pinned
 * no-agreement discriminant); lapsed MISSING keeps the word MISSING.
 * No ?day/?event on this screen (?record is EPIC C Registry scope).
 */
import { useMemo, type CSSProperties } from 'react'
import { useApp } from '../../context/AppProvider'
import { useContracts } from '../../components/ops/useContracts'
import {
  deriveRightsMatrix,
  deriveRightsTiles,
  deriveValidityBand,
  type RightsMatrixRow,
  type RightsPlatformColumn,
  type RightsStatus,
} from '../../components/ops/selectors'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

const MATRIX_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '260px repeat(4, 90px) 130px 1fr',
  gap: '10px',
  alignItems: 'center',
}

const RIGHTS_COLOR: Record<RightsStatus, string> = {
  VALID: 'var(--rights-valid)',
  EXPIRING: 'var(--rights-expiring)',
  NEGOTIATION: 'var(--rights-negotiation)',
  MISSING: 'var(--rights-missing)',
}

/** Band → bar color. Same alias family as the words (design: #E5484D/#E5A13C/#2BB673). */
const BAND_COLOR: Record<ReturnType<typeof deriveValidityBand>, string> = {
  red: 'var(--rights-missing)',
  amber: 'var(--rights-expiring)',
  green: 'var(--rights-valid)',
}

const TILE_DEFS: { status: RightsStatus; label: string }[] = [
  { status: 'VALID', label: 'VALID CONTRACTS' },
  { status: 'EXPIRING', label: 'EXPIRING SOON' },
  { status: 'NEGOTIATION', label: 'IN NEGOTIATION' },
  { status: 'MISSING', label: 'MISSING RIGHTS' },
]

const PLATFORM_COLUMNS: RightsPlatformColumn[] = ['LINEAR', 'MAX', 'RADIO', 'ONDEM']
const PLATFORM_HEADERS: Record<RightsPlatformColumn, string> = {
  LINEAR: 'LINEAR',
  MAX: 'MAX',
  RADIO: 'RADIO',
  ONDEM: 'ON-DEM',
}

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

export interface RightsScreenProps {
  /** Testability seam — the ONLY impure edge (pin 6); tests pass a fixed clock. */
  now?: Date
}

export function RightsScreen({ now = new Date() }: RightsScreenProps) {
  const { events, competitions, sports } = useApp()
  const { contracts, isSettled } = useContracts()

  const rows = useMemo(
    () => deriveRightsMatrix(contracts, competitions, events, now),
    [contracts, competitions, events, now],
  )
  const tiles = useMemo(
    () => deriveRightsTiles(contracts, competitions, events, now),
    [contracts, competitions, events, now],
  )
  const sportById = useMemo(() => new Map(sports.map((s) => [s.id, s])), [sports])

  return (
    <div
      data-testid="ops-screen-rights"
      style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 'calc(100vh - 48px)' }}
    >
      {!isSettled ? (
        // pin 7: contracts are this screen's PRIMARY data — no everything-MISSING flash.
        <div data-testid="ops-rights-loading" style={quietPanelStyle}>
          LOADING CONTRACTS
        </div>
      ) : (
        <>
          {/* ── 4 stat tiles (fold over the matrix — reconciliation by construction) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {TILE_DEFS.map(({ status, label }) => (
              <div
                key={status}
                data-testid={`ops-rights-tile-${status}`}
                style={{
                  background: 'var(--surface-shell)',
                  border: '1px solid var(--border-shell)',
                  borderRadius: '6px',
                  padding: '12px 14px',
                }}
              >
                <div
                  data-testid="ops-rights-tile-count"
                  style={{ ...monoStyle, fontSize: '24px', fontWeight: 700, color: RIGHTS_COLOR[status] }}
                >
                  {tiles[status]}
                </div>
                <div
                  style={{ ...monoStyle, fontSize: '9.5px', fontWeight: 500, letterSpacing: '1.5px', color: 'var(--text-shell-2)', marginTop: '3px' }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* ── Rights matrix ── */}
          <div>
            <div style={{ ...monoStyle, fontSize: '11px', fontWeight: 600, letterSpacing: '2px', color: 'var(--text-shell-2)', marginBottom: '14px' }}>
              RIGHTS MATRIX
            </div>
            <div
              style={{
                ...MATRIX_GRID,
                ...monoStyle,
                padding: '0 12px 8px',
                fontSize: '9px',
                fontWeight: 600,
                letterSpacing: '1.5px',
                color: 'var(--text-shell-3)',
                borderBottom: '1px solid var(--border-shell)',
              }}
            >
              <span>COMPETITION</span>
              {PLATFORM_COLUMNS.map((column) => (
                <span key={column} style={{ textAlign: 'center' }}>
                  {PLATFORM_HEADERS[column]}
                </span>
              ))}
              <span>STATUS</span>
              <span>VALIDITY</span>
            </div>

            {rows.length === 0 ? (
              <div data-testid="ops-rights-empty" style={quietPanelStyle}>
                NO COMPETITIONS IN SCOPE
              </div>
            ) : (
              rows.map((matrixRow) => (
                <MatrixRow
                  key={matrixRow.competitionId}
                  row={matrixRow}
                  sportIcon={sportById.get(matrixRow.competition?.sportId ?? -1)?.icon ?? '🏆'}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MatrixRow({ row, sportIcon }: { row: RightsMatrixRow; sportIcon: string }) {
  // NO CONTRACT display variant (glossary) — see header.
  const statusWord = row.validityLabel === 'No agreement in place' ? 'NO CONTRACT' : row.status
  // Bar rule (recorded): render iff progress is a POSITIVE fraction.
  const shouldShowBar = row.validityProgress !== null && row.validityProgress > 0

  return (
    <div
      data-testid={`ops-rights-row-${row.competitionId}`}
      data-competition-id={String(row.competitionId)}
      data-status={row.status}
      style={{ ...MATRIX_GRID, padding: '11px 12px', borderBottom: '1px solid var(--border-shell)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span aria-hidden="true">{sportIcon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-shell)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.competitionName}
          </div>
          {row.note && (
            <div style={{ fontSize: '10px', color: 'var(--text-shell-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.note}
            </div>
          )}
        </div>
      </div>

      {PLATFORM_COLUMNS.map((column) => {
        const hasRight = row.platformColumns[column]
        return (
          <span
            key={column}
            data-testid={`ops-rights-cell-${column}`}
            style={{
              ...monoStyle,
              textAlign: 'center',
              fontSize: '13px',
              fontWeight: 600,
              color: hasRight ? 'var(--accent-shell)' : 'var(--text-shell-3)',
            }}
          >
            {hasRight ? '●' : '·'}
          </span>
        )
      })}

      <span
        data-testid="ops-rights-status"
        style={{ ...monoStyle, fontSize: '10.5px', fontWeight: 500, color: RIGHTS_COLOR[row.status] }}
      >
        {statusWord}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ ...monoStyle, fontSize: '10.5px', fontWeight: 500, color: 'var(--text-shell-2)', flex: 'none' }}>
          {row.validityLabel}
        </span>
        {shouldShowBar && (
          <div
            style={{
              height: '3px',
              background: 'var(--surface-shell-2)',
              borderRadius: '99px',
              overflow: 'hidden',
              flex: 1,
              maxWidth: '160px',
            }}
          >
            <div
              data-testid="ops-rights-bar"
              style={{
                height: '100%',
                width: `${row.validityProgress! * 100}%`, // fraction → CSS %
                backgroundColor: BAND_COLOR[deriveValidityBand(row.validityProgress!)],
                borderRadius: '99px',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
