import type { DashboardWidget } from '../data/types'
import { getWidgetComponent } from '../components/dashboard/widgets/registry'

interface Props {
  widgets: DashboardWidget[]
}

export function DashboardView({ widgets }: Props) {
  const visible = widgets.filter(w => w.visible)
  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div>
        <h1 className="text-lg font-bold font-head">Dashboard</h1>
        <p className="text-xs text-text-3 mt-0.5">Overview of upcoming broadcasts and key metrics</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.length === 0 && (
          <p className="text-sm text-text-3 col-span-full text-center py-12">
            No widgets configured. Customise your dashboard in Settings.
          </p>
        )}
        {visible.map(w => {
          const Widget = getWidgetComponent(w.id)
          return (
            <div key={w.id} className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-text-2">{w.label}</h3>
              {Widget ? (
                <Widget />
              ) : (
                <p className="text-xs text-text-3 mt-2 italic">Coming soon</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
