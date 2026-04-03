import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { Modal, Btn, Toggle } from '../ui'
import { integrationsApi } from '../../services/integrations'
import type {
  Integration,
  IntegrationDirection,
  IntegrationTemplate,
  FieldOverride,
} from '../../services/integrations'

interface AddEditIntegrationModalProps {
  integration: Integration | null  // null = create mode
  onClose: () => void
  onSaved: (integration: Integration) => void
}

interface FormState {
  name: string
  templateCode: string
  direction: IntegrationDirection
  credentials: Record<string, string>
  fieldOverrides: FieldOverride[]
  config: string
  isActive: boolean
}

const EMPTY_OVERRIDE: FieldOverride = { sourceField: '', targetField: '', transform: '' }

function authSchemeFields(scheme: string | undefined): Array<{ key: string; label: string; type: string }> {
  switch (scheme) {
    case 'api_key_header':
      return [{ key: 'apiKey', label: 'API Key', type: 'password' }]
    case 'bearer':
      return [{ key: 'token', label: 'Bearer Token', type: 'password' }]
    case 'basic':
      return [
        { key: 'username', label: 'Username', type: 'text' },
        { key: 'password', label: 'Password', type: 'password' },
      ]
    case 'none':
    default:
      return []
  }
}

export function AddEditIntegrationModal({ integration, onClose, onSaved }: AddEditIntegrationModalProps) {
  const isEdit = integration !== null

  const [templates, setTemplates] = useState<IntegrationTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOverrides, setShowOverrides] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  const [form, setForm] = useState<FormState>(() => ({
    name: integration?.name ?? '',
    templateCode: integration?.templateCode ?? '',
    direction: integration?.direction ?? 'INBOUND',
    credentials: {},
    fieldOverrides: integration?.fieldOverrides ?? [],
    config: integration?.config ? JSON.stringify(integration.config, null, 2) : '{}',
    isActive: integration?.isActive ?? true,
  }))

  useEffect(() => {
    integrationsApi.listTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false))
  }, [])

  const selectedTemplate = templates.find(t => t.code === form.templateCode)

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setError(null)
  }, [])

  const handleTemplateChange = (code: string) => {
    const tpl = templates.find(t => t.code === code)
    setForm(prev => ({
      ...prev,
      templateCode: code,
      direction: tpl?.direction ?? prev.direction,
      credentials: {},
      fieldOverrides: tpl?.defaultFieldMappings?.map(m => ({
        sourceField: m.sourceField,
        targetField: m.targetField,
        transform: m.transform,
      })) ?? [],
    }))
    setError(null)
  }

  const updateOverride = (index: number, field: keyof FieldOverride, value: string) => {
    setForm(prev => {
      const next = [...prev.fieldOverrides]
      next[index] = { ...next[index], [field]: value }
      return { ...prev, fieldOverrides: next }
    })
  }

  const removeOverride = (index: number) => {
    setForm(prev => ({
      ...prev,
      fieldOverrides: prev.fieldOverrides.filter((_, i) => i !== index),
    }))
  }

  const addOverride = () => {
    setForm(prev => ({
      ...prev,
      fieldOverrides: [...prev.fieldOverrides, { ...EMPTY_OVERRIDE }],
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    if (!form.templateCode) {
      setError('Please select a template.')
      return
    }

    let configObj: Record<string, unknown> = {}
    try {
      configObj = JSON.parse(form.config)
    } catch {
      setError('Config must be valid JSON.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = {
        name: form.name.trim(),
        direction: form.direction,
        templateCode: form.templateCode,
        credentials: Object.keys(form.credentials).length > 0 ? form.credentials : undefined,
        fieldOverrides: form.fieldOverrides.filter(o => o.sourceField && o.targetField),
        config: configObj,
        isActive: form.isActive,
      }

      const result = isEdit
        ? await integrationsApi.update(integration.id, payload)
        : await integrationsApi.create(payload)

      onSaved(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save integration.')
    } finally {
      setSaving(false)
    }
  }

  const inboundTemplates = templates.filter(t => t.direction === 'INBOUND')
  const outboundTemplates = templates.filter(t => t.direction === 'OUTBOUND')
  const credFields = authSchemeFields(selectedTemplate?.auth?.scheme)

  return (
    <Modal
      title={isEdit ? 'Edit Integration' : 'Add Integration'}
      onClose={onClose}
      width="max-w-2xl"
    >
      <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
        {error && (
          <div className="px-3 py-2 bg-danger-bg border border-danger-dim rounded-lg text-xs text-danger">
            {error}
          </div>
        )}

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-2 uppercase tracking-wide">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => updateField('name', e.target.value)}
            placeholder="My Integration"
            className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:outline-none focus:border-primary/50 text-text placeholder:text-text-3"
          />
        </div>

        {/* Template selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-2 uppercase tracking-wide">Template</label>
          {loadingTemplates ? (
            <div className="text-xs text-text-3">Loading templates...</div>
          ) : (
            <select
              value={form.templateCode}
              onChange={e => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:outline-none focus:border-primary/50 text-text"
            >
              <option value="">Select a template...</option>
              {inboundTemplates.length > 0 && (
                <optgroup label="Inbound">
                  {inboundTemplates.map(t => (
                    <option key={t.code} value={t.code}>{t.name}</option>
                  ))}
                </optgroup>
              )}
              {outboundTemplates.length > 0 && (
                <optgroup label="Outbound">
                  {outboundTemplates.map(t => (
                    <option key={t.code} value={t.code}>{t.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          {selectedTemplate?.description && (
            <p className="text-xs text-text-3">{selectedTemplate.description}</p>
          )}
        </div>

        {/* Direction (read-only, auto-set from template) */}
        {form.templateCode && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-2 uppercase tracking-wide">Direction</label>
            <div className="text-sm text-text">{form.direction}</div>
          </div>
        )}

        {/* Credentials */}
        {credFields.length > 0 && (
          <div className="space-y-3">
            <label className="text-xs font-semibold text-text-2 uppercase tracking-wide">Credentials</label>
            {isEdit && (
              <p className="text-xs text-text-3">
                Leave fields empty to keep existing credentials unchanged.
              </p>
            )}
            {credFields.map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs text-text-2">{f.label}</label>
                <input
                  type={f.type}
                  value={form.credentials[f.key] ?? ''}
                  onChange={e => updateField('credentials', { ...form.credentials, [f.key]: e.target.value })}
                  placeholder={isEdit ? '(unchanged)' : f.label}
                  className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:outline-none focus:border-primary/50 text-text placeholder:text-text-3"
                />
              </div>
            ))}
          </div>
        )}

        {/* Field Overrides (collapsible) */}
        <div className="space-y-2">
          <button
            onClick={() => setShowOverrides(!showOverrides)}
            className="flex items-center gap-1.5 text-xs font-semibold text-text-2 uppercase tracking-wide hover:text-text transition-colors"
          >
            {showOverrides ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Field Overrides ({form.fieldOverrides.length})
          </button>
          {showOverrides && (
            <div className="space-y-2">
              {form.fieldOverrides.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-1.5 text-left text-xs font-bold text-muted uppercase">Source Field</th>
                        <th className="px-2 py-1.5 text-left text-xs font-bold text-muted uppercase">Target Field</th>
                        <th className="px-2 py-1.5 text-left text-xs font-bold text-muted uppercase">Transform</th>
                        <th className="px-2 py-1.5 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {form.fieldOverrides.map((override, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={override.sourceField}
                              onChange={e => updateOverride(i, 'sourceField', e.target.value)}
                              placeholder="source.field"
                              className="w-full px-2 py-1 text-xs bg-surface-2 border border-border rounded focus:outline-none focus:border-primary/50 text-text placeholder:text-text-3"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={override.targetField}
                              onChange={e => updateOverride(i, 'targetField', e.target.value)}
                              placeholder="target.field"
                              className="w-full px-2 py-1 text-xs bg-surface-2 border border-border rounded focus:outline-none focus:border-primary/50 text-text placeholder:text-text-3"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={override.transform ?? ''}
                              onChange={e => updateOverride(i, 'transform', e.target.value)}
                              placeholder="optional"
                              className="w-full px-2 py-1 text-xs bg-surface-2 border border-border rounded focus:outline-none focus:border-primary/50 text-text placeholder:text-text-3"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => removeOverride(i)}
                              className="p-1 rounded hover:bg-danger/10 hover:text-danger transition-colors text-text-3"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Btn variant="ghost" size="xs" onClick={addOverride}>
                <Plus className="w-3.5 h-3.5" />
                Add Override
              </Btn>
            </div>
          )}
        </div>

        {/* Config (collapsible JSON editor) */}
        <div className="space-y-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 text-xs font-semibold text-text-2 uppercase tracking-wide hover:text-text transition-colors"
          >
            {showConfig ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Config (JSON)
          </button>
          {showConfig && (
            <textarea
              value={form.config}
              onChange={e => updateField('config', e.target.value)}
              rows={6}
              spellCheck={false}
              className="w-full px-3 py-2 text-xs font-mono bg-surface-2 border border-border rounded-lg focus:outline-none focus:border-primary/50 text-text placeholder:text-text-3 resize-y"
            />
          )}
        </div>

        {/* Active toggle */}
        <Toggle
          active={form.isActive}
          onChange={active => updateField('isActive', active)}
          label="Active"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Btn variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Btn>
        <Btn variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Integration'}
        </Btn>
      </div>
    </Modal>
  )
}
