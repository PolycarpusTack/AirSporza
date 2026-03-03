import { Users, Database, Activity, RefreshCw } from 'lucide-react'
import type { DashboardWidget } from '../data/types'
import { FieldConfigurator } from '../components/admin/FieldConfigurator'

interface AdminViewProps {
  widgets: DashboardWidget[]
}

export function AdminView({ widgets }: AdminViewProps) {
  const visWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order)

  const showStatus = visWidgets.some(w => w.id === 'systemStatus')
  const showUsers = visWidgets.some(w => w.id === 'userManagement')
  const showAudit = visWidgets.some(w => w.id === 'auditLog')
  const showSettings = visWidgets.some(w => w.id === 'settings')

  const stats = [
    { label: 'Total Users', value: 12, icon: Users, color: 'text-primary' },
    { label: 'Active Sessions', value: 8, icon: Activity, color: 'text-success' },
    { label: 'Database Size', value: '2.4 GB', icon: Database, color: 'text-info' },
    { label: 'API Calls (24h)', value: '14.2K', icon: RefreshCw, color: 'text-warning' },
  ]

  const users = [
    { id: '1', name: 'Admin User', email: 'admin@sporza.vrt.be', role: 'admin', status: 'active' },
    { id: '2', name: 'Jan Peeters', email: 'jan.peeters@vrt.be', role: 'planner', status: 'active' },
    { id: '3', name: 'Marie Dupont', email: 'marie.dupont@vrt.be', role: 'sports', status: 'active' },
    { id: '4', name: 'Tom Janssen', email: 'tom.janssen@vrt.be', role: 'contracts', status: 'inactive' },
  ]

  const auditLogs = [
    { id: '1', action: 'Event Created', user: 'Jan Peeters', timestamp: '2 min ago', entity: 'Club Brugge vs Anderlecht' },
    { id: '2', action: 'Tech Plan Updated', user: 'Marie Dupont', timestamp: '15 min ago', entity: 'UCL Coverage' },
    { id: '3', action: 'User Role Changed', user: 'Admin', timestamp: '1 hour ago', entity: 'tom.janssen@vrt.be' },
    { id: '4', action: 'Contract Added', user: 'Tom Janssen', timestamp: '3 hours ago', entity: 'Jupiler Pro League' },
  ]

  return (
    <div className="space-y-6">
      {showStatus && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-fade-in">
          {stats.map((stat) => (
            <div key={stat.label} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div className="statv">{stat.value}</div>
              <div className="statl">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {showUsers && (
        <div className="card animate-fade-in">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h4 className="font-bold">User Management</h4>
            <button className="btn btn-p btn-sm">
              <Users className="w-4 h-4" /> Add User
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-2">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-2">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-2">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-2">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-2 transition">
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-text-2">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`bdg ${user.role === 'admin' ? 'bdg-d' : user.role === 'sports' ? 'bdg-ok' : 'bdg-n'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`bdg ${user.status === 'active' ? 'bdg-ok' : 'bdg-w'}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="btn btn-g btn-sm">Edit</button>
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
            <button className="btn btn-g btn-sm">Export</button>
          </div>
          <div className="divide-y divide-border">
            {auditLogs.map((log) => (
              <div key={log.id} className="px-4 py-3 hover:bg-surface-2 transition">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{log.action}</span>
                    <span className="text-text-3 mx-2">—</span>
                    <span className="text-text-2">{log.entity}</span>
                  </div>
                  <span className="text-xs text-text-3">{log.timestamp}</span>
                </div>
                <div className="text-xs text-text-3 mt-1">by {log.user}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card animate-fade-in">
        <div className="px-4 py-3 border-b border-border">
          <h4 className="font-bold">Field Management</h4>
        </div>
        <FieldConfigurator />
      </div>

      {showSettings && (
        <div className="card animate-fade-in p-4">
          <h4 className="font-bold mb-4">System Settings</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <div className="font-medium">API Rate Limiting</div>
                <div className="text-sm text-text-2">Limit requests per minute</div>
              </div>
              <input type="number" value={500} className="inp w-24 text-right" readOnly />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <div className="font-medium">Session Timeout</div>
                <div className="text-sm text-text-2">Auto-logout after inactivity</div>
              </div>
              <input type="number" value={30} className="inp w-24 text-right" readOnly />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <div className="font-medium">Enable WebSocket</div>
                <div className="text-sm text-text-2">Real-time updates</div>
              </div>
              <div className="toggle-track active">
                <div className="toggle-thumb" />
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="font-medium">Debug Mode</div>
                <div className="text-sm text-text-2">Extended logging</div>
              </div>
              <div className="toggle-track">
                <div className="toggle-thumb" />
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border flex justify-end gap-2">
            <button className="btn btn-s">Reset Defaults</button>
            <button className="btn btn-p">Save Changes</button>
          </div>
        </div>
      )}
    </div>
  )
}
