import { Badge, cn } from '../ui'

export type MatchRowProps = {
  home: string
  away: string
  homeScore?: number
  awayScore?: number
  status: 'FT' | 'LIVE' | 'HT' | 'NS'
  minute?: number
  competition?: string
}

export function MatchRow({
  home,
  away,
  homeScore,
  awayScore,
  status,
  minute,
  competition,
}: MatchRowProps) {
  const isLive = status === 'LIVE'

  return (
    <div className="card flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{home} vs {away}</div>
        <div className="meta truncate text-xs">{competition ?? 'Match'}</div>
      </div>

      <div className={cn('score text-lg', isLive && 'text-primary')}>
        {homeScore ?? '-'} : {awayScore ?? '-'}
      </div>

      <div className="w-16 text-right">
        {isLive ? (
          <Badge variant="live">{minute ? `${minute}'` : 'LIVE'}</Badge>
        ) : (
          <span className="meta font-semibold">{status}</span>
        )}
      </div>
    </div>
  )
}
