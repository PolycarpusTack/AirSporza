import type { EventStatus, Role } from '@prisma/client'

type Transition = { to: EventStatus; roles: Role[] }

export const TRANSITIONS: Record<EventStatus, Transition[]> = {
  draft: [
    { to: 'ready',     roles: ['planner', 'admin'] },
    { to: 'cancelled', roles: ['planner', 'admin'] },
  ],
  ready: [
    { to: 'approved',  roles: ['admin'] },
    { to: 'draft',     roles: ['planner', 'admin'] },
    { to: 'cancelled', roles: ['admin'] },
  ],
  approved: [
    { to: 'published', roles: ['admin'] },
    { to: 'ready',     roles: ['admin'] },
    { to: 'cancelled', roles: ['admin'] },
  ],
  published: [
    { to: 'live',      roles: ['sports', 'admin'] },
    { to: 'approved',  roles: ['admin'] },
    { to: 'cancelled', roles: ['admin'] },
  ],
  live: [
    { to: 'completed', roles: ['sports', 'admin'] },
    { to: 'cancelled', roles: ['admin'] },
  ],
  completed: [],
  cancelled: [],
}

export function canTransition(from: EventStatus, to: EventStatus, role: Role): boolean {
  if (from === to) return false
  return (TRANSITIONS[from] ?? []).some(t => t.to === to && t.roles.includes(role))
}
