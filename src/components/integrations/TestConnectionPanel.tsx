import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Modal, Btn } from '../ui'
import { integrationsApi } from '../../services/integrations'
import type { Integration, TestConnectionResult } from '../../services/integrations'

interface TestConnectionPanelProps {
  integration: Integration
  onClose: () => void
}

export function TestConnectionPanel({ integration, onClose }: TestConnectionPanelProps) {
  const [testing, setTesting] = useState(true)
  const [result, setResult] = useState<TestConnectionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    integrationsApi.testConnection(integration.id)
      .then(data => {
        if (!cancelled) setResult(data)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Test failed unexpectedly.')
      })
      .finally(() => {
        if (!cancelled) setTesting(false)
      })

    return () => { cancelled = true }
  }, [integration.id])

  const isSuccess = result?.status === 'success'

  return (
    <Modal
      title={`Test - ${integration.name}`}
      onClose={onClose}
      width="max-w-xl"
    >
      <div className="px-6 py-5 space-y-4">
        {testing && (
          <div className="flex items-center gap-3 py-8 justify-center text-text-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Testing connection...</span>
          </div>
        )}

        {!testing && error && (
          <>
            <div className="flex items-start gap-3 px-4 py-3 bg-danger-bg border border-danger-dim rounded-lg">
              <XCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-danger">Connection Failed</p>
                <p className="text-xs text-danger/80 mt-0.5">{error}</p>
              </div>
            </div>
          </>
        )}

        {!testing && result && (
          <>
            {/* Status banner */}
            <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
              isSuccess
                ? 'bg-success-bg border-success-dim'
                : 'bg-danger-bg border-danger-dim'
            }`}>
              {isSuccess
                ? <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                : <XCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
              }
              <div>
                <p className={`text-sm font-semibold ${isSuccess ? 'text-success' : 'text-danger'}`}>
                  {isSuccess ? 'Connection Successful' : 'Connection Failed'}
                </p>
                {result.error && (
                  <p className="text-xs text-danger/80 mt-0.5">{result.error}</p>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-3">
              {result.httpStatus != null && (
                <div className="card p-3 text-center">
                  <div className="text-lg font-bold">{result.httpStatus}</div>
                  <div className="text-xs text-muted">HTTP Status</div>
                </div>
              )}
              <div className="card p-3 text-center">
                <div className="text-lg font-bold">{result.durationMs}ms</div>
                <div className="text-xs text-muted">Duration</div>
              </div>
            </div>

            {/* Raw response preview */}
            {result.raw != null && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-2 uppercase tracking-wide">
                  Raw Response
                  {result.truncated && <span className="text-text-3 normal-case font-normal ml-1">(truncated)</span>}
                </label>
                <pre className="p-3 bg-surface-2 border border-border rounded-lg text-xs font-mono text-text-2 overflow-x-auto max-h-48 overflow-y-auto">
                  {typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw, null, 2)}
                </pre>
              </div>
            )}

            {/* Mapped fields preview */}
            {result.mapped && Object.keys(result.mapped).length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-2 uppercase tracking-wide">Mapped Fields</label>
                <div className="p-3 bg-surface-2 border border-border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-1 text-left font-bold text-muted uppercase">Field</th>
                        <th className="pb-1 text-left font-bold text-muted uppercase">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {Object.entries(result.mapped).map(([key, value]) => (
                        <tr key={key}>
                          <td className="py-1 font-mono text-text-2">{key}</td>
                          <td className="py-1 text-text-3">{String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-end border-t border-border px-6 py-3">
        <Btn variant="secondary" size="sm" onClick={onClose}>
          Close
        </Btn>
      </div>
    </Modal>
  )
}
