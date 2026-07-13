/**
 * RC-1-T3 — pure LISTED_EVENT_FTA check permutation table (no DB).
 * A confirmed listed event whose category `fullLiveRequired` must be broadcast
 * LIVE + FULL-segment on an FTA channel spanning the event window; else WARNING
 * with a remediation naming the FIRST missing condition.
 */
import { describe, it, expect } from 'vitest'
import { checkListedEventFta, type ListedFtaEvent, type ListedFtaSlot } from '../src/services/validation/listedEventFta.js'

const EVT_START = '2026-06-01T18:00:00.000Z'
const EVT_END = '2026-06-01T20:00:00.000Z'

function event(over: Partial<ListedFtaEvent> = {}): ListedFtaEvent {
  return { id: 1, isLive: true, startUtc: EVT_START, endUtc: EVT_END, fullLiveRequired: true, ...over }
}
function slot(over: Partial<ListedFtaSlot> = {}): ListedFtaSlot {
  return {
    id: 's1', eventId: 1, contentSegment: 'FULL',
    plannedStartUtc: '2026-06-01T17:55:00.000Z', plannedEndUtc: '2026-06-01T20:05:00.000Z',
    channel: { isFreeToAir: true }, ...over,
  }
}
const codes = (rs: ReturnType<typeof checkListedEventFta>) => rs.map(r => r.code)
const only = (rs: ReturnType<typeof checkListedEventFta>) => rs[0]

describe('checkListedEventFta', () => {
  it('COMPLIANT: live FULL FTA slot spanning the window → no code', () => {
    expect(checkListedEventFta([event()], [slot()])).toEqual([])
  })

  it('fullLiveRequired:false → no code (listed but not a full-live obligation)', () => {
    expect(checkListedEventFta([event({ fullLiveRequired: false })], [])).toEqual([])
  })

  it('non-obligation events are simply not passed → empty', () => {
    expect(checkListedEventFta([], [slot()])).toEqual([])
  })

  it('severity is provisional WARNING (AS-2)', () => {
    expect(only(checkListedEventFta([event()], [])).severity).toBe('WARNING')
  })

  it('code is LISTED_EVENT_FTA', () => {
    expect(only(checkListedEventFta([event()], [])).code).toBe('LISTED_EVENT_FTA')
  })

  it('scope is the event', () => {
    expect(only(checkListedEventFta([event()], [])).scope).toEqual(['event-1'])
  })

  it('message says "(provisional)" but leaks NO governance token (AS-9)', () => {
    const msg = only(checkListedEventFta([event()], [])).message
    expect(msg).toContain('(provisional)')
    expect(msg).not.toContain('TODO')
    expect(msg).not.toContain('ADR')
  })

  it('NO-SLOT: event with no slots → remediation names "no slot"', () => {
    const r = only(checkListedEventFta([event()], []))
    expect(r.message).toContain('no scheduled slot')
    expect(r.remediation).toMatch(/schedule a live/i)
  })

  it('CONTINUATION-ONLY: only CONTINUATION segments → that variant', () => {
    const r = only(checkListedEventFta([event()], [slot({ contentSegment: 'CONTINUATION' })]))
    expect(r.message).toContain('CONTINUATION')
    expect(r.remediation).toMatch(/FULL-segment/i)
  })

  it('NOT-FTA: FULL slot on a non-free-to-air channel → that variant', () => {
    const r = only(checkListedEventFta([event()], [slot({ channel: { isFreeToAir: false } })]))
    expect(r.message).toContain('not on a free-to-air')
    expect(r.remediation).toMatch(/free-to-air channel/i)
  })

  it('NOT-LIVE: live FULL FTA slot but the event is not live → that variant', () => {
    const r = only(checkListedEventFta([event({ isLive: false })], [slot()]))
    expect(r.message).toContain('not scheduled as a live')
    // tightened so it does not also match the no-slot remediation ("Schedule a live…")
    expect(r.remediation).toMatch(/broadcast the event live/i)
  })

  it('PARTIAL: live FULL FTA slot that does NOT span the event window → that variant', () => {
    const shortSlot = slot({ plannedStartUtc: '2026-06-01T18:00:00.000Z', plannedEndUtc: '2026-06-01T19:00:00.000Z' })
    const r = only(checkListedEventFta([event()], [shortSlot]))
    expect(r.message).toContain('does not span')
    expect(r.remediation).toMatch(/span the full event/i)
  })

  it('condition ORDER: not-fta is reported before not-live when both fail (first missing condition)', () => {
    // not-live AND not-fta both fail; not-fta is checked first → not-fta wins.
    const r = only(checkListedEventFta([event({ isLive: false })], [slot({ channel: { isFreeToAir: false } })]))
    expect(r.message).toContain('not on a free-to-air')
  })

  it('condition ORDER: not-live is reported before partial when both fail (kills the swap mutant)', () => {
    // event not live AND its FTA FULL slot does not span the window — not-live checked
    // first → not-live wins. A mutant swapping not-live/partial would report "partial".
    const shortSlot = slot({ plannedStartUtc: '2026-06-01T18:00:00.000Z', plannedEndUtc: '2026-06-01T19:00:00.000Z' })
    const r = only(checkListedEventFta([event({ isLive: false })], [shortSlot]))
    expect(r.message).toContain('not scheduled as a live')
  })

  it('spanning is skipped when the event window is unknown (no false partial)', () => {
    expect(checkListedEventFta([event({ startUtc: null, endUtc: null })], [slot()])).toEqual([])
  })

  it('COMPLIANT boundary: slot edges EXACTLY on the event window → no code (pins <=/>= comparator)', () => {
    const edge = slot({ plannedStartUtc: EVT_START, plannedEndUtc: EVT_END })
    expect(checkListedEventFta([event()], [edge])).toEqual([])
  })

  it('emits one result per failing obligation event', () => {
    const out = checkListedEventFta(
      [event({ id: 1 }), event({ id: 2 })],
      [slot({ eventId: 1 })], // event 2 has no slot
    )
    expect(codes(out)).toEqual(['LISTED_EVENT_FTA'])
    expect(out[0].scope).toEqual(['event-2'])
  })
})
