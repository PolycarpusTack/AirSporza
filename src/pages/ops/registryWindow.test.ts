/**
 * Unit tests for computeVisibleWindow — the pure row-windowing math behind the
 * E-1 registry-perf remediation. The DOM integration is proven in
 * RegistryScreen.test.tsx (stubbed clientHeight) + the Playwright re-measure; here
 * we pin the offset arithmetic and, critically, the jsdom/pre-measure fallback.
 */
import { describe, expect, it } from 'vitest'
import { computeVisibleWindow } from './registryWindow'

const ROW = 44
const OVERSCAN = 8

describe('computeVisibleWindow', () => {
  it('renders ALL rows when the viewport height is unknown (0 → jsdom/pre-measure/SSR)', () => {
    expect(computeVisibleWindow(0, 0, ROW, 2000, OVERSCAN)).toEqual({ start: 0, end: 2000 })
    // even mid-scroll, an unmeasured viewport must not blank the list
    expect(computeVisibleWindow(5000, 0, ROW, 2000, OVERSCAN)).toEqual({ start: 0, end: 2000 })
  })

  it('renders ALL rows when the row height is non-positive (defensive)', () => {
    expect(computeVisibleWindow(0, 440, 0, 2000, OVERSCAN)).toEqual({ start: 0, end: 2000 })
  })

  it('at the top of a large list windows to viewport + trailing overscan only', () => {
    // viewport 440 / 44 = 10 visible rows; firstVisible 0; end = 0 + 10 + 8 = 18
    expect(computeVisibleWindow(0, 440, ROW, 2000, OVERSCAN)).toEqual({ start: 0, end: 18 })
  })

  it('scrolled into the list applies leading + trailing overscan around the viewport', () => {
    // scrollTop 4400 → firstVisible 100; start = 100 - 8 = 92; end = 100 + 10 + 8 = 118
    expect(computeVisibleWindow(4400, 440, ROW, 2000, OVERSCAN)).toEqual({ start: 92, end: 118 })
  })

  it('clamps start at 0 and end at total (never over- or under-runs the array)', () => {
    // small scroll: firstVisible 1, start clamps to 0 (1 - 8 < 0)
    expect(computeVisibleWindow(44, 440, ROW, 2000, OVERSCAN).start).toBe(0)
    // scrolled to the very bottom of a short list: end clamps to total
    expect(computeVisibleWindow(4400, 440, ROW, 105, OVERSCAN)).toEqual({ start: 92, end: 105 })
  })

  it('a negative scrollTop is treated as the top (defensive)', () => {
    expect(computeVisibleWindow(-50, 440, ROW, 2000, OVERSCAN)).toEqual({ start: 0, end: 18 })
  })

  it('a partial-row scroll offset FLOORS to the row straddling the top edge (floor≠ceil)', () => {
    // scrollTop 4410 = 10px into row 100 → firstVisible is 100 (floor of 100.23),
    // NOT 101 (ceil). Every other case uses an exact ROW multiple, so this is the
    // only guard that distinguishes Math.floor from Math.ceil on firstVisible.
    expect(computeVisibleWindow(4410, 440, ROW, 2000, OVERSCAN)).toEqual({ start: 92, end: 118 })
  })
})
