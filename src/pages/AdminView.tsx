import { useState, useEffect } from 'react'
import { Users, Database, Activity, RefreshCw } from 'lucide-react'
import type { DashboardWidget, Sport } from '../data/types'
import { FieldConfigurator } from '../components/admin/FieldConfigurator'
import { PublishPanel } from '../components/admin/PublishPanel'
import { OrgConfigPanel } from '../components/admin/OrgConfigPanel'
import { CrewRosterPanel } from '../components/admin/CrewRosterPanel'
import { CrewTemplatesPanel } from '../components/admin/CrewTemplatesPanel'
import { AuditLogViewer } from '../components/admin/AuditLogViewer'
import { AutoFillRulesPanel } from '../components/admin/AutoFillRulesPanel'
import { WorkflowTogglesPanel } from '../components/admin/WorkflowTogglesPanel'
import { ChannelsPanel } from '../components/admin/ChannelsPanel'
// RightsPoliciesPanel removed — rights now managed via enriched ContractForm
import { AdapterConfigPanel } from '../components/admin/AdapterConfigPanel'
import { IntegrationHub } from './IntegrationHub'
import { sportsApi, usersApi, type UserRecord } from '../services'
import { settingsApi, type AdminStats } from '../services/settings'
import { auditApi, type AuditEntry } from '../services/audit'
import { useToast } from '../components/Toast'
import { handleApiError } from '../utils/apiError'
import { useConfirmDialog } from '../components/ui/ConfirmDialog'

interface AdminViewProps {
  widgets: DashboardWidget[]
  activeTab?: AdminTab
  onTabChange?: (tab: AdminTab) => void
}

export type AdminTab = 'fields' | 'sports' | 'competitions' | 'encoders' | 'csv' | 'publish' | 'org' | 'crew-roster' | 'crew-templates' | 'audit-log' | 'autofill' | 'workflows' | 'channels' | 'rights' | 'adapters' | 'integrations'

interface AdminGroup {
  label: string
  items: { id: AdminTab; label: string }[]
}

import { SportsTab } from '../components/admin/SportsTab'
import { CompetitionsTab } from '../components/admin/CompetitionsTab'
import { EncodersTab } from '../components/admin/EncodersTab'
import { CsvImportTab } from '../components/admin/CsvImportTab'

// ── AdminView ────────────────────────────────────────────────────────────────

export function AdminView({ widgets, activeTab: externalTab, onTabChange }: AdminViewProps) {
  const toast = useToast()
  const { confirm: confirmAdmin, dialog: confirmAdminDialog } = useConfirmDialog()
  const [internalTab, setInternalTab] = useState<AdminTab>('org')
  const activeTab = externalTab ?? internalTab
  const setActiveTab = (tab: AdminTab) => { if (onTabChange) onTabChange(tab); else setInternalTab(tab) }
  const isControlled = externalTab !== undefined
  const [sports, setSports] = useState<(Sport & { _count?: { competitions: number; events: number } })[]>([])

  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [userList, setUserList] = useState<UserRecord[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const [auditTotal, setAuditTotal] = useState(0)

  const visWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order)
  const showStatus = visWidgets.some(w => w.id === 'systemStatus')
  const showUsers = visWidgets.some(w => w.id === 'userManagement')
  const showAudit = visWidgets.some(w => w.id === 'auditLog')

  useEffect(() => {
    sportsApi.list().then(setSports).catch(err => handleApiError(err, 'Failed to load sports', toast))
    settingsApi.getStats().then(setAdminStats).catch(err => handleApiError(err, 'Failed to load admin stats', toast))
    usersApi.list().then(setUserList).catch(err => handleApiError(err, 'Failed to load users', toast))
    auditApi.listAll({ limit: 20 }).then(r => {
      setAuditLogs(r.logs)
      setAuditTotal(r.total)
    }).catch(err => handleApiError(err, 'Failed to load audit logs', toast))
  }, [])

  const sidebarGroups: AdminGroup[] = [
    {
      label: 'Workspace',
      items: [
        { id: 'org', label: 'Organisation' },
        { id: 'sports', label: 'Sports' },
        { id: 'competitions', label: 'Competitions' },
      ],
    },
    {
      label: 'Planning',
      items: [
        { id: 'fields', label: 'Field Configuration' },
        { id: 'crew-roster', label: 'Crew Roster' },
        { id: 'crew-templates', label: 'Crew Templates' },
        { id: 'encoders', label: 'Encoders' },
        { id: 'autofill', label: 'Auto-Fill Rules' },
        { id: 'workflows', label: 'Workflow Automation' },
      ],
    },
    {
      label: 'Data',
      items: [
        { id: 'csv', label: 'CSV Import' },
        { id: 'integrations' as AdminTab, label: 'Integrations' },
        { id: 'publish', label: 'Publish & Webhooks' },
        { id: 'audit-log', label: 'Audit Log' },
      ],
    },
    {
      label: 'Broadcast',
      items: [
        { id: 'channels' as AdminTab, label: 'Channels' },
        { id: 'rights' as AdminTab, label: 'Rights Policies' },
        { id: 'adapters' as AdminTab, label: 'Adapters' },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      {showStatus && adminStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-fade-in">
          <div className="card p-4">
            <Users className="w-5 h-5 text-primary mb-2" />
            <div className="statv">{adminStats.users}</div>
            <div className="statl">Users</div>
          </div>
          <div className="card p-4">
            <Activity className="w-5 h-5 text-success mb-2" />
            <div className="statv">{adminStats.events}</div>
            <div className="statl">Events</div>
          </div>
          <div className="card p-4">
            <Database className="w-5 h-5 text-info mb-2" />
            <div className="statv">{adminStats.techPlans}</div>
            <div className="statl">Tech Plans</div>
          </div>
          <div className="card p-4">
            <RefreshCw className="w-5 h-5 text-warning mb-2" />
            <div className="statv">{adminStats.crewMembers}</div>
            <div className="statl">Crew Members</div>
          </div>
        </div>
      )}

      {showUsers && (
        <div className="card animate-fade-in">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h4 className="font-bold">User Management</h4>
            <span className="text-xs text-muted">{userList.length} users</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Events</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {userList.map(u => (
                  <tr key={u.id} className="hover:bg-surface-2 transition">
                    <td className="px-4 py-3 font-medium">{u.name || '\u2014'}</td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        className="inp text-xs px-2 py-1"
                        value={u.role}
                        onChange={async (e) => {
                          const updated = await usersApi.updateRole(u.id, e.target.value)
                          setUserList(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x))
                        }}
                      >
                        <option value="planner">planner</option>
                        <option value="sports">sports</option>
                        <option value="contracts">contracts</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-muted">{u._count.events}</td>
                    <td className="px-4 py-3 text-right">
                      {u._count.events === 0 && u._count.techPlans === 0 && (
                        <button
                          className="text-xs text-danger hover:underline"
                          onClick={async () => {
                            const ok = await confirmAdmin({
                              title: 'Delete user',
                              message: `Delete user "${u.name || u.email}"? This cannot be undone.`,
                              variant: 'danger',
                            })
                            if (!ok) return
                            await usersApi.delete(u.id)
                            setUserList(prev => prev.filter(x => x.id !== u.id))
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAudit && (
        <div className="card animate-fade-in">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h4 className="font-bold">Audit Log</h4>
            <span className="text-xs text-muted">{auditTotal} total entries</span>
          </div>
          <div className="divide-y divide-border">
            {auditLogs.length === 0 && (
              <div className="px-4 py-6 text-sm text-muted text-center">No audit entries yet.</div>
            )}
            {auditLogs.map(log => (
              <div key={log.id} className="px-4 py-3 hover:bg-surface-2 transition">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{log.action}</span>
                    <span className="text-text-3 mx-2">&mdash;</span>
                    <span className="text-text-2">{log.entityType} #{log.entityId}</span>
                  </div>
                  <span className="text-xs text-text-3">
                    {new Date(log.createdAt).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
                {log.userId && <div className="text-xs text-text-3 mt-1">by {log.userId}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={isControlled ? '' : 'card animate-fade-in'}>
        {!isControlled ? (
          <div className="flex min-h-[500px]">
            {/* Sidebar */}
            <div className="w-48 flex-shrink-0 border-r border-border bg-surface-2/50 p-3 space-y-4">
              {sidebarGroups.map(group => (
                <div key={group.label}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted px-2 mb-1">
                    {group.label}
                  </div>
                  {group.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full text-left px-2 py-1.5 rounded text-sm transition ${
                        activeTab === item.id
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-text-2 hover:bg-surface-2 hover:text-text'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 p-6 overflow-auto">
              {activeTab === 'fields' && <FieldConfigurator />}
              {activeTab === 'sports' && <SportsTab sports={sports} setSports={setSports} />}
              {activeTab === 'competitions' && <CompetitionsTab sports={sports} />}
              {activeTab === 'encoders' && <EncodersTab />}
              {activeTab === 'csv' && <CsvImportTab sports={sports} />}
              {activeTab === 'publish' && <PublishPanel />}
              {activeTab === 'org' && <OrgConfigPanel />}
              {activeTab === 'crew-roster' && <CrewRosterPanel />}
              {activeTab === 'crew-templates' && <CrewTemplatesPanel />}
              {activeTab === 'audit-log' && <AuditLogViewer />}
              {activeTab === 'autofill' && <AutoFillRulesPanel />}
              {activeTab === 'workflows' && <WorkflowTogglesPanel />}
              {activeTab === 'channels' && <ChannelsPanel />}
              {activeTab === 'rights' && <div className="card p-6 text-center text-text-3">Rights are now managed via enriched Contracts in the Contracts view.</div>}
              {activeTab === 'adapters' && <AdapterConfigPanel />}
            </div>
          </div>
        ) : (
          <div>
            {activeTab === 'fields' && <FieldConfigurator />}
            {activeTab === 'sports' && <SportsTab sports={sports} setSports={setSports} />}
            {activeTab === 'competitions' && <CompetitionsTab sports={sports} />}
            {activeTab === 'encoders' && <EncodersTab />}
            {activeTab === 'csv' && <CsvImportTab sports={sports} />}
            {activeTab === 'publish' && <PublishPanel />}
            {activeTab === 'org' && <OrgConfigPanel />}
            {activeTab === 'crew-roster' && <CrewRosterPanel />}
            {activeTab === 'crew-templates' && <CrewTemplatesPanel />}
            {activeTab === 'audit-log' && <AuditLogViewer />}
            {activeTab === 'autofill' && <AutoFillRulesPanel />}
            {activeTab === 'workflows' && <WorkflowTogglesPanel />}
            {activeTab === 'channels' && <ChannelsPanel />}
            {activeTab === 'rights' && <div className="card p-6 text-center text-text-3">Rights are now managed via enriched Contracts in the Contracts view.</div>}
            {activeTab === 'adapters' && <AdapterConfigPanel />}
            {activeTab === 'integrations' && <IntegrationHub />}
          </div>
        )}
      </div>

      {confirmAdminDialog}
    </div>
  )
}
