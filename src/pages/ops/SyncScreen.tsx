/**
 * SYNC — import-pipeline health + merge-review anchor (D-1-T2; replaces the
 * A-2-T1 placeholder). Root testid ops-screen-sync KEPT (B-1 precedent).
 * Design: docs/design_handoff_planza_ops/Planza Redesign.dc.html §3a Sync review.
 * Contracts consumed (NO derivation here — anti-smart-ui; everything from the
 * selectors): sync-selectors v1 (deriveJobCard / pendingCandidateCount / JobCard /
 * JobDotColor — D-1-T1), useSyncData v1 (jobs + candidates + isSettled — this
 * screen's PRIMARY data, incl. the failure path).
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
import { useSetTabBadge } from '../../components/ops/opsTabBadges'
import { deriveJobCard, pendingCandidateCount, type JobDotColor } from '../../components/ops/syncSelectors'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

/** Selector token → CSS var (component-owned; no hex, no new tokens). */
const DOT_COLOR: Record<JobDotColor, string> = {
  green: 'var(--status-approved)',
  red: 'var(--alert-danger)',
  amber: 'var(--alert-warning)',
  neutral: 'var(--text-shell-3)',
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

export function SyncScreen() {
  const { jobs, candidates, isSettled } = useSyncData()
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

          {/* D-2 fills this with candidate cards. For D-1 a quiet note only — a
              present anchor so D-2 has a stable mount point (no cards here). */}
          <div data-testid="ops-sync-merge-review">
            {pendingCount === 0 && <div style={quietPanelStyle}>NO PENDING CANDIDATES</div>}
          </div>
        </>
      )}
    </div>
  )
}
