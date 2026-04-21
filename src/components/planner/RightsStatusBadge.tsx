import type { RightsStatus } from '../../hooks/useRightsCheck'

interface Props {
  status?: RightsStatus
  /** Size in pixels. Default 6 matches readiness dots. */
  size?: number
}

/**
 * Tiny coloured dot that surfaces the rights-check outcome for an event
 * on the planner grid. Absent / "ok" status renders nothing so the card
 * stays uncluttered; any warning or error shows a coloured dot with a
 * tooltip listing the validator codes.
 *
 * The tooltip is a native `title` attribute rather than a positioned
 * popover so it works without any portal / stacking gymnastics inside
 * the event card's absolute-positioned layout.
 */
export function RightsStatusBadge({ status, size = 6 }: Props) {
  if (!status || status.severity === 'ok') return null

  const colour = status.severity === 'error'
    ? 'bg-red-500'
    : status.severity === 'warning'
      ? 'bg-amber-400'
      : 'bg-sky-400'

  const label = status.severity === 'error'
    ? 'Rights issue'
    : status.severity === 'warning'
      ? 'Rights warning'
      : 'Rights info'

  const tooltip = status.results.map(r => `${r.code}: ${r.message}`).join('\n') || label

  return (
    <span
      className={`inline-block rounded-full ${colour} ring-1 ring-black/20`}
      style={{ width: size, height: size }}
      title={tooltip}
      aria-label={label}
    />
  )
}
