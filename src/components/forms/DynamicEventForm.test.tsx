/**
 * Characterization tests for DynamicEventForm validation (B-3-T2).
 *
 * These tests PIN current behavior — they are not a spec of desired behavior.
 * Surprising behaviors are marked PINNED with a note; fixes belong to later
 * EPIC C tasks, not here.
 *
 * Role visibility note (B-1 coordination): the frontend has NO visibleByRoles
 * logic. Rendering is driven purely by the `eventFields` prop (`visible` flag +
 * `order`) and by whatever fieldsApi.list returns for API custom fields. The
 * shared FieldDefinition type carries `visibleByRoles`, but the form's
 * ApiFieldDef ignores it — API-side enforcement (B-1) is the only gate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import type { ComponentProps } from 'react'
import { DynamicEventForm } from './DynamicEventForm'
import { DEFAULT_EVENT_FIELDS } from '../../data'
import type { Event, Channel, FieldDefinition, MandatoryFieldConfig } from '../../data/types'
import { renderWithProviders } from '../../test-utils'
import { fieldsApi } from '../../services/fields'
import { channelsApi } from '../../services/channels'
import { conflictsApi } from '../../services/conflicts'
import { importsApi } from '../../services/imports'

// ── Module mocks ──────────────────────────────────────────────────────────────

// lucide-react is a huge icon barrel pulled in transitively (Modal, Toast,
// SaveFooter, ...). Mock it to keep collection time well under the 30s gate.
vi.mock('lucide-react', () => {
  const Icon = () => null
  return new Proxy(
    {},
    {
      get: (_target, prop) => (prop === 'then' ? undefined : Icon),
      has: () => true,
    },
  )
})

// Service mocks — the network layer is never hit.

vi.mock('../../services/fields', () => ({
  fieldsApi: { list: vi.fn(), getMandatory: vi.fn() },
}))
vi.mock('../../services/channels', () => ({
  channelsApi: { list: vi.fn() },
}))
vi.mock('../../services/conflicts', () => ({
  conflictsApi: { check: vi.fn() },
}))
vi.mock('../../services/imports', () => ({
  importsApi: { searchUnlinked: vi.fn() },
}))

const fieldsList = vi.mocked(fieldsApi.list)
const getMandatory = vi.mocked(fieldsApi.getMandatory)
const channelsList = vi.mocked(channelsApi.list)
const conflictCheck = vi.mocked(conflictsApi.check)
const searchUnlinked = vi.mocked(importsApi.searchUnlinked)

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeApiField(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cf_notes',
    label: 'Broadcast Notes',
    fieldType: 'text',
    required: true,
    visible: true,
    options: [],
    ...overrides,
  } as unknown as FieldDefinition
}

function makeMandatoryCfg(fieldIds: string[]): MandatoryFieldConfig {
  return { id: 'm1', sportId: 1, fieldIds, conditionalRequired: [] } as unknown as MandatoryFieldConfig
}

function makeChannel(id: number, name: string): Channel {
  return { id, name, parentId: null, sortOrder: 0 } as unknown as Channel
}

function makeEditEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 77,
    sportId: 1,
    competitionId: 2,
    phase: 'Final',
    category: 'Men',
    participants: 'Team A vs Team B',
    content: '',
    startDateBE: '2026-06-20',
    startTimeBE: '18:00',
    isLive: true,
    isDelayedLive: false,
    customFields: {},
    status: 'draft',
    ...overrides,
  } as Event
}

// ── Render helpers ────────────────────────────────────────────────────────────

type FormProps = ComponentProps<typeof DynamicEventForm>

async function renderForm(overrides: Partial<Omit<FormProps, 'onClose' | 'onSave'>> = {}) {
  const onClose = vi.fn()
  const onSave = vi.fn().mockResolvedValue(undefined)
  const view = renderWithProviders(
    <DynamicEventForm
      eventFields={DEFAULT_EVENT_FIELDS}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />,
  )
  // Flush the mount-time fieldsApi.list effect so state updates stay inside act
  await waitFor(() => expect(fieldsList).toHaveBeenCalled())
  return { ...view, onClose, onSave }
}

/** Find the <select> that owns an option with the given label. */
function selectWithOption(label: string): HTMLSelectElement {
  const opt = screen.getByRole('option', { name: label })
  const sel = opt.closest('select')
  if (!sel) throw new Error(`option "${label}" is not inside a select`)
  return sel
}

/**
 * Fill the five required essential fields (minimal mode).
 * Labels are NOT programmatically associated with inputs (no htmlFor/id), so
 * fields are located structurally — see findings.
 */
async function fillEssentials(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
  { participants = true }: { participants?: boolean } = {},
) {
  await user.selectOptions(selectWithOption('⚽ Football'), '1')
  await user.selectOptions(selectWithOption('Jupiler Pro League'), '1')
  if (participants) {
    // First textbox is always participants (API custom text fields render after
    // the core grid). fireEvent keeps this fast; per-keystroke behavior is
    // covered by the error-clearing test.
    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: 'Team A vs Team B' },
    })
  }
  fireEvent.change(container.querySelector('input[type="date"]') as HTMLInputElement, {
    target: { value: '2026-06-20' },
  })
  fireEvent.change(container.querySelector('input[type="time"]') as HTMLInputElement, {
    target: { value: '18:00' },
  })
}

const saveButton = () => screen.getByRole('button', { name: 'Create Event' })

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  fieldsList.mockResolvedValue([])
  getMandatory.mockResolvedValue(makeMandatoryCfg([]))
  channelsList.mockResolvedValue([])
  conflictCheck.mockResolvedValue({ warnings: [], errors: [] })
  searchUnlinked.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
})

// ── Rendering: fields-prop driven (no role logic) ─────────────────────────────

describe('DynamicEventForm — field rendering (fields-prop driven)', () => {
  it('minimal mode renders only the six essential fields and a 5-required footer', async () => {
    await renderForm()

    expect(screen.getByText('New Sports Event')).toBeInTheDocument()
    // Essential fields present
    expect(screen.getByText('Sport')).toBeInTheDocument()
    expect(screen.getByText('Competition')).toBeInTheDocument()
    expect(screen.getByText('Participants / Match')).toBeInTheDocument()
    expect(screen.getByText('Start Date (Belgian)')).toBeInTheDocument()
    expect(screen.getByText('Start Time (Belgian)')).toBeInTheDocument()
    expect(screen.getByText('Linear Channel')).toBeInTheDocument()
    // Non-essential fields hidden until "Show all fields..."
    expect(screen.queryByText('Match Phase')).not.toBeInTheDocument()
    expect(screen.queryByText('Winner')).not.toBeInTheDocument()
    expect(screen.getByText('Show all fields...')).toBeInTheDocument()
    // requiredCount = visible fields with required: true (5 of the defaults)
    expect(screen.getByText('5 required fields')).toBeInTheDocument()
  })

  it('show-all mode: Core/Scheduling open, Broadcast/Reference collapsed — Linear Channel disappears (PINNED quirk)', async () => {
    const user = userEvent.setup()
    await renderForm()

    expect(screen.getByText('Linear Channel')).toBeInTheDocument()
    await user.click(screen.getByText('Show all fields...'))

    // Core + Scheduling sections default open
    expect(screen.getByText('Match Phase')).toBeInTheDocument()
    expect(screen.getByText('On-demand Available From (date)')).toBeInTheDocument()
    // PINNED: Broadcast section defaults collapsed in show-all mode, so the
    // Linear Channel field that minimal mode showed is now hidden.
    expect(screen.queryByText('Linear Channel')).not.toBeInTheDocument()
    expect(screen.queryByText('Radio Channel')).not.toBeInTheDocument()
    expect(screen.queryByText('Winner')).not.toBeInTheDocument()

    // Expanding Broadcast reveals its fields
    await user.click(screen.getByRole('button', { name: /Broadcast/ }))
    expect(screen.getByText('Radio Channel')).toBeInTheDocument()
    expect(screen.getByText('Linear Channel')).toBeInTheDocument()
  })

  it('visible:false fields never render — visibility is purely fields-prop driven, no role logic', async () => {
    const user = userEvent.setup()
    const fields = DEFAULT_EVENT_FIELDS.map(f =>
      f.id === 'participants' ? { ...f, visible: false } : f,
    )
    await renderForm({ eventFields: fields })

    expect(screen.queryByText('Participants / Match')).not.toBeInTheDocument()
    // Required count drops with it: only visible fields are counted
    expect(screen.getByText('4 required fields')).toBeInTheDocument()

    await user.click(screen.getByText('Show all fields...'))
    expect(screen.queryByText('Participants / Match')).not.toBeInTheDocument()
  })

  it('readOnly: lock banner, Read-only footer, disabled inputs, no save button', async () => {
    await renderForm({ readOnly: true })

    expect(screen.getByText('View Event (Locked)')).toBeInTheDocument()
    expect(
      screen.getByText('This event is locked and cannot be edited.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Read-only')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Event' })).not.toBeInTheDocument()
    // fieldset[disabled] propagates to the participants input
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('edit mode: all sections open immediately, values prefilled, Save Changes button', async () => {
    await renderForm({ editEvent: makeEditEvent() })

    expect(screen.getByText('Edit Event')).toBeInTheDocument()
    expect(screen.queryByText('Show all fields...')).not.toBeInTheDocument()
    // All sections default open when editing — Reference fields visible
    expect(screen.getByText('Winner')).toBeInTheDocument()
    // Prefill: sportId/competitionId come back as select values
    expect(selectWithOption('⚽ Football')).toHaveValue('1')
    expect(selectWithOption('Champions League')).toHaveValue('2')
    expect(screen.getByDisplayValue('Team A vs Team B')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
  })
})

// ── Required-field validation ─────────────────────────────────────────────────

describe('DynamicEventForm — required-field validation', () => {
  it('empty submit: sport/competition show "Valid ... required", other required fields show "Required"; nothing saved', async () => {
    const user = userEvent.setup()
    const { onSave } = await renderForm()

    await user.click(saveButton())

    // PINNED: the generic 'Required' for sport/competition is overwritten by
    // the parseInt check messages.
    expect(screen.getByText('Valid sport required')).toBeInTheDocument()
    expect(screen.getByText('Valid competition required')).toBeInTheDocument()
    // participants, startDateBE, startTimeBE
    expect(screen.getAllByText('Required')).toHaveLength(3)
    expect(onSave).not.toHaveBeenCalled()
    // Validation fails before the conflict preflight runs
    expect(conflictCheck).not.toHaveBeenCalled()
    // Save button returns to idle
    expect(saveButton()).toBeEnabled()
  })

  it('typing into a field clears its error', async () => {
    const user = userEvent.setup()
    await renderForm()

    await user.click(saveButton())
    expect(screen.getAllByText('Required')).toHaveLength(3)

    await user.type(screen.getByRole('textbox'), 'A')
    expect(screen.getAllByText('Required')).toHaveLength(2)
  })

  it('whitespace-only value passes the required check (PINNED: no trim on core fields)', async () => {
    const user = userEvent.setup()
    await renderForm()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' ' } })
    await user.click(saveButton())

    // Only the two date/time 'Required' errors remain — ' ' is accepted
    expect(screen.getAllByText('Required')).toHaveLength(2)
  })

  it('a required field hidden via visible:false is skipped by validation and saved empty (PINNED)', async () => {
    const user = userEvent.setup()
    const fields = DEFAULT_EVENT_FIELDS.map(f =>
      f.id === 'participants' ? { ...f, visible: false } : f,
    )
    const { container, onSave } = await renderForm({ eventFields: fields })

    await fillEssentials(user, container, { participants: false })
    await user.click(saveButton())

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ participants: '' }))
  })

  it('duration must match SMPTE HH:MM:SS;FF when set', async () => {
    const user = userEvent.setup()
    const { onSave } = await renderForm()

    await user.click(screen.getByText('Show all fields...'))
    // duration lives in the Scheduling section (open by default)
    await user.type(screen.getByPlaceholderText('HH:MM:SS;FF'), '99:99')
    await user.click(saveButton())

    expect(
      screen.getByText('Format: HH:MM:SS;FF (e.g. 01:45:22;12)'),
    ).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })
})

// ── Type coercion ─────────────────────────────────────────────────────────────

describe('DynamicEventForm — type coercion', () => {
  it('happy path: sport/competition coerced to numbers, empty channel becomes null, date/time stay strings', async () => {
    const user = userEvent.setup()
    const { container, onSave } = await renderForm()

    await fillEssentials(user, container)
    await user.click(saveButton())

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(Number),
        sportId: 1,
        competitionId: 1,
        participants: 'Team A vs Team B',
        startDateBE: '2026-06-20',
        startTimeBE: '18:00',
        channelId: null,
        radioChannelId: null,
        onDemandChannelId: null,
        isLive: false,
        customValues: [],
      }),
    )
    // Conflict preflight also receives the numeric competitionId
    expect(conflictCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId: 1,
        channelId: undefined,
        startDateBE: '2026-06-20',
        startTimeBE: '18:00',
      }),
    )
  })

  it('selected channel option (string value) is coerced to a numeric channelId', async () => {
    const user = userEvent.setup()
    channelsList.mockResolvedValue([makeChannel(7, 'VRT 1')])
    const { container, onSave } = await renderForm()

    const opt = await screen.findByRole('option', { name: 'VRT 1' })
    await user.selectOptions(opt.closest('select') as HTMLSelectElement, '7')
    await fillEssentials(user, container)
    await user.click(saveButton())

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ channelId: 7 }))
    expect(conflictCheck).toHaveBeenCalledWith(expect.objectContaining({ channelId: 7 }))
  })

  it('channel id 0 collapses to null (PINNED: Number(x) || null falsy coercion)', async () => {
    const user = userEvent.setup()
    channelsList.mockResolvedValue([makeChannel(0, 'Legacy Channel')])
    const { container, onSave } = await renderForm()

    const opt = await screen.findByRole('option', { name: 'Legacy Channel' })
    await user.selectOptions(opt.closest('select') as HTMLSelectElement, '0')
    await fillEssentials(user, container)
    await user.click(saveButton())

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ channelId: null }))
  })

  it('number-type custom field is stored as a string in customFields (PINNED: no numeric coercion)', async () => {
    const user = userEvent.setup()
    const fields = [
      ...DEFAULT_EVENT_FIELDS,
      {
        id: 'attendance', label: 'Attendance', type: 'number' as const,
        required: false, visible: true, order: 23, isCustom: true,
      },
    ]
    const { container, onSave } = await renderForm({ eventFields: fields })

    await fillEssentials(user, container)
    await user.click(screen.getByText('Show all fields...'))
    await user.click(screen.getByRole('button', { name: /Custom Fields/ }))
    fireEvent.change(container.querySelector('input[type="number"]') as HTMLInputElement, {
      target: { value: '42' },
    })
    await user.click(saveButton())

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        customFields: expect.objectContaining({ attendance: '42' }),
      }),
    )
  })
})

// ── Conflict gating ───────────────────────────────────────────────────────────

describe('DynamicEventForm — conflict preflight gating', () => {
  it('warnings block the first save; the second save proceeds', async () => {
    const user = userEvent.setup()
    conflictCheck.mockResolvedValue({
      warnings: [{ type: 'channel_overlap', message: 'Overlaps with Tour de France' }],
      errors: [],
    })
    const { container, onSave } = await renderForm()
    await fillEssentials(user, container)

    await user.click(saveButton())
    expect(
      await screen.findByText('Warnings found — click Save again to proceed anyway.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Overlaps with Tour de France')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()

    await user.click(saveButton())
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(conflictCheck).toHaveBeenCalledTimes(2)
  })

  it('errors always block, even on repeated save', async () => {
    const user = userEvent.setup()
    conflictCheck.mockResolvedValue({
      warnings: [],
      errors: [{ type: 'rights_violation', message: 'No broadcast rights for this window' }],
    })
    const { container, onSave } = await renderForm()
    await fillEssentials(user, container)

    await user.click(saveButton())
    expect(
      await screen.findByText('No broadcast rights for this window'),
    ).toBeInTheDocument()
    await user.click(saveButton())

    expect(onSave).not.toHaveBeenCalled()
    expect(conflictCheck).toHaveBeenCalledTimes(2)
  })

  it('conflict API failure fails VISIBLE — warning shown, save blocked until explicit second save', async () => {
    // TD-18 fix (C-0-T4): the preflight previously returned 'pass' on API
    // failure and the save proceeded silently (B-3-T2 finding 6). It now
    // surfaces an "unavailable" warning through the existing conflict-warning
    // UI and requires the same click-Save-again confirm as real warnings.
    const user = userEvent.setup()
    conflictCheck.mockRejectedValue(new Error('network down'))
    const { container, onSave } = await renderForm()
    await fillEssentials(user, container)

    await user.click(saveButton())

    expect(
      await screen.findByText('Conflict check unavailable — conflicts could not be verified.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Warnings found — click Save again to proceed anyway.'),
    ).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    expect(saveButton()).toBeEnabled() // back to idle, awaiting explicit confirm

    await user.click(saveButton())
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(conflictCheck).toHaveBeenCalledTimes(2)
  })
})

// ── API custom-field validation ───────────────────────────────────────────────

describe('DynamicEventForm — API custom-field validation', () => {
  it('required API custom field blocks save, but only AFTER the conflict check ran (PINNED order)', async () => {
    const user = userEvent.setup()
    fieldsList.mockResolvedValue([makeApiField()])
    const { container, onSave } = await renderForm()

    expect(await screen.findByText('Broadcast Notes')).toBeInTheDocument()
    await fillEssentials(user, container)
    await user.click(saveButton())

    expect(await screen.findByText('Required')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    // PINNED: conflict preflight fires before custom-field validation
    expect(conflictCheck).toHaveBeenCalledTimes(1)
  })

  it('sport-specific mandatory field (fieldsApi.getMandatory) blocks save when empty', async () => {
    const user = userEvent.setup()
    fieldsList.mockResolvedValue([
      makeApiField({ id: 'cf_extra', label: 'Extra Info', required: false }),
    ])
    getMandatory.mockResolvedValue(makeMandatoryCfg(['cf_extra']))
    const { container, onSave } = await renderForm()

    expect(await screen.findByText('Extra Info')).toBeInTheDocument()
    await fillEssentials(user, container)
    await waitFor(() => expect(getMandatory).toHaveBeenCalledWith(1))
    await user.click(saveButton())

    expect(await screen.findByText('Required')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })
})

// ── Save states ───────────────────────────────────────────────────────────────

describe('DynamicEventForm — save states', () => {
  it('onSave rejection shows the error state and keeps the modal open', async () => {
    const user = userEvent.setup()
    const { container, onSave, onClose } = await renderForm()
    onSave.mockRejectedValue(new Error('boom'))
    await fillEssentials(user, container)

    await user.click(saveButton())

    expect(
      await screen.findByRole('button', { name: /Save failed — try again/ }),
    ).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('successful save shows Saved! and closes after a short delay', async () => {
    const user = userEvent.setup()
    const { container, onSave, onClose } = await renderForm()
    await fillEssentials(user, container)

    await user.click(saveButton())

    expect(await screen.findByRole('button', { name: /Saved!/ })).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 1500 })
  })
})
