import { useState, useEffect, useRef } from 'react'
import { importsApi } from '../../services/imports'

interface ImportRecord {
  id: string
  sourceRecordId: string
  normalizedJson: {
    participantsText?: string
    homeTeam?: string
    awayTeam?: string
    competitionName?: string
    sportName?: string
    startsAtUtc?: string
    stage?: string
    venueName?: string
  } | null
  source: { code: string; name: string }
  createdAt: string
}

interface LinkFromImportProps {
  onLink: (data: {
    participants?: string
    startDateBE?: string
    startTimeBE?: string
    competition?: string
    phase?: string
    complex?: string
  }) => void
}

export function LinkFromImport({ onLink }: LinkFromImportProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ImportRecord[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!open) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await importsApi.searchUnlinked(search || undefined)
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search, open])

  const handleSelect = (record: ImportRecord) => {
    const n = record.normalizedJson
    if (!n) return

    const participants = n.participantsText || [n.homeTeam, n.awayTeam].filter(Boolean).join(' vs ')
    let startDateBE: string | undefined
    let startTimeBE: string | undefined
    if (n.startsAtUtc) {
      const d = new Date(n.startsAtUtc)
      startDateBE = d.toISOString().split('T')[0]
      startTimeBE = d.toISOString().split('T')[1]?.slice(0, 5)
    }

    onLink({
      participants: participants || undefined,
      startDateBE,
      startTimeBE,
      phase: n.stage || undefined,
      complex: n.venueName || undefined,
    })
    setOpen(false)
    setSearch('')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-primary hover:underline"
      >
        Link from import
      </button>
    )
  }

  return (
    <div className="border border-border rounded p-3 mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-3 uppercase tracking-wider">Link from Import</span>
        <button type="button" onClick={() => { setOpen(false); setSearch('') }} className="text-xs text-muted hover:text-text">
          Cancel
        </button>
      </div>
      <input
        type="search"
        className="inp text-sm w-full px-2 py-1"
        placeholder="Search by team, competition..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />
      <div className="max-h-48 overflow-auto space-y-1">
        {loading && <div className="text-xs text-text-3 animate-pulse">Searching...</div>}
        {!loading && results.length === 0 && <div className="text-xs text-text-3">No unlinked records found</div>}
        {results.map(r => {
          const n = r.normalizedJson
          const label = n?.participantsText || [n?.homeTeam, n?.awayTeam].filter(Boolean).join(' vs ') || r.sourceRecordId
          const date = n?.startsAtUtc ? new Date(n.startsAtUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelect(r)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-2 transition text-sm flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{label}</div>
                <div className="text-xs text-text-3 truncate">
                  {n?.competitionName} {n?.stage ? `· ${n.stage}` : ''} {date ? `· ${date}` : ''}
                </div>
              </div>
              <span className="text-xs text-text-3 flex-shrink-0">{r.source.code}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
