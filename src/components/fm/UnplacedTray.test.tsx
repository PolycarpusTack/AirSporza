/**
 * UnplacedTray render/interaction tests (FM2-1-T2, README §2 Schedule board —
 * unplaced tray spec). Pure, prop-driven component — no AppProvider, no
 * router, no fetching (anti-smart-ui). FmScheduleBoard.test.tsx owns the
 * wiring-level assertions (PLACE/AUTO-SUGGEST calling the real mutation +
 * refresh); this suite owns the tray's own render states and callback
 * contract in isolation.
 *
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { UnplacedTray, type UnplacedTrayEvent } from './UnplacedTray'

afterEach(() => cleanup())

const HAS_SUGGESTION: UnplacedTrayEvent = {
  eventId: 1,
  title: 'Club Brugge vs Anderlecht',
  candidates: [
    { channelId: 10, channelName: 'Eén', channelLoad: 2 },
    { channelId: 11, channelName: 'Canvas', channelLoad: 3 },
  ],
}

const NO_SAFE_SLOT: UnplacedTrayEvent = {
  eventId: 2,
  title: 'Gent vs Genk',
  candidates: [],
}

describe('label', () => {
  it('shows UNPLACED (n) with the event count', () => {
    render(<UnplacedTray events={[HAS_SUGGESTION, NO_SAFE_SLOT]} onPlace={vi.fn()} onAutoSuggest={vi.fn()} />)
    expect(screen.getByTestId('fm-tray-label')).toHaveTextContent('UNPLACED (2)')
  })

  it('shows UNPLACED (0) when the tray is empty', () => {
    render(<UnplacedTray events={[]} onPlace={vi.fn()} onAutoSuggest={vi.fn()} />)
    expect(screen.getByTestId('fm-tray-label')).toHaveTextContent('UNPLACED (0)')
  })
})

describe('chip states', () => {
  it('has-suggestion chip shows the top-ranked channel name hint, enabled', () => {
    render(<UnplacedTray events={[HAS_SUGGESTION]} onPlace={vi.fn()} onAutoSuggest={vi.fn()} />)
    const chip = screen.getByTestId('fm-tray-chip-1')
    expect(chip).toHaveAttribute('data-suggestion-state', 'has-suggestion')
    expect(chip).not.toBeDisabled()
    expect(within(chip).getByText(/Eén/)).toBeInTheDocument()
  })

  it('no-safe-slot chip shows "no safe slot", disabled, no suggestion hint', () => {
    render(<UnplacedTray events={[NO_SAFE_SLOT]} onPlace={vi.fn()} onAutoSuggest={vi.fn()} />)
    const chip = screen.getByTestId('fm-tray-chip-2')
    expect(chip).toHaveAttribute('data-suggestion-state', 'no-safe-slot')
    expect(chip).toBeDisabled()
    expect(within(chip).getByText('no safe slot')).toBeInTheDocument()
  })

  it('selected event renders in the selected visual state', () => {
    render(
      <UnplacedTray events={[HAS_SUGGESTION]} selectedEventId={1} onPlace={vi.fn()} onAutoSuggest={vi.fn()} />,
    )
    expect(screen.getByTestId('fm-tray-chip-1')).toHaveAttribute('data-selected', 'true')
  })
})

describe('PLACE from a chip', () => {
  it('clicking a has-suggestion chip calls onPlace with the TOP-ranked candidate', async () => {
    const onPlace = vi.fn()
    render(<UnplacedTray events={[HAS_SUGGESTION]} onPlace={onPlace} onAutoSuggest={vi.fn()} />)

    await userEvent.click(screen.getByTestId('fm-tray-chip-1'))

    expect(onPlace).toHaveBeenCalledTimes(1)
    expect(onPlace).toHaveBeenCalledWith(1, 10) // channelId 10 is candidates[0], the ascending-load winner
  })

  it('clicking a no-safe-slot chip does nothing (disabled)', async () => {
    const onPlace = vi.fn()
    render(<UnplacedTray events={[NO_SAFE_SLOT]} onPlace={onPlace} onAutoSuggest={vi.fn()} />)

    await userEvent.click(screen.getByTestId('fm-tray-chip-2'))

    expect(onPlace).not.toHaveBeenCalled()
  })
})

describe('AUTO-SUGGEST SLOTS', () => {
  it('renders and fires onAutoSuggest when there is at least one placeable event', async () => {
    const onAutoSuggest = vi.fn()
    render(<UnplacedTray events={[HAS_SUGGESTION]} onPlace={vi.fn()} onAutoSuggest={onAutoSuggest} />)

    await userEvent.click(screen.getByTestId('fm-tray-auto-suggest'))

    expect(onAutoSuggest).toHaveBeenCalledTimes(1)
  })

  it('is disabled when every event has no safe slot', () => {
    render(<UnplacedTray events={[NO_SAFE_SLOT]} onPlace={vi.fn()} onAutoSuggest={vi.fn()} />)
    expect(screen.getByTestId('fm-tray-auto-suggest')).toBeDisabled()
  })

  it('is not rendered when the tray is empty', () => {
    render(<UnplacedTray events={[]} onPlace={vi.fn()} onAutoSuggest={vi.fn()} />)
    expect(screen.queryByTestId('fm-tray-auto-suggest')).not.toBeInTheDocument()
  })
})
