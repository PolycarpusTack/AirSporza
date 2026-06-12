// Extracted from AdminView.tsx in C-4 (TD-4) — pure move.
import { useState, useEffect } from 'react'
import type { Sport, Competition } from '../../data/types'
import { importsApi, competitionsApi } from '../../services'
import { useToast } from '../Toast'
import { handleApiError } from '../../utils/apiError'

// ── CSV Import Tab — 3-stage flow ─────────────────────────────────────────────

type ImportStage = 'upload' | 'confirm' | 'result'
type ImportResult = { inserted: number; skipped: number; errors?: { row: number; message: string }[] }

const IMPORT_STAGES: { id: ImportStage; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'result', label: 'Result' },
]

export function CsvImportTab({ sports }: { sports: Sport[] }) {
  const toast = useToast()
  const [competitions, setCompetitions] = useState<(Competition & { sport: Sport })[]>([])
  const [stage, setStage] = useState<ImportStage>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [sportId, setSportId] = useState<number>(0)
  const [competitionId, setCompetitionId] = useState<number>(0)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    competitionsApi.list().then(setCompetitions).catch(err => handleApiError(err, 'Failed to load competitions', toast))
  }, [])

  const filteredComps = sportId
    ? competitions.filter(c => c.sport?.id === sportId || c.sportId === sportId)
    : competitions

  const canProceed = !!file && sportId > 0 && competitionId > 0

  const reset = () => {
    setStage('upload')
    setFile(null)
    setSportId(0)
    setCompetitionId(0)
    setResult(null)
    setUploadError(null)
  }

  const handleConfirm = async () => {
    if (!file || !sportId || !competitionId) return
    setUploading(true)
    setUploadError(null)
    try {
      const res = await importsApi.uploadCsv(file, sportId, competitionId)
      setResult(res)
      setStage('result')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const currentIdx = IMPORT_STAGES.findIndex(s => s.id === stage)

  return (
    <div className="max-w-lg space-y-6">
      {/* Stage indicator */}
      <div className="flex items-center gap-2">
        {IMPORT_STAGES.map((s, i) => {
          const isActive = stage === s.id
          const isDone = i < currentIdx
          return (
            <div key={s.id} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-border" />}
              <div className={`flex items-center gap-1.5 text-sm font-medium ${
                isActive ? 'text-primary' : isDone ? 'text-success' : 'text-muted'
              }`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono ${
                  isActive ? 'bg-primary text-white' : isDone ? 'bg-success text-white' : 'bg-surface-2 text-muted'
                }`}>
                  {isDone ? '✓' : i + 1}
                </span>
                {s.label}
              </div>
            </div>
          )
        })}
      </div>

      {uploadError && (
        <div className="rounded-md bg-danger/10 border border-danger/25 px-4 py-3 text-sm text-danger">
          {uploadError}
        </div>
      )}

      {/* Stage 1: Upload */}
      {stage === 'upload' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">CSV File</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-md p-6 cursor-pointer hover:border-primary transition">
              <span className="text-2xl mb-1">📁</span>
              <span className="text-sm text-muted">{file ? file.name : 'Click to choose CSV file'}</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Sport</label>
            <select
              className="inp w-full"
              value={sportId}
              onChange={e => { setSportId(Number(e.target.value)); setCompetitionId(0) }}
            >
              <option value={0} disabled>Select sport…</option>
              {sports.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Competition</label>
            <select
              className="inp w-full"
              value={competitionId}
              onChange={e => setCompetitionId(Number(e.target.value))}
            >
              <option value={0} disabled>Select competition…</option>
              {filteredComps.map(c => <option key={c.id} value={c.id}>{c.name} ({c.season})</option>)}
            </select>
          </div>
          <button
            onClick={() => setStage('confirm')}
            className="btn btn-p"
            disabled={!canProceed}
          >
            Continue →
          </button>
        </div>
      )}

      {/* Stage 2: Confirm */}
      {stage === 'confirm' && (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-surface-2 px-4 py-4 text-sm space-y-2">
            <div><span className="text-muted">File:</span> <span className="font-mono font-medium">{file?.name}</span></div>
            <div><span className="text-muted">Sport:</span> <span className="font-medium">{sports.find(s => s.id === sportId)?.icon} {sports.find(s => s.id === sportId)?.name}</span></div>
            <div><span className="text-muted">Competition:</span> <span className="font-medium">{filteredComps.find(c => c.id === competitionId)?.name}</span></div>
          </div>
          <p className="text-sm text-text-2">
            All rows will be imported. Existing records matching the same competition, date, and participants will be updated.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setStage('upload')} className="btn btn-s btn-sm">← Back</button>
            <button
              onClick={handleConfirm}
              disabled={uploading}
              className="btn btn-p btn-sm"
            >
              {uploading ? 'Importing…' : 'Confirm Import'}
            </button>
          </div>
        </div>
      )}

      {/* Stage 3: Result */}
      {stage === 'result' && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-lg bg-success/10 border border-success/25">
              <p className="text-2xl font-bold text-success font-mono">{result.inserted}</p>
              <p className="text-sm text-success">Inserted</p>
            </div>
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/25">
              <p className="text-2xl font-bold text-warning font-mono">{result.skipped}</p>
              <p className="text-sm text-warning">Skipped</p>
            </div>
            <div className="p-4 rounded-lg bg-danger/10 border border-danger/25">
              <p className="text-2xl font-bold text-danger font-mono">{result.errors?.length ?? 0}</p>
              <p className="text-sm text-danger">Errors</p>
            </div>
          </div>
          {result.errors && result.errors.length > 0 && (
            <details className="border border-danger/25 rounded-md">
              <summary className="px-4 py-2 cursor-pointer text-sm font-semibold text-danger">
                {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
              </summary>
              <div className="px-4 pb-3 space-y-1">
                {result.errors.map((err, i) => (
                  <div key={i} className="text-xs text-danger font-mono">Row {err.row}: {err.message}</div>
                ))}
              </div>
            </details>
          )}
          <button onClick={reset} className="btn btn-p btn-sm">Import another file</button>
        </div>
      )}
    </div>
  )
}

