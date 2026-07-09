/**
 * OpsShell — the Ops redesign app shell (A-2-T1, ADR-012).
 * Contract: docs/governance/contracts/OpsShell.md (OpsShell v1).
 * Chrome specs: docs/design_handoff_planza_ops/README.md §Layout constants.
 * Tokens: ops-tokens v2 vars only — never hex, never legacy --t2/--t3 (type-scale
 * collision), never ui/Btn|Button (TD-23).
 *
 * Mounted lazily at /ops/* by AppRoutes behind the opsRedesign flag; this module
 * being in the lazy ops chunk is what the useOpsTheme v1 FOUC guard depends on.
 *
 * v1.1 (D-1-T2): screens publish live badge counts UP via OpsTabBadgeContext (a
 * screen is a <Routes> child — a prop can't reach the chrome). The `tabBadges`
 * prop remains a seed/override, MERGED UNDER any published count (a published
 * count wins once set). App renders <OpsShell/> with no tabBadges — the Sync
 * screen's pending-merge count is the only live badge today (pin 5).
 */
import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { OpsTabBadgeContext, type SetTabBadge } from './opsTabBadges'
import { OpsThemeProvider, useOpsTheme } from './OpsThemeProvider'
import { ScheduleScreen } from '../../pages/ops/ScheduleScreen'
import { RundownScreen } from '../../pages/ops/RundownScreen'
import { RightsScreen } from '../../pages/ops/RightsScreen'
import { RegistryScreen } from '../../pages/ops/RegistryScreen'
import { SyncScreen } from '../../pages/ops/SyncScreen'
import './ops.css'

/** Contractual mount point (ADR-012): AppRoutes mounts <OpsShell> at `${OPS_BASE}/*`. */
export const OPS_BASE = '/ops'

/**
 * Tab registry. The `id` values are the /ops/:tab URL segments — PUBLIC CONTRACT
 * per ADR-014 (deep links): the day-timeline tab keeps the design's `planner` id
 * even though its screen component is RundownScreen (glossary: "Rundown"; the name
 * "Planner" belongs to the legacy PlannerView).
 */
export const OPS_TABS = [
  { id: 'schedule', label: 'SCHEDULE' },
  { id: 'planner', label: 'PLANNER' },
  { id: 'rights', label: 'RIGHTS' },
  { id: 'registry', label: 'REGISTRY' },
  { id: 'sync', label: 'SYNC' },
] as const

export type OpsTabId = (typeof OPS_TABS)[number]['id']

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

const chromeStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  height: '48px',
  padding: '0 16px',
  background: 'var(--surface-shell)',
  borderBottom: '1px solid var(--border-shell)',
}

const brandStyle: CSSProperties = {
  ...monoStyle,
  fontWeight: 700,
  fontSize: '13px',
  letterSpacing: '2px',
  color: 'var(--text-shell)',
}

const tabStyle = (isActive: boolean): CSSProperties => ({
  ...monoStyle,
  fontWeight: 600,
  fontSize: '10.5px',
  letterSpacing: '1px',
  padding: '6px 12px',
  borderRadius: 'var(--r-sm)',
  textDecoration: 'none',
  background: isActive ? 'var(--accent-shell)' : 'transparent',
  color: isActive ? 'var(--accent-shell-fg)' : 'var(--text-shell-2)',
})

const liveBadgeStyle: CSSProperties = {
  ...monoStyle,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontWeight: 600,
  fontSize: '10.5px',
  letterSpacing: '1px',
  padding: '4px 8px',
  border: '1px solid var(--border-shell)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text-shell-2)',
}

const themeToggleStyle: CSSProperties = {
  ...monoStyle,
  fontWeight: 600,
  fontSize: '10.5px',
  letterSpacing: '1px',
  padding: '6px 12px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border-shell)',
  background: 'transparent',
  color: 'var(--text-shell-2)',
  cursor: 'pointer',
}

function ThemeToggle() {
  const { theme, toggle } = useOpsTheme()
  return (
    <button type="button" onClick={toggle} style={themeToggleStyle}>
      {theme === 'dark' ? '☀ LIGHT' : '☾ DARK'}
    </button>
  )
}

function OpsChrome({ tabBadges }: { tabBadges: Partial<Record<OpsTabId, number>> }) {
  return (
    <header style={chromeStyle}>
      <span style={brandStyle}>
        PLANZA
        <span style={{ color: 'var(--accent-shell)' }}>/OPS</span>
      </span>

      <nav style={{ display: 'flex', gap: '4px' }} aria-label="Ops screens">
        {OPS_TABS.map((tab) => {
          const badge = tabBadges[tab.id]
          return (
            // Absolute `to` on purpose: relative links inside the /ops/* splat route
            // resolve INCLUDING the matched splat segment (→ /ops/schedule/planner).
            <NavLink key={tab.id} to={`${OPS_BASE}/${tab.id}`} style={({ isActive }) => tabStyle(isActive)}>
              {badge != null ? `${tab.label} [${badge}]` : tab.label}
            </NavLink>
          )
        })}
      </nav>

      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
        <span data-testid="ops-live-badge" style={liveBadgeStyle}>
          <span className="ops-live-dot" aria-hidden="true" />
          LIVE
        </span>
        <ThemeToggle />
      </span>
    </header>
  )
}

export interface OpsShellProps {
  /** Badge slot per tab (design: `SYNC [3]`). Wired to real pending-merge data in EPIC D. */
  tabBadges?: Partial<Record<OpsTabId, number>>
}

export function OpsShell({ tabBadges = {} }: OpsShellProps) {
  // Live per-tab badges published by the mounted screen (v1.1). Merged OVER the
  // seed prop, so a screen's published count wins once it sets one.
  const [dynamicBadges, setDynamicBadges] = useState<Partial<Record<OpsTabId, number>>>({})

  const setTabBadge = useCallback<SetTabBadge>((tabId, count) => {
    setDynamicBadges((prev) => {
      // stable render: no-op (return prev) when the value is unchanged.
      if (prev[tabId] === (count ?? undefined)) return prev
      const next = { ...prev }
      if (count == null) delete next[tabId]
      else next[tabId] = count
      return next
    })
  }, [])

  const mergedBadges = useMemo(() => ({ ...tabBadges, ...dynamicBadges }), [tabBadges, dynamicBadges])

  return (
    <OpsThemeProvider>
      <OpsTabBadgeContext.Provider value={setTabBadge}>
        <div
          style={{
            minHeight: '100vh',
            background: 'var(--bg-shell)',
            color: 'var(--text-shell)',
            fontFamily: 'var(--font-display)',
          }}
        >
          <OpsChrome tabBadges={mergedBadges} />
          <Routes>
          {/* Absolute targets on purpose: a relative `to` inside the `*` route
              resolves against the matched splat segment and loops forever
              (e.g. /ops/bogus -> /ops/bogus/schedule -> still `*` -> …).
              /ops is this shell's contractual mount point (ADR-012/ADR-014). */}
          <Route index element={<Navigate to={`${OPS_BASE}/schedule`} replace />} />
          <Route path="schedule" element={<ScheduleScreen />} />
          {/* URL id `planner` = ADR-014 public contract; screen = Rundown (glossary). */}
          <Route path="planner" element={<RundownScreen />} />
          <Route path="rights" element={<RightsScreen />} />
          <Route path="registry" element={<RegistryScreen />} />
          <Route path="sync" element={<SyncScreen />} />
          {/* Unknown tab → schedule (documented in OpsShell v1). */}
          <Route path="*" element={<Navigate to={`${OPS_BASE}/schedule`} replace />} />
          </Routes>
        </div>
      </OpsTabBadgeContext.Provider>
    </OpsThemeProvider>
  )
}
