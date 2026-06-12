/**
 * Shared test render wrapper — first occurrence (B-3-T2).
 * Render wrapper ONLY; no further abstraction until a third consumer exists.
 *
 * Provides the real provider stack required by components that call useApp():
 *   MemoryRouter > ToastProvider > AuthProvider > SocketProvider > AppProvider
 *
 * With no auth token in jsdom localStorage the user stays null, so none of
 * these providers fire network requests: AppProvider skips its data fetch and
 * serves built-in defaults (DEFAULT_EVENT_FIELDS, DEFAULT_ORG_CONFIG, SPORTS,
 * COMPETITIONS), and SocketProvider never opens a socket.
 */
import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { AuthProvider } from './hooks/useAuth'
import { SocketProvider } from './hooks/useSocket'
import { AppProvider } from './context/AppProvider'

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <AppProvider>{children}</AppProvider>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return render(ui, { wrapper: AllProviders, ...options })
}
