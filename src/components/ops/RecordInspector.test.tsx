/**
 * Render + interaction tests for the ops RecordInspector (C-3-T1).
 * Design: docs/design_handoff_planza_ops/README.md §4 REGISTRY inspector.
 * PURE, props-driven (EventInspector idiom) — no router, no fetch: fixtures are
 * projected via buildRegistryIndex and passed in directly.
 * Contracts: registry-selectors v1.1 (RegistryRecord incl. notes/country/
 * countryCode; LinkedRecordSection). Provenance drops the design's `· LAST SYNC`
 * suffix (no timestamp exists) and shows the SOURCE CODE, not a full name.
 */
import { cleanup, render, screen, within, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_COMPETITIONS,
  FIXTURE_PLAYERS,
  FIXTURE_SPORTS,
  FIXTURE_TEAMS,
  makePlayer,
} from './__fixtures__/opsFixtureWeek'
import { buildRegistryIndex, type LinkedRecordSection } from './registrySelectors'
import { RecordInspector } from './RecordInspector'

const index = buildRegistryIndex(FIXTURE_SPORTS, FIXTURE_COMPETITIONS, FIXTURE_TEAMS, FIXTURE_PLAYERS)
const rec = (id: string) => index.byId.get(id)!

const renderInspector = (
  record: Parameters<typeof RecordInspector>[0]['record'],
  linkedSections: LinkedRecordSection[] = [],
  onHop = vi.fn(),
) => {
  render(<RecordInspector record={record} linkedSections={linkedSections} onHop={onHop} />)
  return { onHop }
}

afterEach(() => cleanup())

describe('RecordInspector — empty state', () => {
  it('null record → quiet empty state, no body', () => {
    renderInspector(null)
    expect(screen.getByTestId('ops-record-inspector')).toBeTruthy()
    expect(screen.getByTestId('ops-record-inspector-empty')).toBeTruthy()
    expect(screen.queryByTestId('ops-record-provenance')).toBeNull()
  })
})

describe('RecordInspector — header + provenance (per kind)', () => {
  it('renders name + kind chip for each kind', () => {
    for (const [id, name, chip] of [
      ['sport:1', 'Football', 'SPORT'],
      ['competition:101', 'League A', 'COMPETITION'],
      ['team:1', 'Riverside United', 'TEAM'],
      ['player:1', 'Jonas Vale', 'PLAYER'],
    ] as const) {
      renderInspector(rec(id))
      expect(screen.getByTestId('ops-record-name').textContent).toBe(name)
      expect(screen.getByTestId('ops-record-chip').textContent).toBe(chip)
      cleanup()
    }
  })

  it('MANUAL record → protected provenance, NO last-sync suffix', () => {
    renderInspector(rec('team:1')) // Riverside United — externalRefs {}
    const prov = screen.getByTestId('ops-record-provenance')
    expect(prov.textContent).toBe('MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE')
    expect(prov.textContent).not.toMatch(/LAST SYNC/)
  })

  it('imported record → SYNCED FROM <code> (the code, not a full name), NO last-sync suffix', () => {
    renderInspector(rec('player:2')) // Milo Ferran — the_sports_db → TSDB
    const prov = screen.getByTestId('ops-record-provenance')
    expect(prov.textContent).toBe('SYNCED FROM TSDB')
    expect(prov.textContent).not.toMatch(/LAST SYNC/)
  })
})

describe('RecordInspector — attribute rows (conditional, design attrsOf)', () => {
  it('team with country + detail → shows COUNTRY (name) + DETAIL rows', () => {
    renderInspector(rec('team:1')) // Belgium; detail 'Belgium'
    expect(screen.getByTestId('ops-record-attr-country').textContent).toContain('Belgium')
    expect(screen.getByTestId('ops-record-attr-detail')).toBeTruthy()
    expect(screen.getByTestId('ops-record-attr-sport').textContent).toContain('Football')
  })

  it('player COUNTRY row shows the ISO countryCode (honest — not a name)', () => {
    const withCode = buildRegistryIndex([], [], [], [makePlayer({ id: 77, fullName: 'Ana Ruiz', countryCode: 'ES' })]).byId.get('player:77')!
    renderInspector(withCode)
    expect(screen.getByTestId('ops-record-attr-country').textContent).toContain('ES')
  })

  it('record without country/detail omits those rows (no empty keys)', () => {
    // a player with no position/jersey (detail '') and no countryCode
    const bare = buildRegistryIndex([], [], [], [makePlayer({ id: 88, fullName: 'Sam Vega', position: null, jerseyNumber: null })]).byId.get('player:88')!
    renderInspector(bare)
    expect(screen.queryByTestId('ops-record-attr-country')).toBeNull()
    expect(screen.queryByTestId('ops-record-attr-detail')).toBeNull()
    // TYPE + STATUS + SOURCE are always present
    expect(screen.getByTestId('ops-record-attr-type')).toBeTruthy()
    expect(screen.getByTestId('ops-record-attr-status')).toBeTruthy()
    expect(screen.getByTestId('ops-record-attr-source')).toBeTruthy()
  })

  it('STATUS row is colored via a semantic token (non-hex)', () => {
    renderInspector(rec('player:2')) // INJURED → amber
    const status = screen.getByTestId('ops-record-attr-status')
    expect(status.textContent).toContain('INJURED')
    const colored = within(status).getByTestId('ops-record-status-word')
    expect(colored.style.color).toBe('var(--alert-warning)')
    expect(colored.style.color).not.toMatch(/#/)
  })
})

describe('RecordInspector — REMARKS box (only when a manual remark exists)', () => {
  it('team WITH notes → REMARKS box shows the note', () => {
    renderInspector(rec('team:1'))
    expect(screen.getByTestId('ops-record-remarks').textContent).toContain('Promoted from the second division')
  })

  it('record WITHOUT notes → no REMARKS box; the inert + ADD REMARK ghost is still present', () => {
    renderInspector(rec('team:2')) // Coastal Rovers — no notes
    expect(screen.queryByTestId('ops-record-remarks')).toBeNull()
    const addRemark = screen.getByTestId('ops-record-add-remark') as HTMLButtonElement
    expect(addRemark.disabled).toBe(true)
  })
})

describe('RecordInspector — LINKED hop rows', () => {
  it('renders linked sections and hops on click (onHop with the linked recordId)', () => {
    const sections: LinkedRecordSection[] = [
      {
        relation: 'competitions',
        records: [
          { recordId: 'competition:101', name: 'League A', kind: 'competition' },
          { recordId: 'competition:103', name: 'Cup C', kind: 'competition' },
        ],
      },
    ]
    const { onHop } = renderInspector(rec('team:1'), sections)

    expect(screen.getByText('COMPETITIONS')).toBeTruthy()
    expect(within(screen.getByTestId('ops-record-linked-competition:101')).getByText('League A')).toBeTruthy()

    fireEvent.click(screen.getByTestId('ops-record-linked-competition:103'))
    expect(onHop).toHaveBeenCalledWith('competition:103')
  })

  it('no linked sections → no LINKED rows (resolver already omits empties)', () => {
    renderInspector(rec('player:1'), [])
    expect(screen.queryByTestId(/^ops-record-linked-/)).toBeNull()
  })
})
