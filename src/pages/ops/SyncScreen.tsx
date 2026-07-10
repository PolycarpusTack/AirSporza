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
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSyncData } from '../../components/ops/useSyncData'
import { useApp } from '../../context/AppProvider'
import { useSetTabBadge } from '../../components/ops/opsTabBadges'
import { importsApi } from '../../services'
import { ApiError } from '../../utils/api'
import {
  deriveJobCard,
  deriveMergeCard,
  pendingCandidateCount,
  type ConfidenceBand,
  type JobDotColor,
  type MergeCard,
} from '../../components/ops/syncSelectors'

/** Terminal decision outcome for a reviewed candidate (D-3-T1). */
type DecisionKind = 'merged' | 'kept'

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
 * Merge-review card (D-2-T1 render; D-3-T1 decision wiring). Pure render of a
 * MergeCard from the selector — no derivation here (anti-smart-ui): the diff, band
 * token, source code and incoming name are all assembled in deriveMergeCard.
 *
 * Decision write path (D-3-T1, this initiative's 2nd write surface — IRREVERSIBLE):
 * - SINGLE-FLIGHT (registry-create v1 precedent): a per-card `isSubmittingRef`
 *   SYNCHRONOUS latch drops a 2nd intent (double-click / Enter+click) BEFORE React
 *   re-renders the disabled buttons — exactly one request per intent.
 * - `decidedAs` set → the footer buttons are REPLACED by a terminal mono status
 *   line (no live buttons remain — not re-decidable in-view; the parent owns the
 *   decided map). Success keeps the card mounted; the terminal render is driven by
 *   the parent re-render, so `submitting` is intentionally NOT reset on success.
 * - On rejection (incl. the 409 "already decided" — human-readable): a quiet inline
 *   error renders, both buttons re-enable, AND the latch is RELEASED so a
 *   user-initiated retry is possible (still single-flight).
 * - APPROVE stays create-gated on `suggestedEntityId` (create-only when null).
 */
function MergeCardView({
  card,
  decidedAs,
  onDecide,
}: {
  card: MergeCard
  decidedAs?: DecisionKind
  onDecide: (kind: DecisionKind) => Promise<void>
}) {
  const isCreateOnly = card.suggestedEntityId === null
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous single-flight latch — set before React re-renders the disabled buttons.
  const isSubmittingRef = useRef(false)

  const decide = async (kind: DecisionKind) => {
    if (isSubmittingRef.current) return // single-flight: drop the 2nd intent
    isSubmittingRef.current = true
    setIsSubmitting(true)
    setError(null)
    try {
      await onDecide(kind)
      // success → parent sets `decided` → this card re-renders terminal (buttons gone).
      // deliberately leave `isSubmitting` true — no re-enable flash before the swap.
    } catch (caught) {
      // release the latch so a user-initiated retry is possible (still single-flight).
      isSubmittingRef.current = false
      setIsSubmitting(false)
      setError(
        caught instanceof ApiError && caught.message ? caught.message : 'Could not save your decision. Please try again.',
      )
    }
  }

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

      {/* Footer. Terminal status line REPLACES the buttons once decided (D-3-T1);
          otherwise the create-gated APPROVE + KEEP, with an inline error on rejection. */}
      {decidedAs ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span
            data-testid="ops-sync-decision-status"
            style={{
              ...monoStyle,
              fontWeight: 600,
              fontSize: '10px',
              letterSpacing: '1px',
              color: decidedAs === 'merged' ? 'var(--status-approved)' : 'var(--text-shell-2)',
            }}
          >
            {decidedAs === 'merged' ? '✓ MERGED INTO REGISTRY' : 'KEPT AS SEPARATE RECORDS'}
          </span>
        </div>
      ) : (
        <>
          {error && (
            <div
              data-testid="ops-sync-decision-error"
              style={{ ...monoStyle, fontSize: '10px', fontWeight: 500, textAlign: 'right', color: 'var(--alert-danger)' }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              data-testid="ops-sync-keep"
              onClick={() => decide('kept')}
              disabled={isSubmitting}
              style={{
                ...monoStyle,
                border: '1px solid var(--border-shell)',
                background: 'transparent',
                color: 'var(--text-shell-2)',
                borderRadius: '4px',
                padding: '7px 14px',
                cursor: isSubmitting ? 'progress' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
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
              onClick={() => decide('merged')}
              disabled={isCreateOnly || isSubmitting}
              title={isCreateOnly ? 'No matching record — this candidate can only create a new record' : undefined}
              style={{
                ...monoStyle,
                border: 'none',
                background: 'var(--accent-shell)',
                color: 'var(--accent-shell-fg)',
                borderRadius: '4px',
                padding: '7px 16px',
                cursor: isCreateOnly || isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isCreateOnly || isSubmitting ? 0.5 : 1,
                fontWeight: 600,
                fontSize: '10px',
                letterSpacing: '1px',
              }}
            >
              APPROVE MERGE
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function SyncScreen() {
  const { jobs, candidates, isSettled } = useSyncData()
  const { events, sports, competitions } = useApp()
  const setTabBadge = useSetTabBadge()

  // D-3-T1: locally-tracked terminal decisions — the source of truth for what has
  // been reviewed in-view (no refetch; useSyncData.refresh is OPTIONAL background
  // reconcile, deliberately not auto-wired — C-5 no-socket precedent).
  const [decided, setDecided] = useState<Record<string, DecisionKind>>({})

  // pin 5: publish the pending count up to the shell chrome. NOT cleared on
  // unmount — the badge persists in the chrome after navigating away (design).
  // D-3-T1: the badge EXCLUDES decided candidates (decrements as `decided` grows)
  // without changing pendingCandidateCount's selector contract.
  const pendingCount = pendingCandidateCount(candidates)
  const undecidedPendingCount = candidates.filter(
    (candidate) => candidate.status === 'pending' && !decided[candidate.id],
  ).length
  useEffect(() => {
    setTabBadge('sync', undecidedPendingCount > 0 ? undecidedPendingCount : undefined)
  }, [undecidedPendingCount, setTabBadge])

  // Fire the right write per decision; on success record the terminal outcome (the
  // card renders terminal). A rejection propagates to the card (inline error + latch release).
  const decideCandidate = (candidate: (typeof candidates)[number]) => async (kind: DecisionKind) => {
    if (kind === 'merged') {
      await importsApi.approveMergeCandidate(candidate.id, candidate.suggestedEntityId)
    } else {
      await importsApi.createMergeCandidateEntity(candidate.id)
    }
    setDecided((prev) => ({ ...prev, [candidate.id]: kind }))
  }

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
                    ? events.find((event) => String(event.id) === candidate.suggestedEntityId) ?? null
                    : null
                return (
                  <MergeCardView
                    key={candidate.id}
                    card={deriveMergeCard(candidate, currentEvent, sports, competitions)}
                    decidedAs={decided[candidate.id]}
                    onDecide={decideCandidate(candidate)}
                  />
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
