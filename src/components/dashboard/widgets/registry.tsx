import type { ComponentType } from 'react'
import { LiveNowWidget } from './LiveNowWidget'
import { UpcomingTodayWidget } from './UpcomingTodayWidget'
import { ExpiringRightsWidget } from './ExpiringRightsWidget'
import { RightsIssuesWidget } from './RightsIssuesWidget'
import { RightsMatrixPanel } from '../../contracts/RightsMatrixPanel'

/**
 * Map widget id → React component. Ids are the same strings used in
 * {@link DEFAULT_DASHBOARD_WIDGETS}. A widget without an entry here
 * renders as a "Coming soon" placeholder instead of the previous
 * always-"Widget placeholder" string, so operators can tell which
 * surfaces are live vs. planned.
 *
 * Some widgets (rightsMatrix) are also rendered inline on their
 * role's main page; the dashboard shows the same component in its
 * own tile. A visual consolidation (dashboard = summary, role page =
 * full view) is a design pass for later.
 */
export const WIDGET_REGISTRY: Record<string, ComponentType> = {
  liveNow: LiveNowWidget,
  upcomingToday: UpcomingTodayWidget,
  expiryAlerts: ExpiringRightsWidget,
  rightsIssues: RightsIssuesWidget,
  rightsMatrix: RightsMatrixPanel,
}

export function getWidgetComponent(id: string): ComponentType | null {
  return WIDGET_REGISTRY[id] ?? null
}
