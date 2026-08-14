/**
 * FmHomeScreen — Story FM1-4 (README §1 · Home). 4 KPI tiles + a 380px
 * triage inbox + a flex detail pane. All derivation lives upstream
 * (fmActionItems v1 / useFmActionItems, FM1-3-T1 / FM1-4-T1's own hook) —
 * this component only renders `items`/`weekEvents`, wires `?inbox=<key>`
 * selection (fmUrlState v1), and publishes the nav badge count.
 *
 * Tokens: ops-tokens v3 vars only — never hex, never legacy --t2/--t3, never
 * ui/Btn|Button (FmShell v1's own header rule, still in force here).
 *
 * JUDGMENT CALLS (flagged for architect review, not silently assumed):
 *  - "body" in the detail pane: ActionItem (fmActionItems v1) carries only
 *    `title`/`sub` — no separate long-form body field exists upstream. `sub`
 *    is reused as the detail body; a richer body copy is FM-2+ scope if ever
 *    needed.
 *  - Primary CTA label: not specified by the backlog/README beyond "primary
 *    CTA (interim bridge, AS-3)". Derived from `targetRoute` via
 *    CTA_LABEL_BY_ROUTE below (OPEN IN SCHEDULE / OPEN IN PLANNER / OPEN IN
 *    RIGHTS), falling back to a generic "OPEN".
 *  - "quiet/disabled at 0" + "(red/amber/green semantic)" (README §1): read
 *    together as ONE rule applied uniformly to the three risk tiles
 *    (CONFLICTS/RIGHTS/UNPLACED) — count 0 → green (`--status-approved`,
 *    all-clear) + disabled; count > 0 → the tile's alert color + enabled.
 *    The AC's literal text only repeats "if >0" on the CONFLICTS tile, but
 *    "quiet ... at 0" reads as the general rule, not a CONFLICTS-only one.
 *  - EVENTS THIS WEEK is not itself an action-item kind (no CONFLICT/RIGHTS/
 *    UNPLACED/CREW semantics apply) — its CTA deep-links to `/ops/schedule`
 *    (no event preselected) when count > 0, disabled at 0; its value color
 *    is always neutral (`--text-shell`), never risk-coded.
 *  - "first open item of that kind": read as the first DERIVED item of that
 *    kind in `items` order, regardless of `resolved` — resolution is an
 *    acknowledgment overlay, not a filter (Story FM1-4 AC), so a resolved
 *    item's underlying condition may still be live.
 */
import { useEffect, useMemo, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFmActionItems, type FmActionItem } from './useFmActionItems'
import { useFmSelection } from './fmUrlState'
import { useSetNavBadge } from './fmNavBadges'
import type { ActionItemKind } from './fmActionItems'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }
const headStyle: CSSProperties = { fontFamily: 'var(--font-head)' }

const KIND_COLOR: Record<ActionItemKind, string> = {
  CONFLICT: 'var(--alert-danger)',
  RIGHTS: 'var(--alert-warning)',
  UNPLACED: 'var(--alert-warning)',
  CREW: 'var(--status-ready)',
  FEED: 'var(--text-shell-2)',
}

/** Badge count kinds (Story FM1-2 AC): CONFLICT+RIGHTS+UNPLACED+CREW — NOT FEED. */
const BADGE_KINDS: ActionItemKind[] = ['CONFLICT', 'RIGHTS', 'UNPLACED', 'CREW']

const CTA_LABEL_BY_ROUTE: Record<string, string> = {
  '/ops/schedule': 'OPEN IN SCHEDULE',
  '/ops/planner': 'OPEN IN PLANNER',
  '/ops/rights': 'OPEN IN RIGHTS',
}

function ctaLabel(route: string): string {
  return CTA_LABEL_BY_ROUTE[route] ?? 'OPEN'
}

function buildHref(route: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString()
  return qs ? `${route}?${qs}` : route
}

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}

const kpiGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '12px',
  padding: '20px',
}

const kpiTileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  alignItems: 'flex-start',
  padding: '14px 16px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-shell)',
  background: 'var(--surface-shell)',
  textAlign: 'left',
  cursor: 'pointer',
}

const kpiTileDisabledStyle: CSSProperties = {
  ...kpiTileStyle,
  cursor: 'default',
  opacity: 0.7,
}

const kpiLabelStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '9.5px',
  fontWeight: 600,
  letterSpacing: '1.5px',
  color: 'var(--text-shell-3)',
}

const kpiValueStyle: CSSProperties = {
  ...headStyle,
  fontSize: '26px',
  fontWeight: 700,
}

const kpiSubStyle: CSSProperties = {
  fontSize: '10.5px',
  color: 'var(--text-shell-2)',
}

const bodyRowStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
}

const inboxStyle: CSSProperties = {
  width: '380px',
  flexShrink: 0,
  overflowY: 'auto',
  borderRight: '1px solid var(--border-shell)',
}

const inboxRowStyle = (selected: boolean, resolved: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '10px 16px',
  borderBottom: '1px solid var(--border-shell-soft)',
  background: selected ? 'var(--surface-shell-2)' : 'transparent',
  boxShadow: selected ? 'inset 2px 0 0 var(--accent-shell)' : 'none',
  opacity: resolved ? 0.45 : 1,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
})

const inboxDotStyle = (color: string): CSSProperties => ({
  width: '7px',
  height: '7px',
  borderRadius: 'var(--r-full)',
  background: color,
  marginTop: '4px',
  flexShrink: 0,
})

const inboxKindStyle = (color: string): CSSProperties => ({
  ...monoStyle,
  fontSize: '9px',
  fontWeight: 700,
  color,
})

const inboxTitleStyle: CSSProperties = {
  fontSize: '12.5px',
  fontWeight: 600,
  color: 'var(--text-shell)',
}

const inboxSubStyle: CSSProperties = {
  fontSize: '10.5px',
  color: 'var(--text-shell-2)',
}

const emptyStateStyle: CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  color: 'var(--text-shell-2)',
}

const detailPaneStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '24px',
}

const detailBadgeStyle = (color: string): CSSProperties => ({
  ...monoStyle,
  display: 'inline-block',
  fontSize: '10px',
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 'var(--r-sm)',
  border: `1px solid ${color}`,
  color,
  marginBottom: '12px',
})

const detailTitleStyle: CSSProperties = {
  ...headStyle,
  fontSize: '22px',
  fontWeight: 700,
  color: 'var(--text-shell)',
  marginBottom: '10px',
}

const detailBodyStyle: CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-shell-2)',
  marginBottom: '20px',
}

const detailActionsStyle: CSSProperties = {
  display: 'flex',
  gap: '10px',
}

const primaryCtaStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '1px',
  padding: '9px 16px',
  borderRadius: 'var(--r-sm)',
  border: 'none',
  background: 'var(--accent-shell)',
  color: 'var(--accent-shell-fg)',
  cursor: 'pointer',
}

const resolveGhostStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '1px',
  padding: '9px 16px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border-shell)',
  background: 'transparent',
  color: 'var(--text-shell-2)',
  cursor: 'pointer',
}

interface KpiTileProps {
  testId: string
  label: string
  value: number
  sub: string
  valueColor: string
  disabled: boolean
  onClick: () => void
}

function KpiTile({ testId, label, value, sub, valueColor, disabled, onClick }: KpiTileProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      style={disabled ? kpiTileDisabledStyle : kpiTileStyle}
      disabled={disabled}
      onClick={onClick}
    >
      <span style={kpiLabelStyle}>{label}</span>
      <span style={{ ...kpiValueStyle, color: valueColor }}>{value}</span>
      <span style={kpiSubStyle}>{sub}</span>
    </button>
  )
}

export function FmHomeScreen() {
  const { items, weekEvents, resolve } = useFmActionItems()
  const { inboxKey, setInboxKey } = useFmSelection()
  const setNavBadge = useSetNavBadge()
  const navigate = useNavigate()

  const badgeCount = useMemo(() => items.filter((i) => BADGE_KINDS.includes(i.kind)).length, [items])
  useEffect(() => {
    setNavBadge('home', badgeCount > 0 ? badgeCount : undefined)
  }, [setNavBadge, badgeCount])

  const firstOpenByKind = useMemo(() => {
    const map = new Map<ActionItemKind, FmActionItem>()
    for (const item of items) {
      if (!map.has(item.kind)) map.set(item.kind, item)
    }
    return map
  }, [items])

  const countByKind = useMemo(() => {
    const counts: Partial<Record<ActionItemKind, number>> = {}
    for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1
    return counts
  }, [items])

  const sortedItems = useMemo(() => {
    // Resolved items sort last; stable within each group (Story FM1-4 AC).
    return [...items].sort((a, b) => Number(a.resolved) - Number(b.resolved))
  }, [items])

  const selectedItem = inboxKey ? items.find((i) => i.key === inboxKey) ?? null : null

  const goTo = (route: string, params: Record<string, string>) => navigate(buildHref(route, params))

  const liveCount = weekEvents.filter((e) => e.isLive).length

  const kpiFor = (kind: ActionItemKind) => {
    const count = countByKind[kind] ?? 0
    const target = firstOpenByKind.get(kind)
    return {
      count,
      onClick: () => target && goTo(target.targetRoute, target.targetParams),
      disabled: count === 0,
      color: count > 0 ? KIND_COLOR[kind] : 'var(--status-approved)',
    }
  }

  const conflicts = kpiFor('CONFLICT')
  const rights = kpiFor('RIGHTS')
  const unplaced = kpiFor('UNPLACED')

  return (
    <div style={screenStyle} data-testid="fm-home-screen">
      <div style={kpiGridStyle}>
        <KpiTile
          testId="fm-home-kpi-events"
          label="EVENTS THIS WEEK"
          value={weekEvents.length}
          sub={`${liveCount} live production${liveCount === 1 ? '' : 's'}`}
          valueColor="var(--text-shell)"
          disabled={weekEvents.length === 0}
          onClick={() => goTo('/ops/schedule', {})}
        />
        <KpiTile
          testId="fm-home-kpi-conflicts"
          label="CREW CONFLICTS"
          value={conflicts.count}
          sub="open crew clashes"
          valueColor={conflicts.color}
          disabled={conflicts.disabled}
          onClick={conflicts.onClick}
        />
        <KpiTile
          testId="fm-home-kpi-rights"
          label="RIGHTS EXPIRING"
          value={rights.count}
          sub="competitions at risk"
          valueColor={rights.color}
          disabled={rights.disabled}
          onClick={rights.onClick}
        />
        <KpiTile
          testId="fm-home-kpi-unplaced"
          label="UNPLACED EVENTS"
          value={unplaced.count}
          sub="no channel or slot"
          valueColor={unplaced.color}
          disabled={unplaced.disabled}
          onClick={unplaced.onClick}
        />
      </div>

      <div style={bodyRowStyle}>
        {items.length === 0 ? (
          <div style={{ flex: 1 }} data-testid="fm-home-empty">
            <div style={emptyStateStyle}>
              <p style={{ ...headStyle, fontSize: '18px', fontWeight: 700, color: 'var(--text-shell)' }}>ALL CLEAR</p>
              <p style={kpiSubStyle}>No open risks this week.</p>
            </div>
          </div>
        ) : (
          <>
            <div style={inboxStyle} data-testid="fm-home-inbox" role="listbox" aria-label="Action item inbox">
              {sortedItems.map((item) => {
                const selected = item.key === inboxKey
                return (
                  <div
                    key={item.key}
                    role="option"
                    aria-selected={selected}
                    tabIndex={0}
                    data-testid={`fm-home-inbox-row-${item.key}`}
                    style={inboxRowStyle(selected, item.resolved)}
                    onClick={() => setInboxKey(item.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setInboxKey(item.key)
                    }}
                  >
                    <span style={inboxDotStyle(KIND_COLOR[item.kind])} aria-hidden="true" />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span style={inboxKindStyle(KIND_COLOR[item.kind])}>{item.kind}</span>
                      <span style={inboxTitleStyle}>
                        {item.resolved ? '✓ ' : ''}
                        {item.title}
                      </span>
                      <span style={inboxSubStyle}>{item.sub}</span>
                    </span>
                  </div>
                )
              })}
            </div>

            <div style={detailPaneStyle}>
              {!selectedItem ? (
                <div data-testid="fm-home-detail-empty" style={emptyStateStyle}>
                  <p style={kpiSubStyle}>Select an item to see details.</p>
                </div>
              ) : (
                <div data-testid="fm-home-detail">
                  <span style={detailBadgeStyle(KIND_COLOR[selectedItem.kind])}>{selectedItem.kind}</span>
                  <p style={detailTitleStyle}>{selectedItem.title}</p>
                  <p style={detailBodyStyle}>{selectedItem.sub}</p>
                  <div style={detailActionsStyle}>
                    <button
                      type="button"
                      data-testid="fm-home-detail-cta"
                      style={primaryCtaStyle}
                      onClick={() => goTo(selectedItem.targetRoute, selectedItem.targetParams)}
                    >
                      {ctaLabel(selectedItem.targetRoute)}
                    </button>
                    <button
                      type="button"
                      data-testid="fm-home-detail-resolve"
                      style={resolveGhostStyle}
                      onClick={() => void resolve(selectedItem.key)}
                    >
                      MARK RESOLVED
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
