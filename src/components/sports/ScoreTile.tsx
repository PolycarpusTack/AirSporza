import { Card, CardContent, CardHeader, CardTitle, LivePill, cn } from '../ui'

export type ScoreTileProps = {
  home: string
  away: string
  homeScore?: number
  awayScore?: number
  status: 'FT' | 'LIVE' | 'HT' | 'NS'
  minute?: number
  competition?: string
}

export function ScoreTile({
  home,
  away,
  homeScore,
  awayScore,
  status,
  minute,
  competition,
}: ScoreTileProps) {
  const isLive = status === 'LIVE'
  const statusLabel = isLive ? `${minute ?? ''}'` : status

  return (
    <Card className="card-hover">
      <CardHeader className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-base sm:text-lg">
            {home} vs {away}
          </CardTitle>
          <div className="meta mt-1 truncate">{competition ?? 'Match'}</div>
        </div>

        <div className="shrink-0">
          {isLive ? <LivePill /> : <span className="meta font-semibold">{statusLabel}</span>}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-sm text-muted">{home}</div>
            <div className="text-sm text-muted">{away}</div>
          </div>

          <div className="text-right">
            <div className={cn('score', isLive && 'text-primary')}>
              {homeScore ?? '-'} : {awayScore ?? '-'}
            </div>
            <div className="meta mt-1 font-semibold">{isLive ? 'LIVE' : status}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
