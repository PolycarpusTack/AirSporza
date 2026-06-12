/**
 * E2E smoke for INCREMENTAL_LOADING (B-4-T3): first page renders, remaining
 * pages stream and merge, socket inserts still land, flag-off is unchanged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider, useApp } from './AppProvider'
import type { Event } from '../data/types'

const PAGE_1: Event[] = [
  { id: 1, sportId: 1, competitionId: 1, participants: 'A vs B', startDateBE: '2026-06-12', startTimeBE: '18:00', isLive: false, isDelayedLive: false, customFields: {}, status: 'draft' },
  { id: 2, sportId: 1, competitionId: 1, participants: 'C vs D', startDateBE: '2026-06-12', startTimeBE: '20:00', isLive: false, isDelayedLive: false, customFields: {}, status: 'draft' },
]
const PAGE_2: Event[] = [
  { id: 3, sportId: 1, competitionId: 1, participants: 'E vs F', startDateBE: '2026-06-13', startTimeBE: '18:00', isLive: false, isDelayedLive: false, customFields: {}, status: 'draft' },
]

const listMock = vi.fn()
const listPagedMock = vi.fn()
const socketHandlers = new Map<string, (payload: unknown) => void>()

vi.mock('../services', () => ({
  eventsApi: {
    list: (...args: unknown[]) => listMock(...args),
    listPaged: (...args: unknown[]) => listPagedMock(...args),
  },
  techPlansApi: { list: () => Promise.resolve([]) },
  sportsApi: { list: () => Promise.resolve(null) },
  competitionsApi: { list: () => Promise.resolve(null) },
  settingsApi: { getApp: () => Promise.resolve({}) },
}))

const stableUser = { id: 'u1', role: 'planner' }
const stableSocket = {
  on: (eventName: string, handler: (payload: unknown) => void) => {
    socketHandlers.set(eventName, handler)
    return () => socketHandlers.delete(eventName)
  },
}

vi.mock('../hooks', () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
  useSocket: () => stableSocket,
}))

vi.mock('../components/Toast', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))

function EventCount() {
  const { events, loading } = useApp()
  return <div data-testid="count">{loading ? 'loading' : events.length}</div>
}

function renderProvider() {
  return render(
    <MemoryRouter>
      <AppProvider>
        <EventCount />
      </AppProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  listMock.mockReset().mockResolvedValue([...PAGE_1, ...PAGE_2])
  listPagedMock.mockReset().mockImplementation(async (_limit: number, offset: number) => ({
    data: offset === 0 ? PAGE_1 : PAGE_2,
    pagination: { total: 3, limit: 200, offset },
  }))
  socketHandlers.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('flag OFF (default)', () => {
  it('uses the full-list fetch exactly as before — listPaged never called', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('3'))
    expect(listMock).toHaveBeenCalledTimes(1)
    expect(listPagedMock).not.toHaveBeenCalled()
  })
})

describe('flag ON', () => {
  beforeEach(() => vi.stubEnv('VITE_INCREMENTAL_LOADING', 'true'))

  it('renders page 1, loads more, final count matches total', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('3'))
    expect(listPagedMock).toHaveBeenCalledTimes(2)
    expect(listPagedMock).toHaveBeenNthCalledWith(1, 200, 0)
    expect(listPagedMock).toHaveBeenNthCalledWith(2, 200, 2)
    expect(listMock).not.toHaveBeenCalled()
  })

  it('socket event:created still merges into paged state', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('3'))
    const created = socketHandlers.get('event:created')
    expect(created).toBeDefined()
    created!({ ...PAGE_1[0], id: 99, participants: 'Live vs Insert' })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('4'))
  })

  it('socket-inserted row is not duplicated when a later page contains it', async () => {
    let releasePage2: () => void = () => {}
    const page2Gate = new Promise<void>(resolve => { releasePage2 = resolve })
    listPagedMock.mockImplementation(async (_limit: number, offset: number) => {
      if (offset === 0) return { data: PAGE_1, pagination: { total: 3, limit: 200, offset } }
      await page2Gate
      return { data: PAGE_2, pagination: { total: 3, limit: 200, offset } }
    })

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'))
    // socket delivers event 3 BEFORE page 2 arrives with the same id
    socketHandlers.get('event:created')!(PAGE_2[0])
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('3'))
    releasePage2()
    await new Promise(r => setTimeout(r, 50))
    expect(screen.getByTestId('count').textContent).toBe('3') // still 3 — no duplicate
  })
})
