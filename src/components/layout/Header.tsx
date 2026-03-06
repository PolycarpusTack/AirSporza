import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Menu,
  X,
  Search,
  Settings,
  Plus,
  Calendar,
  Users,
  FileText,
  LayoutGrid,
} from 'lucide-react'
import { Btn } from '../ui'
import { NotificationCenter } from './NotificationCenter'
import { UserPreferencesModal } from '../settings/UserPreferencesModal'
import type { Role, RoleConfig, User } from '../../data/types'

interface HeaderProps {
  activeRole: Role
  roleConfig: Record<Role, RoleConfig>
  user: User | null
  searchQuery: string
  onSearchChange: (q: string) => void
  onNewEvent: () => void
  onOpenSettings: (
    tab: 'event' | 'crew' | 'dashboard' | 'integrations',
    scope?: 'sports' | 'competitions' | 'teams' | 'events' | 'fixtures' | 'live'
  ) => void
  onLogout: () => void
}

const roleIcons: Record<Role, React.ReactNode> = {
  planner: <Calendar className="w-4 h-4" />,
  sports: <Users className="w-4 h-4" />,
  contracts: <FileText className="w-4 h-4" />,
  admin: <LayoutGrid className="w-4 h-4" />,
}

const rolePaths: Record<Role, string> = {
  planner: '/planner',
  sports: '/sports',
  contracts: '/contracts',
  admin: '/admin',
}

// Which user roles can see each nav item (mirrors Sidebar NAV_MAIN)
const roleAccess: Record<Role, Role[]> = {
  planner: ['planner', 'admin'],
  sports: ['planner', 'sports', 'admin'],
  contracts: ['planner', 'contracts', 'admin'],
  admin: ['admin'],
}

export function Header({
  activeRole,
  roleConfig,
  user,
  searchQuery,
  onSearchChange,
  onNewEvent,
  onOpenSettings,
  onLogout,
}: HeaderProps) {
  const [mobileMenu, setMobileMenu] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-30 shadow-sm">
      <div className="container-sport">
        <div className="flex items-center justify-between h-14">
          {/* Mobile: hamburger + logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenu(!mobileMenu)}
              className="sm:hidden p-1 text-text-2"
            >
              {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            {/* Logo shown on mobile only (sidebar has it on desktop) */}
            <div className="flex items-center gap-2.5 sm:hidden">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md"
                style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)' }}
              >
                <span className="text-black text-sm font-bold">S</span>
              </div>
              <span className="font-bold text-base tracking-tight font-head">
                Sporza<span className="text-primary">Planner</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3 w-4 h-4" />
              <input
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search events..."
                className="inp pl-8 pr-3 py-1.5 w-40 focus:w-56 transition-all"
              />
            </div>

            <NotificationCenter />

            <div className="relative group">
              <Btn variant="ghost" size="xs" className="text-text-3">
                <Settings className="w-4 h-4" />
              </Btn>
              <div className="absolute right-0 top-full mt-1 w-52 bg-surface rounded-xl border border-border shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 py-1">
                <button
                  onClick={() => onOpenSettings('event')}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-surface-2 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" /> Configure Event Fields
                </button>
                <button
                  onClick={() => onOpenSettings('crew')}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-surface-2 flex items-center gap-2"
                >
                  <Users className="w-4 h-4" /> Configure Crew Fields
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => onOpenSettings('dashboard')}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-surface-2 flex items-center gap-2"
                >
                  <LayoutGrid className="w-4 h-4" /> Customize Dashboard
                </button>
                <button
                  onClick={() =>
                    onOpenSettings(
                      'integrations',
                      activeRole === 'sports' ? 'live' : 'events'
                    )
                  }
                  className="w-full text-left px-4 py-2 text-sm hover:bg-surface-2 flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" /> Integrations
                </button>
              </div>
            </div>

            <Btn variant="accent" size="sm" onClick={onNewEvent}>
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Event</span>
            </Btn>

            <div className="relative group">
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
                style={{ background: 'linear-gradient(135deg, #374151, #111827)' }}
                title={user?.name || 'User'}
              >
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </button>
              <div className="absolute right-0 top-full mt-1 w-40 bg-surface rounded-xl border border-border shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 py-1">
                <button
                  onClick={() => setShowPreferences(true)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-surface-2"
                >
                  Preferences
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={onLogout}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-surface-2 text-danger"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu — shown on sm: and below */}
      {mobileMenu && (
        <div className="sm:hidden border-t border-border bg-surface px-4 py-2 space-y-1">
          {(Object.entries(roleConfig) as [Role, RoleConfig][])
            .filter(([k]) => !user?.role || roleAccess[k]?.includes(user.role))
            .map(([k, v]) => (
            <NavLink
              key={k}
              to={rolePaths[k]}
              onClick={() => setMobileMenu(false)}
              className={({ isActive }) =>
                `w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive
                    ? 'bg-surface-3 text-primary'
                    : 'text-text-2 hover:bg-surface-2'
                }`
              }
            >
              {roleIcons[k]} {v.label}
            </NavLink>
          ))}
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3 w-4 h-4" />
            <input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search..."
              className="inp w-full pl-8 pr-3 py-2"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Btn
              variant="default"
              size="xs"
              onClick={() => {
                onOpenSettings('event')
                setMobileMenu(false)
              }}
            >
              <FileText className="w-3 h-3" /> Event Fields
            </Btn>
            <Btn
              variant="default"
              size="xs"
              onClick={() => {
                onOpenSettings('crew')
                setMobileMenu(false)
              }}
            >
              <Users className="w-3 h-3" /> Crew Fields
            </Btn>
            <Btn
              variant="default"
              size="xs"
              onClick={() => {
                onOpenSettings('dashboard')
                setMobileMenu(false)
              }}
            >
              <LayoutGrid className="w-3 h-3" /> Dashboard
            </Btn>
          </div>
        </div>
      )}
      {showPreferences && (
        <UserPreferencesModal onClose={() => setShowPreferences(false)} />
      )}
    </header>
  )
}
