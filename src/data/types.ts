import type {
  SchedulingMode, StageType, OverrunStrategy, AnchorType, BroadcastSlotStatus, ContentSegment,
  DraftStatus, ValidationResult
} from '@planza/shared'

export type {
  UserRole, AuditAction, FieldSection, ConditionalRule, ConditionalRequiredField,
  FieldDefinition, DropdownList, DropdownOption, MandatoryFieldConfig, CustomFieldValue, ApiResponse,
  SchedulingMode, StageType, OverrunStrategy, AnchorType, BroadcastSlotStatus, ContentSegment,
  DraftStatus, RunType, RunStatus, CoverageType, Platform, SwitchTriggerType, SwitchExecutionStatus,
  OutboxPriority, AdapterType, AdapterDirection, ValidationSeverity, ValidationResult
} from '@planza/shared'

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

// === Broadcast Middleware Entities ===

export interface Tenant {
  id: string
  name: string
  slug: string
  config: Record<string, unknown>
}

export interface Venue {
  id: number
  tenantId: string
  name: string
  timezone: string
  country?: string
  address?: string
  capacity?: number
}

export interface Team {
  id: number
  tenantId: string
  name: string
  shortName?: string
  country?: string
  logoUrl?: string
}

export interface Court {
  id: number
  tenantId: string
  venueId: number
  name: string
  hasRoof: boolean
  isShowCourt: boolean
  broadcastPriority: number
}

export interface Season {
  id: number
  tenantId: string
  competitionId: number
  name: string
  startDate: string
  endDate: string
  sportMetadata: Record<string, unknown>
  stages?: Stage[]
}

export interface Stage {
  id: number
  tenantId: string
  seasonId: number
  name: string
  stageType: StageType
  sortOrder: number
  advancementRules: Record<string, unknown>
  sportMetadata: Record<string, unknown>
  rounds?: Round[]
}

export interface Round {
  id: number
  tenantId: string
  stageId: number
  name: string
  roundNumber: number
  scheduledDateStart?: string
  scheduledDateEnd?: string
}

export interface Channel {
  id: number
  tenantId: string
  name: string
  timezone: string
  broadcastDayStartLocal: string
  epgConfig: Record<string, unknown>
  color: string
}

export interface BroadcastSlot {
  id: string
  tenantId: string
  channelId: number
  eventId?: number
  schedulingMode: SchedulingMode
  plannedStartUtc?: string
  plannedEndUtc?: string
  estimatedStartUtc?: string
  estimatedEndUtc?: string
  earliestStartUtc?: string
  latestStartUtc?: string
  actualStartUtc?: string
  actualEndUtc?: string
  bufferBeforeMin: number
  bufferAfterMin: number
  expectedDurationMin?: number
  overrunStrategy: OverrunStrategy
  conditionalTriggerUtc?: string
  conditionalTargetChannelId?: number
  anchorType: AnchorType
  coveragePriority: number
  fallbackEventId?: number
  status: BroadcastSlotStatus
  contentSegment: ContentSegment
  scheduleVersionId?: string
  sportMetadata: Record<string, unknown>
  event?: Event
  channel?: Channel
}

export interface ScheduleDraft {
  id: string
  tenantId: string
  channelId: number
  dateRangeStart: string
  dateRangeEnd: string
  version: number
  status: DraftStatus
  channel?: Channel
}

export interface ScheduleVersion {
  id: string
  tenantId: string
  channelId: number
  draftId: string
  versionNumber: number
  publishedAt: string
  publishedBy: string
  isEmergency: boolean
  acknowledgedWarnings: ValidationResult[]
}

export interface CascadeEstimate {
  id: string
  eventId: number
  estimatedStartUtc: string
  earliestStartUtc: string
  latestStartUtc: string
  estDurationShortMin: number
  estDurationLongMin: number
  confidenceScore: number
  computedAt: string
}

export interface Alert {
  code: string
  severity: 'INFO' | 'WARNING' | 'ACTION' | 'URGENT' | 'OPPORTUNITY'
  slotId: string
  message: string
  data?: Record<string, unknown>
}
