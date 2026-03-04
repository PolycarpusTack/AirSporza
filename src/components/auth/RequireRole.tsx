import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks'
import type { Role } from '../../data/types'

interface RequireRoleProps {
  roles: Role[]
  children: React.ReactNode
}

export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/planner" replace />
  return <>{children}</>
}
