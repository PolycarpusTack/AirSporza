import { useState } from 'react'
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
import { Btn } from './ui'
import { NotificationBell } from './ui/NotificationBell'
import type { Role, RoleConfig, User } from '../data/types'

interface HeaderProps {
  activeRole: Role
  roleConfig: Record<Role, RoleConfig>
  user: User | null
  searchQuery: string
  onSearchChange: (q: string) => void
  onRoleChange: (r: Role) => void
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

export function Header({
  activeRole,
  roleConfig,
  user,
  searchQuery,
  onSearchChange,
  onRoleChange,
  onNewEvent,
  onOpenSettings,
  onLogout,
}: HeaderProps) {
  const [mobileMenu, setMobileMenu] = useState(false)

  const switchRole = (r: Role) => {
    onRoleChange(r)
    setMobileMenu(false)
  }

  return (
    <header className="bg-white border-b border-border sticky top-0 z-30 shadow-sm">
      <div className="container-sport">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenu(!mobileMenu)}
              className="sm:hidden p-1 text-text-2"
            >
              {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md"
                style={{
                  background: `linear-gradient(135deg, ${roleConfig[activeRole].accent}, ${roleConfig[activeRole].accent}dd)`,
                }}
              >
                <span className="text-white text-sm font-bold">S</span>
              </div>
              <span className="font-bold text-base tracking-tight">
                Sporza
                <span style={{ color: roleConfig[activeRole].accent }}>Planner</span>
              </span>
            </div>
          </div>

          <nav className="hidden sm:flex items-center gap-1 bg-surface-2 rounded-lg p-0.5">
            {(Object.entries(roleConfig) as [Role, RoleConfig][]).map(([k, v]) => (
              <button
                key={k}
                onClick={() => switchRole(k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeRole === k
                    ? 'bg-white shadow-sm text-text'
                    : 'text-text-2 hover:text-text'
                }`}
              >
                {roleIcons[k]}
                <span className="hidden md:inline">{v.label}</span>
              </button>
            ))}
          </nav>

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

            <NotificationBell />

            <Btn variant="accent" size="sm" onClick={onNewEvent}>
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Event</span>
            </Btn>

            <button
              onClick={onLogout}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
              style={{ background: 'linear-gradient(135deg, #374151, #111827)' }}
              title={user?.name || 'User'}
            >
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </button>
          </div>
        </div>
      </div>

      {mobileMenu && (
        <div className="sm:hidden border-t border-border bg-surface px-4 py-2 space-y-1">
          {(Object.entries(roleConfig) as [Role, RoleConfig][]).map(([k, v]) => (
            <button
              key={k}
              onClick={() => switchRole(k)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                activeRole === k
                  ? 'bg-text text-white'
                  : 'text-text-2 hover:bg-surface-2'
              }`}
            >
              {roleIcons[k]} {v.label}
            </button>
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
    </header>
  )
}
