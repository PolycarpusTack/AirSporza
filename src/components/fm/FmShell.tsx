/**
 * FmShell — the Planza/FM app shell (FM1-2-T1, ADR-020).
 * Contract: Contract Snapshot `FmShell v1` (this task's hand-off).
 * Chrome spec: docs/design_handoff_planza_fm/README.md §Shell (all screens).
 * Tokens: ops-tokens v3 vars only (shared token system, incl. FM1-1's
 * --border-shell-soft) — never hex, never legacy --t2/--t3, never ui/Btn|Button.
 *
 * Structurally copied from OpsShell (src/components/ops/OpsShell.tsx) —
 * sibling pattern, NOT a shared import (Rule of Three: this is only the 2nd
 * occurrence of "flagged lazy shell + registry + badge-publish context"; the
 * story's own Abstraction Check defers extraction — ADR-020).
 *
 * Mounted lazily at /fm/* by AppRoutes behind isFmShellEnabled(). Dark-only:
 * FM1-2 ships no theme toggle (light theme is EPIC FM-5.2 scope, matches
 * --border-shell-soft's FM1-1 comment) — so, unlike OpsShell, there is no
 * OpsThemeProvider-equivalent wrapper here.
 *
 * FM1-2 builds chrome/routing ONLY: every FM_NAV id (including `home`)
 * resolves to PlaceholderPanel — FmHomeScreen doesn't exist until FM1-4, which
 * overrides just the `home` entry in FM_SCREEN_OVERRIDES below without
 * touching this routing structure (never a 404, never a crash — Story FM1-2
 * AC). Top-bar CONTINUE/+ NEW render as disabled, non-functional chrome
 * (FM1-5/FM1-6 wire real behavior); the CONTINUE count chip shows a static 0
 * — no real action-item count is wired until FM1-4 consumes FM1-3's
 * deriveActionItems (fmActionItems.ts).
 *
 * `?inbox=<key>` hydration (Story FM1-2 AC) is FM1-2-T2 scope (fmUrlState.ts
 * / useFmSelection) — not built here.
 */
import { useCallback, useMemo, useState, type CSSProperties, type ReactElement } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { FmNavBadgeContext, type SetNavBadge } from './fmNavBadges'
import { FmHomeScreen } from './FmHomeScreen'
import './fm.css'

/** Contractual mount point (ADR-020): AppRoutes mounts <FmShell> at `${FM_BASE}/*`. */
export const FM_BASE = '/fm'

export interface FmNavItem {
  id: FmNavId
  label: string
  /** Static seed badge (design: red count on Home). FM1-2's registry ships
   * none — every count is dynamic, published via FmNavBadgeContext or passed
   * through FmShell's `navBadges` prop. Field kept per the story's literal
   * `{id,label,badge?}[]` Interfaces contract. */
  badge?: number
}

export interface FmNavSection {
  section: string
  items: FmNavItem[]
}

/**
 * Nav registry. Sidebar sections + items per README §Shell (all screens):
 * OVERVIEW / PLANNING / SPORT / RESOURCES. The `id` values are the /fm/:id
 * URL segments (mirrors ADR-014's ops precedent for tab ids as public
 * contract). `match` (Match Day, screen 8) is deliberately NOT a sidebar nav
 * item — per the design doc it's a per-event drill reached from the Schedule
 * board's "OPEN MATCH DAY" CTA, not a persistent nav destination — but it
 * still gets a placeholder ROUTE below so a direct /fm/match link never 404s.
 */
export const FM_NAV: FmNavSection[] = [
  {
    section: 'OVERVIEW',
    items: [{ id: 'home', label: 'Home' }],
  },
  {
    section: 'PLANNING',
    items: [
      { id: 'schedule', label: 'Schedule board' },
      { id: 'calendar', label: 'Season calendar' },
    ],
  },
  {
    section: 'SPORT',
    items: [
      { id: 'competitions', label: 'Competitions' },
      { id: 'teams', label: 'Teams' },
      { id: 'athletes', label: 'Athletes' },
    ],
  },
  {
    section: 'RESOURCES',
    items: [{ id: 'crew', label: 'Crew' }],
  },
]

export type FmNavId =
  | 'home'
  | 'schedule'
  | 'calendar'
  | 'competitions'
  | 'teams'
  | 'athletes'
  | 'crew'

/** Route-only id: has a placeholder route but no sidebar nav entry (see FM_NAV comment above). */
type FmRouteOnlyId = 'match'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }
const headStyle: CSSProperties = { fontFamily: 'var(--font-head)' }

const shellStyle: CSSProperties = {
  display: 'flex',
  minHeight: '100vh',
  background: 'var(--bg-shell)',
  color: 'var(--text-shell)',
  fontFamily: 'var(--font-display)',
}

const sidebarStyle: CSSProperties = {
  width: '216px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--surface-shell)',
  borderRight: '1px solid var(--border-shell)',
  padding: '16px 12px',
  gap: '20px',
}

const brandBlockStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '0 4px',
}

const brandSquareStyle: CSSProperties = {
  ...monoStyle,
  width: '34px',
  height: '34px',
  flexShrink: 0,
  borderRadius: 'var(--r-md)',
  background: 'var(--accent-shell)',
  color: 'var(--accent-shell-fg)',
  fontWeight: 700,
  fontSize: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const brandTitleStyle: CSSProperties = {
  ...monoStyle,
  display: 'block',
  fontWeight: 700,
  fontSize: '12px',
  letterSpacing: '1.5px',
  color: 'var(--text-shell)',
}

const brandSubtitleStyle: CSSProperties = {
  display: 'block',
  fontSize: '10.5px',
  color: 'var(--text-shell-2)',
}

const navStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  flex: 1,
  overflowY: 'auto',
}

const sectionLabelStyle: CSSProperties = {
  ...monoStyle,
  fontWeight: 600,
  fontSize: '9px',
  letterSpacing: '2px',
  color: 'var(--text-shell-3)',
  padding: '0 8px',
  marginBottom: '4px',
}

const navItemStyle = (isActive: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '7px 8px',
  borderRadius: 'var(--r-sm)',
  fontSize: '12.5px',
  fontWeight: 500,
  textDecoration: 'none',
  color: isActive ? 'var(--accent-shell)' : 'var(--text-shell-2)',
  background: isActive ? 'var(--surface-shell-2)' : 'transparent',
  boxShadow: isActive ? 'inset 2px 0 0 var(--accent-shell)' : 'none',
})

const navBadgePillStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '9.5px',
  fontWeight: 700,
  padding: '1px 6px',
  borderRadius: 'var(--r-sm)',
  background: 'var(--alert-danger)',
  color: 'var(--text-shell)',
}

const footerStyle: CSSProperties = {
  padding: '10px 8px 0',
  borderTop: '1px solid var(--border-shell-soft)',
}

const footerLabelStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '9.5px',
  letterSpacing: '1px',
  color: 'var(--text-shell-3)',
  marginBottom: '6px',
}

const progressTrackStyle: CSSProperties = {
  height: '4px',
  borderRadius: 'var(--r-full)',
  background: 'var(--surface-shell-2)',
  overflow: 'hidden',
  marginBottom: '6px',
}

const progressFillStyle: CSSProperties = {
  width: '62%',
  height: '100%',
  background: 'var(--accent-shell)',
}

const footerWeekStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '9.5px',
  color: 'var(--text-shell-2)',
}

const topBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  height: '52px',
  padding: '0 20px',
  background: 'var(--surface-shell)',
  borderBottom: '1px solid var(--border-shell)',
}

const dateMainStyle: CSSProperties = {
  ...monoStyle,
  display: 'block',
  fontWeight: 600,
  fontSize: '11px',
  color: 'var(--text-shell)',
}

const dateContextStyle: CSSProperties = {
  display: 'block',
  fontSize: '10px',
  color: 'var(--text-shell-2)',
}

const livePillStyle: CSSProperties = {
  ...monoStyle,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '10px',
  fontWeight: 600,
  padding: '4px 8px',
  border: '1px solid var(--border-shell)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text-shell-2)',
}

const newButtonStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '11px',
  fontWeight: 600,
  padding: '8px 14px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border-shell)',
  background: 'transparent',
  color: 'var(--text-shell-2)',
}

const continueButtonStyle: CSSProperties = {
  ...monoStyle,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '11.5px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  padding: '9px 18px',
  borderRadius: 'var(--r-sm)',
  border: 'none',
  background: 'var(--accent-shell)',
  color: 'var(--accent-shell-fg)',
}

const continueChipStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '10px',
  fontWeight: 700,
  padding: '1px 6px',
  borderRadius: 'var(--r-sm)',
  background: 'var(--bg-shell)',
  color: 'var(--accent-shell)',
}

const contentStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const placeholderStyle: CSSProperties = {
  padding: '32px',
}

const placeholderTitleStyle: CSSProperties = {
  ...headStyle,
  fontSize: '20px',
  fontWeight: 700,
  color: 'var(--text-shell)',
  marginBottom: '8px',
}

const placeholderBodyStyle: CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-shell-2)',
}

function FmSidebar({ navBadges }: { navBadges: Partial<Record<FmNavId, number>> }) {
  return (
    <aside style={sidebarStyle}>
      <div style={brandBlockStyle}>
        <span style={brandSquareStyle} aria-hidden="true">
          P
        </span>
        <span>
          <span style={brandTitleStyle}>PLANZA/FM</span>
          <span style={brandSubtitleStyle}>BROADCAST SCHEDULING</span>
        </span>
      </div>

      <nav style={navStyle} aria-label="Fm sections">
        {FM_NAV.map((section) => (
          <div key={section.section}>
            <div style={sectionLabelStyle}>{section.section}</div>
            {section.items.map((item) => {
              const badge = navBadges[item.id]
              return (
                // Absolute path on purpose: relative links inside the /fm/*
                // splat route resolve INCLUDING the matched splat segment
                // (→ /fm/home/schedule), the same infinite-loop trap OpsShell
                // documents (ADR-012 precedent). /fm is this shell's
                // contractual mount point (ADR-020).
                <NavLink
                  key={item.id}
                  to={`${FM_BASE}/${item.id}`}
                  data-testid={`fm-nav-${item.id}`}
                  style={({ isActive }) => navItemStyle(isActive)}
                >
                  <span>{item.label}</span>
                  {badge != null && (
                    <span style={navBadgePillStyle} data-testid={`fm-nav-badge-${item.id}`}>
                      {badge}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      <div style={footerStyle}>
        <div style={footerLabelStyle}>SEASON 2025–26</div>
        <div style={progressTrackStyle}>
          <div style={progressFillStyle} />
        </div>
        <span style={footerWeekStyle}>W10</span>
      </div>
    </aside>
  )
}

function FmTopBar() {
  return (
    <header style={topBarStyle}>
      {/* Chrome-only per Story FM1-2 AC: no live data source is wired yet
          (that's FM1-4). Static placeholder date block. */}
      <span data-testid="fm-date-block">
        <span style={dateMainStyle}>THU 5 MAR 2026</span>
        <span style={dateContextStyle}>Matchweek 10</span>
      </span>

      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
        <span data-testid="fm-live-pill" style={livePillStyle}>
          <span className="fm-live-dot" aria-hidden="true" />
          LIVE
        </span>

        {/* Non-functional placeholder — the create modal is FM1-6. */}
        <button type="button" style={newButtonStyle} data-testid="fm-new-button" disabled title="Coming in FM1-6">
          + NEW
        </button>

        {/* Non-functional placeholder — the CONTINUE loop is FM1-5. Count
            chip shows a static 0: no real action-item count is wired until
            FM1-4 consumes FM1-3's deriveActionItems. */}
        <button
          type="button"
          style={continueButtonStyle}
          data-testid="fm-continue-button"
          disabled
          title="Coming in FM1-5"
        >
          CONTINUE
          <span style={continueChipStyle} data-testid="fm-continue-count">
            0
          </span>
        </button>
      </span>
    </header>
  )
}

function PlaceholderPanel({ navId, label }: { navId: FmNavId | FmRouteOnlyId; label: string }) {
  return (
    <div data-testid={`fm-screen-${navId}`} style={placeholderStyle}>
      <p style={placeholderTitleStyle}>{label}</p>
      <p style={placeholderBodyStyle}>Coming soon — this screen has not shipped yet.</p>
    </div>
  )
}

/**
 * Per-nav-id screen override. FM1-2 shipped none — every id fell through to
 * PlaceholderPanel. FM1-4-T1 adds the first entry (`home`) without
 * restructuring the routing below (Story FM1-2-T1 hand-off note) — every
 * OTHER nav id still falls through to PlaceholderPanel until its own task.
 */
const FM_SCREEN_OVERRIDES: Partial<Record<FmNavId, () => ReactElement>> = {
  home: FmHomeScreen,
}

function screenFor(id: FmNavId, label: string): ReactElement {
  const Override = FM_SCREEN_OVERRIDES[id]
  return Override ? <Override /> : <PlaceholderPanel navId={id} label={label} />
}

export interface FmShellProps {
  /** Badge seed per nav id (design: red count on Home). Merged UNDER any
   * count published live via FmNavBadgeContext (a published count wins once
   * set) — same seed/override contract as OpsShellProps.tabBadges. */
  navBadges?: Partial<Record<FmNavId, number>>
}

export function FmShell({ navBadges = {} }: FmShellProps) {
  // Live per-nav-id badges published by a mounted screen. Merged OVER the
  // seed prop, so a screen's published count wins once it sets one.
  const [dynamicBadges, setDynamicBadges] = useState<Partial<Record<FmNavId, number>>>({})

  const setNavBadge = useCallback<SetNavBadge>((navId, count) => {
    setDynamicBadges((prev) => {
      // stable render: no-op (return prev) when the value is unchanged.
      if (prev[navId] === (count ?? undefined)) return prev
      const next = { ...prev }
      if (count == null) delete next[navId]
      else next[navId] = count
      return next
    })
  }, [])

  const mergedBadges = useMemo(() => ({ ...navBadges, ...dynamicBadges }), [navBadges, dynamicBadges])

  return (
    <FmNavBadgeContext.Provider value={setNavBadge}>
      <div style={shellStyle}>
        <FmSidebar navBadges={mergedBadges} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <FmTopBar />
          <main style={contentStyle}>
            <Routes>
              {/* Absolute targets on purpose: a relative `to` inside the `*`
                  route resolves against the matched splat segment and loops
                  forever (e.g. /fm/bogus -> /fm/bogus/home -> still `*` -> …).
                  /fm is this shell's contractual mount point (ADR-020). */}
              <Route index element={<Navigate to={`${FM_BASE}/home`} replace />} />
              {FM_NAV.flatMap((section) => section.items).map((item) => (
                <Route key={item.id} path={item.id} element={screenFor(item.id, item.label)} />
              ))}
              {/* Match Day (screen 8): route-only, no sidebar nav entry — see
                  FM_NAV's doc comment above. */}
              <Route path="match" element={<PlaceholderPanel navId="match" label="Match day" />} />
              {/* Unknown segment → home (documented in FmShell v1). */}
              <Route path="*" element={<Navigate to={`${FM_BASE}/home`} replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </FmNavBadgeContext.Provider>
  )
}
