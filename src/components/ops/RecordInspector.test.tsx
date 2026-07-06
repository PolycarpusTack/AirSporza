/**
 * Render + interaction tests for the ops RecordInspector (C-3-T1).
 * Design: docs/design_handoff_planza_ops/README.md §4 REGISTRY inspector.
 * PURE, props-driven (EventInspector idiom) — no router, no fetch: fixtures are
 * projected via buildRegistryIndex and passed in directly.
 * Contracts: registry-selectors v1.1 (RegistryRecord incl. notes/country/
 * countryCode; LinkedRecordSection). Provenance drops the design's `· LAST SYNC`
 * suffix (no timestamp exists) and shows the SOURCE CODE, not a full name.
 */
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react'
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
  onSaveRemark?: Parameters<typeof RecordInspector>[0]['onSaveRemark'],
) => {
  render(
    <RecordInspector record={record} linkedSections={linkedSections} onHop={onHop} onSaveRemark={onSaveRemark} />,
  )
  return { onHop, onSaveRemark }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

  it('record WITHOUT notes → no REMARKS box', () => {
    renderInspector(rec('team:2')) // Coastal Rovers — no notes
    expect(screen.queryByTestId('ops-record-remarks')).toBeNull()
  })
})

describe('RecordInspector v1.1 — remark ghost is KIND-GATED (team/player only)', () => {
  const save = vi.fn(async () => {})

  it('sport / competition → NO ghost (no notes column at any layer)', () => {
    renderInspector(rec('sport:1'), [], vi.fn(), save)
    expect(screen.queryByTestId('ops-record-add-remark')).toBeNull()
    cleanup()
    renderInspector(rec('competition:101'), [], vi.fn(), save)
    expect(screen.queryByTestId('ops-record-add-remark')).toBeNull()
  })

  it('team & player → ghost present when onSaveRemark is supplied', () => {
    renderInspector(rec('team:1'), [], vi.fn(), save)
    expect(screen.getByTestId('ops-record-add-remark')).toBeTruthy()
    cleanup()
    renderInspector(rec('player:1'), [], vi.fn(), save)
    expect(screen.getByTestId('ops-record-add-remark')).toBeTruthy()
  })

  it('ghost is hidden when no onSaveRemark handler is passed (inert absent)', () => {
    renderInspector(rec('team:1')) // no onSaveRemark
    expect(screen.queryByTestId('ops-record-add-remark')).toBeNull()
  })

  it('label keys on the notes VALUE: "+ ADD REMARK" (no notes) vs "EDIT REMARK" (has notes)', () => {
    renderInspector(rec('team:2'), [], vi.fn(), save) // no notes
    expect(screen.getByTestId('ops-record-add-remark').textContent).toBe('+ ADD REMARK')
    cleanup()
    renderInspector(rec('team:1'), [], vi.fn(), save) // has notes
    expect(screen.getByTestId('ops-record-add-remark').textContent).toBe('EDIT REMARK')
  })
})

describe('RecordInspector v1.1 — remark editor', () => {
  it('clicking the ghost opens a textarea + SAVE/CANCEL, prefilled with the current note', () => {
    renderInspector(rec('team:1'), [], vi.fn(), vi.fn(async () => {}))
    fireEvent.click(screen.getByTestId('ops-record-add-remark'))

    const input = screen.getByTestId('ops-record-remark-input') as HTMLTextAreaElement
    expect(input.value).toBe('Promoted from the second division')
    expect(screen.getByTestId('ops-record-remark-save')).toBeTruthy()
    expect(screen.getByTestId('ops-record-remark-cancel')).toBeTruthy()
  })

  it('CANCEL → back to the ghost, onSaveRemark NOT called, draft discarded', () => {
    const save = vi.fn(async () => {})
    renderInspector(rec('team:2'), [], vi.fn(), save)
    fireEvent.click(screen.getByTestId('ops-record-add-remark'))
    fireEvent.change(screen.getByTestId('ops-record-remark-input'), { target: { value: 'draft text' } })
    fireEvent.click(screen.getByTestId('ops-record-remark-cancel'))

    expect(save).not.toHaveBeenCalled()
    expect(screen.queryByTestId('ops-record-remark-input')).toBeNull()
    expect(screen.getByTestId('ops-record-add-remark')).toBeTruthy()
  })

  it('SAVE calls onSaveRemark(record, draft) exactly ONCE (single-flight)', async () => {
    const d = deferred<void>()
    const save = vi.fn(() => d.promise)
    renderInspector(rec('team:2'), [], vi.fn(), save)
    fireEvent.click(screen.getByTestId('ops-record-add-remark'))
    fireEvent.change(screen.getByTestId('ops-record-remark-input'), { target: { value: 'A new remark' } })

    // two rapid SAVE intents before resolution → the isSavingRef latch (+ disabled
    // button as the secondary layer) collapse them to ONE call.
    fireEvent.click(screen.getByTestId('ops-record-remark-save'))
    fireEvent.click(screen.getByTestId('ops-record-remark-save'))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(rec('team:2'), 'A new remark')
    d.resolve()
    await waitFor(() => expect(screen.queryByTestId('ops-record-remark-input')).toBeNull())
  })

  it('SAVE success → editor closes (back to the ghost)', async () => {
    const save = vi.fn(async () => {})
    renderInspector(rec('team:2'), [], vi.fn(), save)
    fireEvent.click(screen.getByTestId('ops-record-add-remark'))
    fireEvent.change(screen.getByTestId('ops-record-remark-input'), { target: { value: 'Saved remark' } })
    fireEvent.click(screen.getByTestId('ops-record-remark-save'))

    await waitFor(() => expect(screen.queryByTestId('ops-record-remark-input')).toBeNull())
    expect(screen.getByTestId('ops-record-add-remark')).toBeTruthy()
  })

  it('key={record.id}: switching the selected record REMOUNTS the editor (a draft never carries across records)', () => {
    const save = vi.fn(async () => {})
    const { rerender } = render(
      <RecordInspector record={rec('team:1')} linkedSections={[]} onHop={vi.fn()} onSaveRemark={save} />,
    )
    // open the editor on team:1 and type a draft
    fireEvent.click(screen.getByTestId('ops-record-add-remark'))
    fireEvent.change(screen.getByTestId('ops-record-remark-input'), { target: { value: "team:1's draft" } })
    expect(screen.getByTestId('ops-record-remark-input')).toBeTruthy()

    // hop to a DIFFERENT team — the editor must remount closed (no carried draft)
    rerender(<RecordInspector record={rec('team:2')} linkedSections={[]} onHop={vi.fn()} onSaveRemark={save} />)

    expect(screen.queryByTestId('ops-record-remark-input')).toBeNull() // editor closed
    expect(screen.getByTestId('ops-record-add-remark')).toBeTruthy() // back to the ghost
    expect(save).not.toHaveBeenCalled()
  })

  it('SAVE failure → editor STAYS OPEN with an inline error; SAVE re-enabled', async () => {
    const d = deferred<void>()
    const save = vi.fn(() => d.promise)
    renderInspector(rec('team:2'), [], vi.fn(), save)
    fireEvent.click(screen.getByTestId('ops-record-add-remark'))
    fireEvent.change(screen.getByTestId('ops-record-remark-input'), { target: { value: 'x' } })
    fireEvent.click(screen.getByTestId('ops-record-remark-save'))

    d.reject(new Error('boom'))
    const err = await screen.findByTestId('ops-record-remark-error')
    expect(err.textContent).toContain('Could not save the remark')
    expect(err.style.color).toBe('var(--alert-danger)')
    // still in edit mode; SAVE re-enabled
    expect(screen.getByTestId('ops-record-remark-input')).toBeTruthy()
    expect((screen.getByTestId('ops-record-remark-save') as HTMLButtonElement).disabled).toBe(false)
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
