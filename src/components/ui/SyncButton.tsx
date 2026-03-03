import { useState } from 'react'
import { Btn } from './Btn'
import { useToast } from '../Toast'
import { importsApi } from '../../services/imports'

interface SyncButtonProps {
  sourceCode: 'football_data'
  entityType: 'competitions' | 'fixtures' | 'teams' | 'events'
  onSyncComplete?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'xs' | 'sm' | 'md'
}

export function SyncButton({ 
  sourceCode, 
  entityType, 
  onSyncComplete,
  variant = 'secondary',
  size = 'xs'
}: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const toast = useToast()

  const handleSync = async () => {
    setSyncing(true)
    try {
      await importsApi.createJob({
        sourceCode,
        entityScope: entityType,
        mode: 'incremental'
      })
      setLastSync(new Date())
      toast.success('Sync job queued')
      onSyncComplete?.()
    } catch (error) {
      console.error('Sync failed:', error)
      toast.error('Failed to queue sync job')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Btn
        variant={variant}
        size={size}
        onClick={handleSync}
        disabled={syncing}
      >
        {syncing ? 'Syncing...' : `Sync ${sourceCode.replace('_', '-').toUpperCase()}`}
      </Btn>
      {lastSync && (
        <span className="text-xs text-muted">
          Last: {lastSync.toLocaleTimeString()}
        </span>
      )}
    </div>
  )
}

interface QuickSyncProps {
  onRefresh?: () => void
}

export function QuickSyncBar({ onRefresh }: QuickSyncProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted font-medium">Quick Sync:</span>
      <SyncButton 
        sourceCode="football_data" 
        entityType="fixtures" 
        onSyncComplete={onRefresh}
        size="xs"
      />
      <span className="text-xs text-muted">Other providers will appear here once their adapters are implemented.</span>
    </div>
  )
}
