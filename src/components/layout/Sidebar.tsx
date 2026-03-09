import { NavLink } from 'react-router-dom'
import { Calendar, Users, FileText, Settings, Upload, Tv } from 'lucide-react'
import type { Role, RoleConfig, User } from '../../data/types'
import { useApp } from '../../context/AppProvider'

interface SidebarProps {
  roleConfig: Record<Role, RoleConfig>
  user: User | null
  onLogout: () => void
}

const NAV_MAIN = [
  { label: 'Planner',   icon: Calendar,  path: '/planner',   roles: ['planner','sports','contracts','admin'] as Role[] },
  { label: 'Sports',    icon: Users,     path: '/sports',    roles: ['planner','sports','admin'] as Role[] },
  { label: 'Contracts', icon: FileText,  path: '/contracts', roles: ['planner','contracts','admin'] as Role[] },
  { label: 'Import',    icon: Upload,    path: '/import',    roles: ['planner','admin'] as Role[] },
  { label: 'Schedule',  icon: Tv,        path: '/schedule',  roles: ['planner','sports','admin'] as Role[] },
]

const NAV_BOTTOM = [
  { label: 'Settings',  icon: Settings,  path: '/settings',  roles: ['admin'] as Role[] },
]

export function Sidebar({ roleConfig: _roleConfig, user, onLogout }: SidebarProps) {
  const { filteredEvents } = useApp()
  const liveCount = filteredEvents.filter(e => e.isLive).length

  const userRole = user?.role as Role | undefined
  const visibleMain = NAV_MAIN.filter(item => !userRole || item.roles.includes(userRole))
  const visibleBottom = NAV_BOTTOM.filter(item => !userRole || item.roles.includes(userRole))

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      isActive
        ? 'bg-primary/10 text-primary border-l-2 border-primary -ml-px pl-[11px]'
        : 'text-text-2 hover:bg-surface-2 hover:text-text border-l-2 border-transparent -ml-px pl-[11px]'
    }`

  return (
    <aside className="hidden sm:flex flex-col w-56 min-h-screen bg-surface border-r border-border flex-shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shadow-md flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)' }}
        >
          <span className="text-black text-xs font-bold">S</span>
        </div>
        <span className="font-bold text-sm tracking-tight font-head">
          Sporza<span className="text-primary">Planner</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        <p className="px-3 py-1 text-xs font-semibold uppercase tracking-widest text-text-3 font-mono mt-1 mb-0.5">
          Workspace
        </p>
        {visibleMain.map(({ label, icon: Icon, path }) => (
          <NavLink key={path} to={path} className={navClass}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
          </NavLink>
        ))}

        {visibleBottom.length > 0 && (
          <>
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-widest text-text-3 font-mono mt-4 mb-0.5">
              Admin
            </p>
            {visibleBottom.map(({ label, icon: Icon, path }) => (
              <NavLink key={path} to={path} className={navClass}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Live indicator */}
      {liveCount > 0 && (
        <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
          <span className="w-2 h-2 rounded-full bg-danger animate-pulse flex-shrink-0" />
          <span className="text-xs font-medium text-danger font-mono">{liveCount} live now</span>
        </div>
      )}

      {/* User info + logout */}
      <div className="p-3 border-t border-border">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 hover:bg-surface-2 rounded-lg px-2 py-1.5 transition-all group"
          title="Log out"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #374151, #111827)' }}
          >
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-xs font-medium truncate">{user?.name || user?.email || 'User'}</div>
            <div className="text-xs text-text-3 truncate capitalize">{user?.role}</div>
          </div>
        </button>
      </div>
    </aside>
  )
}
