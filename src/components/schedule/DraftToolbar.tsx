import { useState } from 'react'
import { FileText, Check, Upload } from 'lucide-react'
import type { ScheduleDraft } from '../../data/types'
import { schedulesApi } from '../../services/schedules'
import { useToast } from '../Toast'

interface DraftToolbarProps {
  draft: ScheduleDraft | null
  onPublished?: () => void
  onValidated?: (results: any[]) => void
}

export function DraftToolbar({ draft, onPublished, onValidated }: DraftToolbarProps) {
  const toast = useToast()
  const [validating, setValidating] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const handleValidate = async () => {
    if (!draft) return
    setValidating(true)
    try {
      const { results } = await schedulesApi.validateDraft(draft.id)
      const errors = results.filter((r: any) => r.severity === 'ERROR')
      if (errors.length) {
        toast.warning(`Validation: ${errors.length} error(s), ${results.length - errors.length} warning(s)`)
      } else if (results.length) {
        toast.info(`Validation passed with ${results.length} warning(s)`)
      } else {
        toast.success('Validation passed — no issues')
      }
      onValidated?.(results)
    } catch (err: any) {
      toast.error(err.message || 'Validation failed')
    } finally {
      setValidating(false)
    }
  }

  const handlePublish = async () => {
    if (!draft) return
    setPublishing(true)
    try {
      await schedulesApi.publishDraft(draft.id, true)
      toast.success('Schedule published successfully')
      onPublished?.()
    } catch (err: any) {
      toast.error(err.message || 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  if (!draft) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-2 rounded-lg border border-border text-text-3 text-sm">
        <FileText className="w-4 h-4" />
        No active draft — select or create one
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface-2 rounded-lg border border-border">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-text-2" />
        <span className="text-sm font-medium">
          Draft v{draft.version}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          draft.status === 'PUBLISHED' ? 'bg-green-500/20 text-green-400' :
          draft.status === 'VALIDATING' ? 'bg-amber-500/20 text-amber-400' :
          'bg-blue-500/20 text-blue-300'
        }`}>
          {draft.status}
        </span>
      </div>

      <div className="flex-1" />

      <button
        onClick={handleValidate}
        disabled={validating}
        className="btn btn-s flex items-center gap-1.5"
      >
        <Check className="w-3.5 h-3.5" />
        {validating ? 'Validating...' : 'Validate'}
      </button>

      <button
        onClick={handlePublish}
        disabled={publishing || draft.status === 'PUBLISHED'}
        className="btn btn-p flex items-center gap-1.5"
      >
        <Upload className="w-3.5 h-3.5" />
        {publishing ? 'Publishing...' : 'Publish'}
      </button>
    </div>
  )
}
