/**
 * OpsTabBadgeContext — the pin-5 mechanism (D-1-T2): lets a nested route-child
 * screen publish its tab-badge count UP to the OpsShell chrome. The shell renders
 * the tab bar; screens are `<Routes>` children, so a prop can't reach up — the
 * screen calls `useSetTabBadge()(tabId, count)` and the shell merges it over the
 * `tabBadges` seed prop.
 *
 * Separate module (not co-located in OpsShell) on purpose: it is TYPE-ONLY coupled
 * to OpsShell (`OpsTabId` is erased at compile time), so a screen importing this
 * context creates NO runtime OpsShell↔SyncScreen value-import cycle.
 *
 * The default is a no-op so the context is unit-testable in isolation (a screen
 * rendered without a Provider simply publishes into the void — never throws).
 */
import { createContext, useContext } from 'react'
import type { OpsTabId } from './OpsShell' // type-only → erased, no runtime cycle

export type SetTabBadge = (tabId: OpsTabId, count: number | undefined) => void

export const OpsTabBadgeContext = createContext<SetTabBadge>(() => {})

export function useSetTabBadge(): SetTabBadge {
  return useContext(OpsTabBadgeContext)
}
