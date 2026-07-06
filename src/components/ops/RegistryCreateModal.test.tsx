/**
 * Interaction tests for the Registry create modal (C-4-T1 — FIRST WRITE PATH).
 * Design: docs/design_handoff_planza_ops/README.md §4 create modal.
 * Write-path guarantees pinned here: single-flight (one request per intent),
 * empty-name no-op, per-kind payload shape, 409-duplicate vs generic error, and
 * the MANUAL provenance note. Services mocked; ApiError drives the error paths.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sport } from '../../data/types'
import { ApiError } from '../../utils/api'

const sportsCreate = vi.fn()
const competitionsCreate = vi.fn()
const teamsCreate = vi.fn()
const playersCreate = vi.fn()

vi.mock('../../services', () => ({
  sportsApi: { create: (...a: unknown[]) => sportsCreate(...a) },
  competitionsApi: { create: (...a: unknown[]) => competitionsCreate(...a) },
  teamsApi: { create: (...a: unknown[]) => teamsCreate(...a) },
  playersApi: { create: (...a: unknown[]) => playersCreate(...a) },
}))

import { RegistryCreateModal } from './RegistryCreateModal'

const SPORTS: Sport[] = [
  { id: 1, name: 'Football', icon: '⚽', federation: 'FIFA' },
  { id: 3, name: 'Cycling', icon: '🚴', federation: 'UCI' },
]

const renderModal = (overrides: Partial<Parameters<typeof RegistryCreateModal>[0]> = {}) => {
  const onCancel = overrides.onCancel ?? vi.fn()
  const onCreated = overrides.onCreated ?? vi.fn()
  render(<RegistryCreateModal sports={SPORTS} onCancel={onCancel} onCreated={onCreated} />)
  return { onCancel, onCreated }
}

const pickKind = (kind: string) => fireEvent.click(screen.getByTestId(`ops-create-kind-${kind}`))
const typeName = (value: string) => fireEvent.change(screen.getByTestId('ops-create-name'), { target: { value } })
const submit = () => fireEvent.click(screen.getByTestId('ops-create-submit'))

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  sportsCreate.mockReset()
  competitionsCreate.mockReset()
  teamsCreate.mockReset()
  playersCreate.mockReset()
})
afterEach(() => cleanup())

describe('RegistryCreateModal — chrome + kind chips', () => {
  it('renders the MANUAL provenance note', () => {
    renderModal()
    expect(screen.getByTestId('ops-create-manual-note').textContent).toContain(
      'CREATED RECORDS ARE SOURCE: MANUAL · PROTECTED FROM SYNC OVERWRITE',
    )
  })

  it('kind chips behave as a radio (default team; selecting player switches)', () => {
    renderModal()
    // default team → no sport select
    expect(screen.queryByTestId('ops-create-sport')).toBeNull()
    pickKind('player')
    expect(screen.getByTestId('ops-create-sport')).toBeTruthy()
  })

  it('per-kind fields render: player/competition → sport select; sport → icon; competition → season', () => {
    renderModal()
    pickKind('sport')
    expect(screen.getByTestId('ops-create-icon')).toBeTruthy()
    expect(screen.queryByTestId('ops-create-season')).toBeNull()

    pickKind('competition')
    expect(screen.getByTestId('ops-create-sport')).toBeTruthy()
    expect(screen.getByTestId('ops-create-season')).toBeTruthy()

    pickKind('team')
    expect(screen.queryByTestId('ops-create-sport')).toBeNull()
    expect(screen.queryByTestId('ops-create-icon')).toBeNull()
  })

  it('backdrop click, ✕ and CANCEL all call onCancel', () => {
    const { onCancel } = renderModal()
    fireEvent.click(screen.getByTestId('ops-create-cancel'))
    fireEvent.click(screen.getByTestId('ops-create-close'))
    fireEvent.click(screen.getByTestId('ops-create-backdrop'))
    expect(onCancel).toHaveBeenCalledTimes(3)
  })
})

describe('RegistryCreateModal — empty name is a no-op', () => {
  it('CREATE fires NO request when the name is empty/whitespace', () => {
    renderModal()
    typeName('   ')
    submit()
    expect(teamsCreate).not.toHaveBeenCalled()
  })
})

describe('RegistryCreateModal — single-flight at the HANDLER level (isSubmittingRef, bypasses the disabled button)', () => {
  it('two direct form submits before resolution → exactly ONE create call (kills the ref-guard mutant)', async () => {
    const d = deferred<{ id: number }>()
    teamsCreate.mockReturnValue(d.promise)
    const { onCreated } = renderModal()
    typeName('Riverside United')

    // fireEvent.submit dispatches the submit event directly — it ignores the
    // disabled button, so ONLY isSubmittingRef can stop the 2nd submit.
    const form = screen.getByTestId('ops-create-form')
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(teamsCreate).toHaveBeenCalledTimes(1)
    d.resolve({ id: 7 })
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated).toHaveBeenCalledWith('team', 7)
  })

  it('empty/whitespace name via direct form submit → NO create call (kills the !hasRequiredFields mutant)', () => {
    renderModal()
    typeName('   ')
    // programmatic submit bypasses the disabled button — only the handler's
    // `if (!hasRequiredFields) return` can stop the request here.
    fireEvent.submit(screen.getByTestId('ops-create-form'))
    expect(teamsCreate).not.toHaveBeenCalled()
  })
})

describe('RegistryCreateModal — single-flight (one request per intent)', () => {
  it('double-click before resolution → exactly ONE create call', async () => {
    const d = deferred<{ id: number }>()
    teamsCreate.mockReturnValue(d.promise)
    renderModal()
    typeName('Riverside United')

    submit()
    submit()
    submit()

    expect(teamsCreate).toHaveBeenCalledTimes(1)
    await waitFor(() => {}) // flush
  })

  it('Enter-submit then click before resolution → exactly ONE create call', async () => {
    const d = deferred<{ id: number }>()
    teamsCreate.mockReturnValue(d.promise)
    const { onCreated } = renderModal()
    typeName('Riverside United')

    // Enter in the name input submits the form; then a click on CREATE
    fireEvent.submit(screen.getByTestId('ops-create-form'))
    submit()

    expect(teamsCreate).toHaveBeenCalledTimes(1)
    d.resolve({ id: 7 })
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('team', 7))
  })
})

describe('RegistryCreateModal — per-kind success payloads', () => {
  it('team → { name } and onCreated("team", id)', async () => {
    teamsCreate.mockResolvedValue({ id: 42 })
    const { onCreated } = renderModal()
    typeName('Riverside United')
    submit()
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('team', 42))
    expect(teamsCreate).toHaveBeenCalledWith({ name: 'Riverside United' })
  })

  it('player → { fullName, sportId } and onCreated("player", id)', async () => {
    playersCreate.mockResolvedValue({ id: 9 })
    const { onCreated } = renderModal()
    pickKind('player')
    typeName('Jonas Vale')
    fireEvent.change(screen.getByTestId('ops-create-sport'), { target: { value: '1' } })
    submit()
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('player', 9))
    expect(playersCreate).toHaveBeenCalledWith({ fullName: 'Jonas Vale', sportId: 1 })
  })

  it('sport → { name, icon, federation: "" } and onCreated("sport", id)', async () => {
    sportsCreate.mockResolvedValue({ id: 5 })
    const { onCreated } = renderModal()
    pickKind('sport')
    typeName('Rowing')
    fireEvent.change(screen.getByTestId('ops-create-icon'), { target: { value: '🚣' } })
    submit()
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('sport', 5))
    expect(sportsCreate).toHaveBeenCalledWith({ name: 'Rowing', icon: '🚣', federation: '' })
  })

  it('competition → { sportId, name, season } and onCreated("competition", id)', async () => {
    competitionsCreate.mockResolvedValue({ id: 11 })
    const { onCreated } = renderModal()
    pickKind('competition')
    typeName('League A')
    fireEvent.change(screen.getByTestId('ops-create-sport'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('ops-create-season'), { target: { value: '2026' } })
    submit()
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('competition', 11))
    expect(competitionsCreate).toHaveBeenCalledWith({ sportId: 3, name: 'League A', season: '2026' })
  })
})

describe('RegistryCreateModal — error contract (409 duplicate vs generic)', () => {
  it('409 → inline duplicate error; modal stays; onCreated NOT called; CREATE re-enabled', async () => {
    teamsCreate.mockRejectedValue(new ApiError(409, 'A team with that name already exists'))
    const { onCreated } = renderModal()
    typeName('Riverside United')
    submit()

    await waitFor(() =>
      expect(screen.getByTestId('ops-create-error').textContent).toContain('already exists'),
    )
    expect(onCreated).not.toHaveBeenCalled()
    expect((screen.getByTestId('ops-create-submit') as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByTestId('ops-create-name') as HTMLInputElement).value).toBe('Riverside United')

    // re-enabled → a second submit fires another request (proving not stuck)
    teamsCreate.mockResolvedValue({ id: 1 })
    submit()
    expect(teamsCreate).toHaveBeenCalledTimes(2)
  })

  it('non-409 → generic inline error; CREATE re-enabled', async () => {
    teamsCreate.mockRejectedValue(new ApiError(500, 'boom'))
    const { onCreated } = renderModal()
    typeName('Riverside United')
    submit()

    await waitFor(() =>
      expect(screen.getByTestId('ops-create-error').textContent).toContain('Could not create the record'),
    )
    expect(onCreated).not.toHaveBeenCalled()
    expect((screen.getByTestId('ops-create-submit') as HTMLButtonElement).disabled).toBe(false)
  })

  it('error styling uses the danger token (non-hex)', async () => {
    teamsCreate.mockRejectedValue(new ApiError(500, 'boom'))
    renderModal()
    typeName('X')
    submit()
    const err = await screen.findByTestId('ops-create-error')
    expect(err.style.color).toBe('var(--alert-danger)')
  })
})
