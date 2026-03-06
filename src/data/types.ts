export type { UserRole, AuditAction, FieldSection, ConditionalRule, ConditionalRequiredField, FieldDefinition, DropdownList, DropdownOption, MandatoryFieldConfig, CustomFieldValue, ApiResponse } from '@planza/shared'

export interface Sport {
  id: number
  name: string
  icon: string
  federation: string
  createdAt?: Date
  updatedAt?: Date
}

export interface Competition {
  id: number
  sportId: number
  name: string
  matches: number
  season: string
  createdAt?: Date
  updatedAt?: Date
}

export type BadgeVariant = 'default' | 'live' | 'delayed' | 'valid' | 'expiring' | 'none' | 'draft' | 'success' | 'danger' | 'warning'

export type FieldType = 'text' | 'number' | 'date' | 'time' | 'checkbox' | 'textarea' | 'dropdown'

export interface FieldConfig {
  id: string
  label: string
  type: FieldType
  options?: string
  required: boolean
  visible: boolean
  order: number
  isCustom?: boolean
}

export interface Event {
  id: number
  sportId: number
  competitionId: number
  createdById?: string
  phase?: string
  category?: string
  participants: string
  content?: string
  startDateBE: Date | string
  startTimeBE: string
  startDateOrigin?: Date | string
  startTimeOrigin?: string
  complex?: string
  livestreamDate?: Date | string
  livestreamTime?: string
  linearChannel?: string
  radioChannel?: string
  onDemandChannel?: string
  linearStartTime?: string
  isLive: boolean
  isDelayedLive: boolean
  videoRef?: string
  winner?: string
  score?: string
  duration?: string
  status?: EventStatus
  seriesId?: string
  customFields: Record<string, unknown>
  customValues?: { fieldId: string; fieldValue: string }[]
  createdAt?: Date
  updatedAt?: Date
  sport?: Sport
  competition?: Competition
  techPlans?: TechPlan[]
}

export interface TechPlan {
  id: number
  eventId: number
  planType: string
  crew: Record<string, unknown>
  isLivestream: boolean
  customFields: unknown
  createdById?: string
  createdAt?: Date
  updatedAt?: Date
}

export type EventStatus = 'draft' | 'ready' | 'approved' | 'published' | 'live' | 'completed' | 'cancelled'

export type ContractStatus = 'valid' | 'expiring' | 'draft' | 'none'

export interface Contract {
  id: number
  competitionId: number
  status: ContractStatus
  validFrom?: Date | string
  validUntil?: Date | string
  linearRights: boolean
  maxRights: boolean
  radioRights: boolean
  geoRestriction?: string
  sublicensing: boolean
  fee?: string
  notes?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface Encoder {
  id: number
  name: string
  location?: string
  isActive: boolean
  notes?: string
  inUse?: { planId: number; planType: string; eventId: number } | null
  createdAt?: Date
  updatedAt?: Date
}

export interface CrewTemplate {
  id: number
  name: string
  planType: string | null
  crewData: Record<string, unknown>
  createdById: string | null
  isShared: boolean
  createdAt?: string
  updatedAt?: string
}

export interface CrewMember {
  id: number
  name: string
  roles: string[]
  email: string | null
  phone: string | null
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export type Role = 'planner' | 'sports' | 'contracts' | 'admin'

export interface User {
  id: string
  email: string
  name?: string
  avatar?: string
  role: Role
  externalId?: string
  createdAt?: Date
  updatedAt?: Date
}

export type CustomWidgetType = 'metric' | 'list' | 'my-assignments'
export type CustomWidgetDateRange = 'today' | 'this-week' | 'next-7-days' | 'this-month' | 'all'

export interface CustomWidgetConfig {
  type: CustomWidgetType
  sportId?: number
  competitionId?: number
  status?: string
  dateRange: CustomWidgetDateRange
  maxItems?: number
}

export interface DashboardWidget {
  id: string
  label: string
  visible: boolean
  order: number
  custom?: CustomWidgetConfig
}

export interface RoleConfig {
  label: string
  accent: string
  icon: string
}

export interface ChannelConfig {
  name: string
  color: string  // hex, e.g. "#F59E0B"
}

export interface OrgConfig {
  channels: ChannelConfig[]
  onDemandChannels: ChannelConfig[]
  radioChannels: string[]
  phases: string[]
  categories: string[]
  complexes: string[]
  freezeWindowHours?: number
}
