/**
 * FmCreateModal — composition/interaction tests (Story FM1-6, FM1-6-T1).
 * Design: docs/design_handoff_planza_fm/README.md §8b.
 *
 * `DynamicEventForm` and `RegistryCreateModal` are MOCKED here — this suite
 * proves ONLY FmCreateModal's OWN contract: kind-tab switching, prop
 * passthrough (eventFields/sports unchanged, no new field logic), the
 * interim-bridge navigation target per kind, cancel-with-no-side-effects,
 * and that a thrown/failed save is NOT swallowed (surfaces exactly as the
 * wrapped component's own error state would, unmodified). Each wrapped
 * component's OWN internals (field rendering, single-flight submit, 409
 * handling, discard-dialog) are covered by their own existing suites
 * (DynamicEventForm's various hook tests; RegistryCreateModal.test.tsx) —
 * re-testing them here would duplicate coverage across a component boundary
 * this story explicitly forbids adding new logic to.
 *
 * The DynamicEventForm mock reproduces the REAL component's own
 * try/onSave/catch shape (see DynamicEventForm.tsx's `handleSave`) just
 * enough to prove FmCreateModal's `onSave` wiring either resolves (and
 * FmCreateModal reacts: navigate + toast) or throws (and the thrower's
 * caller — here, the mock standing in for DynamicEventForm — is the one
 * that catches it, not FmCreateModal).
 *
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Event, FieldConfig, Sport } from '../../data/types'
import { FmToastHost } from './FmToast'

// ---------------------------------------------------------------------------
// Mocks — DynamicEventForm and RegistryCreateModal are reused, unmodified,
// production components (Story FM1-6 Interfaces: "no new mutation logic").
// Mocking them here is scoped to THIS file's composition tests only.
// ---------------------------------------------------------------------------
vi.mock('../forms/DynamicEventForm', () => ({
  DynamicEventForm: ({
    eventFields,
    onClose,
    onSave,
  }: {
    eventFields: FieldConfig[]
    onClose: () => void
    onSave: (ev: Event) => void | Promise<void>
  }) => {
    // Local mirror of DynamicEventForm's own handleSave try/catch shape —
    // proves FmCreateModal's onSave either resolves (caller reacts) or
    // throws (caller — here, this stand-in — surfaces it), unswallowed.
    function Body() {
      const [error, setError] = useState<string | null>(null)
      return (
        <div data-testid="mock-dynamic-event-form">
          <span data-testid="mock-dynamic-event-form-fields-count">{eventFields.length}</span>
          <button
            type="button"
            data-testid="mock-dynamic-event-form-save"
            onClick={() =>
              onSave({ id: 42, content: 'Cycling relay', participants: 'Team A vs Team B' } as Event)
            }
          >
            SAVE
          </button>
          <button
            type="button"
            data-testid="mock-dynamic-event-form-save-fail"
            onClick={async () => {
              try {
                await onSave({ id: 43 } as Event)
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : String(caught))
              }
            }}
          >
            SAVE_FAIL
          </button>
          {error && <div data-testid="mock-dynamic-event-form-error">{error}</div>}
          <button type="button" data-testid="mock-dynamic-event-form-cancel" onClick={onClose}>
            CANCEL
          </button>
        </div>
      )
    }
    return <Body />
  },
}))

vi.mock('../ops/RegistryCreateModal', () => ({
  RegistryCreateModal: ({
    sports,
    onCancel,
    onCreated,
    initialKind,
  }: {
    sports: Sport[]
    onCancel: () => void
    onCreated: (kind: string, id: number) => void
    initialKind?: string
  }) => (
    <div data-testid="mock-registry-create-modal">
      <span data-testid="mock-registry-initial-kind">{initialKind}</span>
      <span data-testid="mock-registry-sports-count">{sports.length}</span>
      <button
        type="button"
        data-testid="mock-registry-create"
        onClick={() => onCreated(initialKind ?? 'team', 7)}
      >
        CREATE
      </button>
      <button type="button" data-testid="mock-registry-cancel" onClick={onCancel}>
        CANCEL
      </button>
    </div>
  ),
}))

import { FmCreateModal } from './FmCreateModal'

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{location.pathname + location.search}</span>
}

const EVENT_FIELDS: FieldConfig[] = [
  { id: 'sport', label: 'Sport', type: 'text', required: true, visible: true, order: 1 },
  { id: 'content', label: 'Content', type: 'text', required: false, visible: true, order: 2 },
]

const SPORTS: Sport[] = [
  { id: 1, name: 'Football', icon: '⚽', federation: 'FIFA' },
  { id: 2, name: 'Cycling', icon: '🚴', federation: 'UCI' },
]

function renderModal(overrides?: {
  onClose?: () => void
  handleSaveEvent?: (ev: Event) => Promise<Event | null>
}) {
  const onClose = overrides?.onClose ?? vi.fn()
  const handleSaveEvent =
    overrides?.handleSaveEvent ??
    vi.fn().mockResolvedValue({ id: 42, content: 'Cycling relay', participants: 'Team A vs Team B' } as Event)

  render(
    <MemoryRouter initialEntries={['/fm/home']}>
      <FmToastHost>
        <FmCreateModal eventFields={EVENT_FIELDS} sports={SPORTS} handleSaveEvent={handleSaveEvent} onClose={onClose} />
        <LocationProbe />
      </FmToastHost>
    </MemoryRouter>,
  )
  return { onClose, handleSaveEvent }
}

const currentLocation = () => screen.getByTestId('location').textContent

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
})

describe('kind tabs (Story FM1-6 AC: TRANSMISSION default / TEAM / ATHLETE / COMPETITION)', () => {
  it('renders the four tabs in order with TRANSMISSION active by default', () => {
    renderModal()

    expect(
      screen.getAllByRole('tab').map((el) => el.textContent),
    ).toEqual(['TRANSMISSION', 'TEAM', 'ATHLETE', 'COMPETITION'])
    expect(screen.getByTestId('fm-create-tab-transmission').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('mock-dynamic-event-form')).toBeTruthy()
    expect(screen.queryByTestId('mock-registry-create-modal')).toBeNull()
  })

  it('switching to TEAM wraps RegistryCreateModal seeded to the "team" internal kind', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('fm-create-tab-team'))

    expect(screen.getByTestId('fm-create-tab-team').getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByTestId('mock-dynamic-event-form')).toBeNull()
    expect(screen.getByTestId('mock-registry-create-modal')).toBeTruthy()
    expect(screen.getByTestId('mock-registry-initial-kind').textContent).toBe('team')
  })

  it('switching to ATHLETE wraps RegistryCreateModal seeded to the "player" internal kind (label vs. internal kind mismatch — Story FM1-6 resolved wrinkle)', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('fm-create-tab-athlete'))

    expect(screen.getByTestId('mock-registry-initial-kind').textContent).toBe('player')
  })

  it('switching to COMPETITION wraps RegistryCreateModal seeded to the "competition" internal kind', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('fm-create-tab-competition'))

    expect(screen.getByTestId('mock-registry-initial-kind').textContent).toBe('competition')
  })

  it('switching back to TRANSMISSION re-wraps DynamicEventForm with the caller-supplied eventFields unchanged', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('fm-create-tab-team'))
    await user.click(screen.getByTestId('fm-create-tab-transmission'))

    expect(screen.getByTestId('mock-dynamic-event-form')).toBeTruthy()
    expect(screen.getByTestId('mock-dynamic-event-form-fields-count').textContent).toBe(
      String(EVENT_FIELDS.length),
    )
  })

  it('passes the caller-supplied sports list through to RegistryCreateModal unchanged', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('fm-create-tab-team'))

    expect(screen.getByTestId('mock-registry-sports-count').textContent).toBe(String(SPORTS.length))
  })
})

describe('TRANSMISSION create → interim-bridge landing (Story FM1-6 AC)', () => {
  it('lands on /ops/schedule?event=<newId> after a successful save', async () => {
    const user = userEvent.setup()
    const handleSaveEvent = vi
      .fn()
      .mockResolvedValue({ id: 42, content: 'Cycling relay', participants: 'Team A vs Team B' } as Event)
    renderModal({ handleSaveEvent })

    await user.click(screen.getByTestId('mock-dynamic-event-form-save'))

    await waitFor(() => expect(currentLocation()).toBe('/ops/schedule?event=42'))
    expect(handleSaveEvent).toHaveBeenCalledTimes(1)
  })

  it('announces the creation via the shared FmToast, not a new mechanism', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('mock-dynamic-event-form-save'))

    await waitFor(() => expect(screen.getByTestId('fm-toast')).toBeTruthy())
    expect(screen.getByTestId('fm-toast').textContent).toContain('TRANSMISSION')
  })
})

describe('TEAM/ATHLETE/COMPETITION create → interim-bridge landing (Story FM1-6 AC)', () => {
  it('TEAM: lands on /ops/registry?record=team:<id> (makeRecordId format, not a bare id)', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByTestId('fm-create-tab-team'))
    await user.click(screen.getByTestId('mock-registry-create'))

    await waitFor(() => expect(currentLocation()).toBe('/ops/registry?record=team:7'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ATHLETE: lands on /ops/registry?record=player:<id> (outer "athlete" maps to registry "player")', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('fm-create-tab-athlete'))
    await user.click(screen.getByTestId('mock-registry-create'))

    await waitFor(() => expect(currentLocation()).toBe('/ops/registry?record=player:7'))
  })

  it('COMPETITION: lands on /ops/registry?record=competition:<id>', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('fm-create-tab-competition'))
    await user.click(screen.getByTestId('mock-registry-create'))

    await waitFor(() => expect(currentLocation()).toBe('/ops/registry?record=competition:7'))
  })

  it('closes the modal on successful registry create (RegistryCreateModal does not self-close — the caller must)', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByTestId('fm-create-tab-competition'))
    await user.click(screen.getByTestId('mock-registry-create'))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

describe('cancel (Story FM1-6 AC: closes with no side effects)', () => {
  it('the wrapped TRANSMISSION form\'s own cancel closes FmCreateModal, no navigation, no toast', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByTestId('mock-dynamic-event-form-cancel'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(currentLocation()).toBe('/fm/home')
    expect(screen.queryByTestId('fm-toast')).toBeNull()
  })

  it('the wrapped registry modal\'s own cancel closes FmCreateModal, no navigation, no toast', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByTestId('fm-create-tab-team'))
    await user.click(screen.getByTestId('mock-registry-cancel'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(currentLocation()).toBe('/fm/home')
    expect(screen.queryByTestId('fm-toast')).toBeNull()
  })

  it('FmCreateModal\'s own close (✕) closes with no side effects', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByTestId('fm-create-close'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(currentLocation()).toBe('/fm/home')
  })

  it('clicking the scrim (outside the panel) closes with no side effects', async () => {
    const { onClose } = renderModal()

    screen.getByTestId('fm-create-scrim').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking inside the panel does NOT close (no accidental scrim-close)', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByTestId('fm-create-modal'))

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('error passthrough (Story FM1-6 AC: surfaces exactly as the wrapped component already does — no new error handling here)', () => {
  it('a failed TRANSMISSION save is NOT swallowed by FmCreateModal — it propagates to the wrapped form\'s own error state, unmodified', async () => {
    const user = userEvent.setup()
    const handleSaveEvent = vi.fn().mockResolvedValue(null) // mirrors App.tsx's own "!saved -> throw" convention
    const { onClose } = renderModal({ handleSaveEvent })

    await user.click(screen.getByTestId('mock-dynamic-event-form-save-fail'))

    await waitFor(() => expect(screen.getByTestId('mock-dynamic-event-form-error')).toBeTruthy())
    expect(screen.getByTestId('mock-dynamic-event-form-error').textContent).toBe('Save failed')
    // FmCreateModal itself did nothing on this failure: no navigation, no toast, no close.
    expect(currentLocation()).toBe('/fm/home')
    expect(screen.queryByTestId('fm-toast')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})
