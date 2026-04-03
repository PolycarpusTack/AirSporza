import { Zap, List, Pencil, Trash2, CheckCircle, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, RefreshCw } from 'lucide-react'
import { Badge, Btn, Toggle } from '../ui'
import type { Integration } from '../../services/integrations'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const DIRECTION_CONFIG: Record<string, { label: string; variant: 'success' | 'default' | 'warning' }> = {
  INBOUND:       { label: 'Inbound',       variant: 'default' },
  OUTBOUND:      { label: 'Outbound',      variant: 'success' },
  BIDIRECTIONAL: { label: 'Bidirectional', variant: 'warning' },
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'INBOUND') return <ArrowDownToLine className="w-3.5 h-3.5" />
  if (direction === 'OUTBOUND') return <ArrowUpFromLine className="w-3.5 h-3.5" />
  return <RefreshCw className="w-3.5 h-3.5" />
}

interface IntegrationCardProps {
  integration: Integration
  onEdit: (integration: Integration) => void
  onTest: (integration: Integration) => void
  onLogs: (integration: Integration) => void
  onDelete: (integration: Integration) => void
  onToggleActive: (integration: Integration, active: boolean) => void
}

export function IntegrationCard({
  integration,
  onEdit,
  onTest,
  onLogs,
  onDelete,
  onToggleActive,
}: IntegrationCardProps) {
  const dir = DIRECTION_CONFIG[integration.direction] ?? DIRECTION_CONFIG.INBOUND
  const isHealthy = integration.consecutiveFailures === 0
  const lastActivity = integration.lastSuccessAt ?? integration.lastFailureAt

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${integration.isActive ? 'bg-success' : 'bg-text-3'}`} />
            <h3 className="font-bold text-text truncate">{integration.name}</h3>
            <Badge variant={dir.variant}>
              <DirectionIcon direction={integration.direction} />
              {dir.label}
            </Badge>
            {!isHealthy && (
              <Badge variant="warning">
                <AlertTriangle className="w-3 h-3" />
                {integration.consecutiveFailures} failures
              </Badge>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-text-3">
            {integration.templateName && (
              <span className="text-text-2">{integration.templateName}</span>
            )}
            {integration.templateCode && !integration.templateName && (
              <span className="text-text-2">{integration.templateCode}</span>
            )}
            <span className="flex items-center gap-1">
              {isHealthy
                ? <CheckCircle className="w-3 h-3 text-success" />
                : <AlertTriangle className="w-3 h-3 text-warning" />
              }
              {isHealthy ? 'Healthy' : 'Degraded'}
            </span>
            {lastActivity && (
              <span>Last activity: {relativeTime(lastActivity)}</span>
            )}
          </div>
        </div>

        {/* Right side: toggle + actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Toggle
            active={integration.isActive}
            onChange={(active) => onToggleActive(integration, active)}
          />
          <div className="flex items-center gap-1">
            <Btn
              variant="ghost"
              size="xs"
              onClick={() => onTest(integration)}
              title="Test connection"
            >
              <Zap className="w-3.5 h-3.5" />
            </Btn>
            <Btn
              variant="ghost"
              size="xs"
              onClick={() => onLogs(integration)}
              title="View logs"
            >
              <List className="w-3.5 h-3.5" />
            </Btn>
            <Btn
              variant="ghost"
              size="xs"
              onClick={() => onEdit(integration)}
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Btn>
            <Btn
              variant="ghost"
              size="xs"
              onClick={() => onDelete(integration)}
              title="Delete"
              className="hover:!text-danger"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
