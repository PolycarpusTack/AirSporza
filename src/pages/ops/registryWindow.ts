/**
 * computeVisibleWindow (E-1 remediation, pure helper) — the row-windowing MATH for
 * the Registry table, extracted so it is unit-testable without a DOM/layout engine.
 *
 * The Registry table renders one projected `RegistryRow` per record. At the SLO
 * volume (2,000 rows) painting every node mounts ~2,000 DOM nodes (E-1 #5 FAIL) and
 * a selection re-renders the whole list (E-1 #7 FAIL). Windowing bounds the mounted
 * node count to the viewport (+overscan) regardless of total.
 *
 * UNIFORM-HEIGHT assumption: the registry rows are single-line (fixed padding +
 * one text line), so a single `ROW_HEIGHT` constant is exact enough for offset math.
 * Measured current row height ≈ 44px (11px padding top+bottom + ~21px 12.5px line +
 * 1px bottom border). If the row grows to multi-line this must become measured.
 *
 * jsdom / pre-measure / SSR fallback: when the viewport height is unknown (0), the
 * layout engine hasn't measured anything, so windowing would render ZERO rows and
 * break every screen test. In that case we return the FULL range [0, total) — render
 * all rows. Windowing engages ONLY once a real positive viewport height is measured
 * (real browser). Same guard for a non-positive row height (defensive).
 */
export interface VisibleWindow {
  start: number
  end: number
}

export function computeVisibleWindow(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  total: number,
  overscan: number,
): VisibleWindow {
  // Unknown/zero viewport (jsdom, pre-measure, SSR) or bad row height → render all.
  if (viewportHeight <= 0 || rowHeight <= 0) {
    return { start: 0, end: total }
  }
  const safeScrollTop = Math.max(0, scrollTop)
  const firstVisible = Math.floor(safeScrollTop / rowHeight)
  const start = Math.max(0, firstVisible - overscan)
  const visibleCount = Math.ceil(viewportHeight / rowHeight)
  const end = Math.min(total, firstVisible + visibleCount + overscan)
  return { start, end }
}
