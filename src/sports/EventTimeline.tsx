import { Card, CardContent, CardHeader, CardTitle, LivePill } from '../components/ui'

export type TimelineItem = {
  minute: number
  label: string
  detail?: string
}

export function EventTimeline({
  title,
  items,
  live = false,
}: {
  title: string
  items: TimelineItem[]
  live?: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {live ? <LivePill /> : null}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {items.map(item => (
            <div key={`${item.minute}-${item.label}`} className="flex gap-3">
              <div className="w-12 shrink-0 text-right text-sm font-extrabold tabular-nums text-primary">
                {item.minute}'
              </div>
              <div className="min-w-0 flex-1 border-l border-border pl-3">
                <div className="text-sm font-semibold">{item.label}</div>
                {item.detail ? <div className="meta mt-1 text-xs">{item.detail}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
