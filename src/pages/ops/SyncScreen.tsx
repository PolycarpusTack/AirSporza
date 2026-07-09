/**
 * SYNC — import-pipeline health + merge-review anchor (D-1-T2; replaces the
 * A-2-T1 placeholder). Root testid ops-screen-sync KEPT (B-1 precedent).
 * Design: docs/design_handoff_planza_ops/Planza Redesign.dc.html §3a Sync review.
 * Contracts consumed (NO derivation here — anti-smart-ui; everything from the
 * selectors): sync-selectors v1.2 (deriveJobCard / pendingCandidateCount D-1-T1;
 * deriveMergeCard / deriveMergeDiff / MergeCard / ConfidenceBand D-2-T1),
 * useSyncData v1 (jobs + candidates + isSettled — this screen's PRIMARY data, incl.
 * the failure path), AppProvider useApp (events/sports/competitions — the CURRENT
 * side of the merge diff, resolved by bare-numeric-id string match).
 *
 * Loading: quiet skeleton until isSettled; a FAILED fetch also settles → the
 * (possibly empty) lists render honestly, never a hang (RegistryScreen precedent).
 *
 * Dot colour: the selector returns a semantic JobDotColor token; the COMPONENT
 * owns the token→CSS-var map (reusing the --status-approved / --alert-* VALUES as
 * colours — NOT hex, NOT a new token family). Same convention as RegistryScreen.
 *
 * Badge (pin 5): on settle the pending-candidate count publishes UP to the shell
 * tab bar via OpsTabBadgeContext (see opsTabBadges). It is NOT cleared on unmount —
 * the badge is persistent chrome (design). The count therefore populates on the
 * FIRST Sync visit; a shell-level pre-visit count fetch is deliberately avoided
 * (pin 5 "single source, no metrics() fan-out") — a cross-screen pre-visit badge
 * is an E-item.
 */
import { useEffect, type CSSProperties } from 'react'
import { useSyncData } from '../../components/ops/useSyncData'
import { useApp } from '../../context/AppProvider'
import { useSetTabBadge } from '../../components/ops/opsTabBadges'
import {
  deriveJobCard,
  deriveMergeCard,
  pendingCandidateCount,
  type ConfidenceBand,
  type JobDotColor,
  type MergeCard,
} from '../../components/ops/syncSelectors'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

/** Selector token → CSS var (component-owned; no hex, no new tokens). */
const DOT_COLOR: Record<JobDotColor, string> = {
  green: 'var(--status-approved)',
  red: 'var(--alert-danger)',
  amber: 'var(--alert-warning)',
  neutral: 'var(--text-shell-3)',
}

/** Confidence band token → CSS var (component-owned; no hex — same convention as DOT_COLOR). */
const BAND_COLOR: Record<ConfidenceBand, string> = {
  green: 'var(--status-approved)',
  amber: 'var(--alert-warning)',
}

const sectionLabelStyle: CSSProperties = {
  ...monoStyle,
  fontWeight: 600,
  fontSize: '11px',
  letterSpacing: '2px',
  color: 'var(--text-shell-2)',
}

const quietPanelStyle: CSSProperties = {
  ...monoStyle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '20vh',
  fontSize: '10.5px',
  fontWeight: 600,
  letterSpacing: '2px',
  color: 'var(--text-shell-3)',
}

const cellStyle: CSSProperties = { ...monoStyle, fontWeight: 500, fontSize: '11px' }
const diffGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: '10px', padding: '7px 12px' }

/**
 * Merge-review card (D-2-T1). Pure render of a MergeCard from the selector — no
 * derivation here (anti-smart-ui): the diff, band token, source code and incoming
 * name are all assembled in deriveMergeCard. The footer is INERT this task (D-3
 * wires the approve/keep handlers); APPROVE is disabled when there is no
 * suggestedEntityId (create-only — never a dead merge button). When the current
 * side is unresolved, the CURRENT column is omitted and a quiet note stands in.
 */
function MergeCardView({ card }: { card: MergeCard }) {
  const isCreateOnly = card.suggestedEntityId === null
  return (
    <div
      data-testid="ops-sync-merge-card"
      style={{
        maxWidth: '960px',
        background: 'var(--surface-shell-2)',
        border: '1px solid var(--border-shell)',
        borderRadius: '8px',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '11px',
      }}
    >
      {/* Header: kind chip · incoming → MATCHES → current · % MATCH (band) · VIA source */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span
          style={{
            ...monoStyle,
            fontWeight: 600,
            fontSize: '8.5px',
            letterSpacing: '1px',
            color: 'var(--text-shell-2)',
            background: 'var(--surface-shell)',
            padding: '2px 6px',
            borderRadius: '3px',
          }}
        >
          {card.kindLabel}
        </span>
        <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{card.incomingName}</span>
        <span style={{ ...monoStyle, fontWeight: 400, fontSize: '9.5px', color: 'var(--text-shell-3)' }}>→ MATCHES →</span>
        {card.isCurrentResolved ? (
          <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{card.currentName}</span>
        ) : (
          <span style={{ ...monoStyle, fontWeight: 500, fontSize: '9.5px', color: 'var(--text-shell-3)' }}>CURRENT NOT LOADED</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ ...monoStyle, fontWeight: 600, fontSize: '10px', color: BAND_COLOR[card.band] }}>{card.confidencePercent}% MATCH</span>
        <span style={{ ...monoStyle, fontWeight: 500, fontSize: '9.5px', color: 'var(--text-shell-3)' }}>VIA {card.sourceCode}</span>
      </div>

      {/* Diff table — only when the current side resolved. */}
      {card.isCurrentResolved && (
        <div style={{ border: '1px solid var(--border-shell)', borderRadius: '6px', overflow: 'hidden' }}>
          <div
            style={{
              ...diffGridStyle,
              background: 'var(--surface-shell)',
              ...monoStyle,
              fontWeight: 600,
              fontSize: '8.5px',
              color: 'var(--text-shell-3)',
              letterSpacing: '1.5px',
            }}
          >
            <span>FIELD</span>
            <span>INCOMING</span>
            <span>CURRENT</span>
          </div>
          {card.diffRows.map((row) => (
            <div key={row.field} data-testid="ops-sync-diff-row" style={{ ...diffGridStyle, borderTop: '1px solid var(--border-shell)' }}>
              <span style={{ ...monoStyle, fontWeight: 600, fontSize: '9px', color: 'var(--text-shell-3)', letterSpacing: '1px' }}>{row.field}</span>
              <span style={{ ...cellStyle, color: row.isChanged ? 'var(--alert-warning)' : 'var(--text-shell)' }}>{row.incoming}</span>
              <span style={{ ...cellStyle, color: 'var(--text-shell-2)' }}>{row.current}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer — INERT this task (D-3 wires handlers). APPROVE create-gated. */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          data-testid="ops-sync-keep"
          style={{
            ...monoStyle,
            border: '1px solid var(--border-shell)',
            background: 'transparent',
            color: 'var(--text-shell-2)',
            borderRadius: '4px',
            padding: '7px 14px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '10px',
            letterSpacing: '1px',
          }}
        >
          KEEP SEPARATE
        </button>
        <button
          type="button"
          data-testid="ops-sync-approve"
          disabled={isCreateOnly}
          title={isCreateOnly ? 'No matching record — this candidate can only create a new record' : undefined}
          style={{
            ...monoStyle,
            border: 'none',
            background: 'var(--accent-shell)',
            color: 'var(--accent-shell-fg)',
            borderRadius: '4px',
            padding: '7px 16px',
            cursor: isCreateOnly ? 'not-allowed' : 'pointer',
            opacity: isCreateOnly ? 0.5 : 1,
            fontWeight: 600,
            fontSize: '10px',
            letterSpacing: '1px',
          }}
        >
          APPROVE MERGE
        </button>
      </div>
    </div>
  )
}

export function SyncScreen() {
  const { jobs, candidates, isSettled } = useSyncData()
  const { events, sports, competitions } = useApp()
  const setTabBadge = useSetTabBadge()

  // pin 5: publish the pending count up to the shell chrome. NOT cleared on
  // unmount — the badge persists in the chrome after navigating away (design).
  const pendingCount = pendingCandidateCount(candidates)
  useEffect(() => {
    setTabBadge('sync', pendingCount > 0 ? pendingCount : undefined)
  }, [pendingCount, setTabBadge])

  return (
    <div
      data-testid="ops-screen-sync"
      style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 'calc(100vh - 48px)' }}
    >
      {!isSettled ? (
        // sync is this screen's PRIMARY data — no empty-flash before settle. A
        // FAILED fetch still settles → renders honestly, never hangs.
        <div data-testid="ops-sync-loading" style={quietPanelStyle}>
          LOADING SYNC
        </div>
      ) : (
        <>
          <div style={sectionLabelStyle}>NIGHTLY SYNC · 02:00 CET</div>

          {jobs.length === 0 ? (
            <div data-testid="ops-sync-empty" style={quietPanelStyle}>
              NO RECENT SYNC JOBS
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
              {jobs.map((job) => {
                const card = deriveJobCard(job)
                return (
                  <div
                    key={card.id}
                    data-testid="ops-sync-job"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      background: 'var(--surface-shell-2)',
                      border: '1px solid var(--border-shell)',
                      borderRadius: '6px',
                      padding: '11px 13px',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ width: '8px', height: '8px', borderRadius: '50%', background: DOT_COLOR[card.dotColor], flex: 'none' }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{ ...monoStyle, fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {card.sourceName}
                      </div>
                      <div style={{ ...monoStyle, fontWeight: 400, fontSize: '10px', color: 'var(--text-shell-3)', marginTop: '3px' }}>
                        {card.statusLine}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ ...sectionLabelStyle, marginTop: '6px' }}>MERGE REVIEW · DEDUPLICATION CANDIDATES</div>

          {/* D-2-T1: one Merge Card per candidate. The CURRENT side is resolved
              from AppProvider by bare-numeric-id string match (DeduplicationService
              emits `String(eventId)`); an unloaded / null suggestion → null →
              incoming-only card (never a crash). Empty note kept for zero pending. */}
          <div data-testid="ops-sync-merge-review" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pendingCount === 0 ? (
              <div style={quietPanelStyle}>NO PENDING CANDIDATES</div>
            ) : (
              candidates.map((candidate) => {
                const currentEvent =
                  candidate.suggestedEntityId != null
                    ? events.find((e) => String(e.id) === candidate.suggestedEntityId) ?? null
                    : null
                return <MergeCardView key={candidate.id} card={deriveMergeCard(candidate, currentEvent, sports, competitions)} />
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
