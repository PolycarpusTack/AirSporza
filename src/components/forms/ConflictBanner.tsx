import type { ConflictResult } from '../../services/conflicts'

interface ConflictBannerProps {
  conflicts: ConflictResult | null
}

export default function ConflictBanner({ conflicts }: ConflictBannerProps) {
  if (!conflicts) return null
  if (conflicts.errors.length === 0 && conflicts.warnings.length === 0) return null

  return (
    <div className="space-y-1">
      {conflicts.errors.map((e, i) => (
        <div key={`err-${i}`} className="text-xs text-danger bg-danger/10 rounded px-2 py-1">
          {e.message}
        </div>
      ))}
      {conflicts.warnings.length > 0 && (
        <>
          <div className="text-xs text-muted italic">
            Warnings found — click Save again to proceed anyway.
          </div>
          {conflicts.warnings.map((w, i) => (
            <div key={`warn-${i}`} className="text-xs text-warning bg-warning/10 rounded px-2 py-1">
              {w.message}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
