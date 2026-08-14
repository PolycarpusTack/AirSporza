/**
 * FmNavBadgeContext — sibling to OpsTabBadgeContext (src/components/ops/opsTabBadges.ts),
 * structurally copied, NOT imported (ADR-020, Rule of Three: this is only the
 * 2nd occurrence of "flagged shell + badge-publish context"). Lets a nested
 * route-child screen publish its nav-badge count UP to the FmShell sidebar
 * chrome — the shell renders the sidebar; screens are `<Routes>` children, so
 * a prop can't reach up — a screen calls `useSetNavBadge()(navId, count)` and
 * the shell merges it over its `navBadges` seed prop.
 *
 * Separate module (not co-located in FmShell) for the same reason as
 * opsTabBadges.ts: TYPE-ONLY coupled to FmShell (`FmNavId` is erased at
 * compile time), so a screen importing this context creates NO runtime
 * FmShell↔screen value-import cycle.
 *
 * The default is a no-op so the context is unit-testable in isolation (a
 * screen rendered without a Provider simply publishes into the void — never
 * throws) — see fmNavBadges.test.tsx.
 *
 * FM1-2 ships no real screens yet (every route is PlaceholderPanel), so this
 * context has no live publisher until a later FM task (e.g. FM1-4's Home)
 * wires one in — mirrors OpsTabBadgeContext, which existed before any ops
 * screen actually published to it too.
 */
import { createContext, useContext } from 'react'
import type { FmNavId } from './FmShell' // type-only → erased, no runtime cycle

export type SetNavBadge = (navId: FmNavId, count: number | undefined) => void

export const FmNavBadgeContext = createContext<SetNavBadge>(() => {})

export function useSetNavBadge(): SetNavBadge {
  return useContext(FmNavBadgeContext)
}
