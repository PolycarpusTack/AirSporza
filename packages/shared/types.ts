// Shared types used by both the frontend (src/) and backend (backend/src/).
// These mirror the Prisma enums and models defined in backend/prisma/schema.prisma.

// ── Roles ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'planner' | 'sports' | 'contracts'

// ── Audit ────────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'event.create'
  | 'event.update'
  | 'event.delete'
  | 'techPlan.create'
  | 'techPlan.update'
  | 'techPlan.delete'
  | 'encoder.swap'
  | 'contract.create'
  | 'contract.update'
  | 'field.create'
  | 'field.update'
  | 'field.delete'
  | 'setting.create'
  | 'setting.update'
  | 'setting.delete'

// ── Field Engine ─────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'number' | 'date' | 'time' | 'dropdown' | 'checkbox' | 'textarea'

export type FieldSection = 'event' | 'crew' | 'contract'

export interface ConditionalRule {
  fieldId: string
  operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty'
  value?: string
  action: 'show' | 'hide' | 'require'
}

export interface ConditionalRequiredField {
  fieldId: string
  conditions: ConditionalRule[]
}

export interface FieldDefinition {
  id: string
  name: string
  label: string
  fieldType: FieldType
  section: FieldSection
  required: boolean
  sortOrder: number
  options: string[]
  dropdownSourceId: string | null
  defaultValue: string | null
  conditionalRules: ConditionalRule[]
  visibleByRoles: UserRole[]
  isSystem: boolean
  isCustom: boolean
  visible: boolean
  createdById: string | null
  createdAt: string
  updatedAt: string
}

export interface DropdownOption {
  id: string
  listId: string
  value: string
  label: string
  parentId: string | null
  sortOrder: number
  active: boolean
  metadata: Record<string, unknown>
  createdAt: string
}

export interface DropdownList {
  id: string
  name: string
  description: string | null
  managedBy: UserRole
  createdAt: string
  options?: DropdownOption[]
}

export interface MandatoryFieldConfig {
  id: string
  sportId: number
  fieldIds: string[]
  conditionalRequired: ConditionalRequiredField[]
  createdAt: string
  updatedAt: string
}

export interface CustomFieldValue {
  id: string
  entityType: string
  entityId: string
  fieldId: string
  fieldValue: string
}

// ── API Utilities ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  error?: string
}

// === Broadcast Middleware Types ===

export type SchedulingMode = 'FIXED' | 'FLOATING' | 'WINDOW'
export type StageType = 'LEAGUE' | 'GROUP' | 'KNOCKOUT' | 'QUALIFIER' | 'TOURNAMENT_MAIN'
export type OverrunStrategy = 'EXTEND' | 'CONDITIONAL_SWITCH' | 'HARD_CUT' | 'SPLIT_SCREEN'
export type AnchorType = 'FIXED_TIME' | 'COURT_POSITION' | 'FOLLOWS_MATCH' | 'HANDOFF' | 'NOT_BEFORE'
export type BroadcastSlotStatus = 'PLANNED' | 'LIVE' | 'OVERRUN' | 'SWITCHED_OUT' | 'COMPLETED' | 'VOIDED'
export type ContentSegment = 'FULL' | 'CONTINUATION'
export type DraftStatus = 'EDITING' | 'VALIDATING' | 'PUBLISHED'
export type RunType = 'LIVE' | 'CONTINUATION' | 'TAPE_DELAY' | 'HIGHLIGHTS' | 'CLIP'
export type RunStatus = 'PENDING' | 'CONFIRMED' | 'RECONCILED' | 'DISPUTED'
export type CoverageType = 'LIVE' | 'HIGHLIGHTS' | 'DELAYED' | 'CLIP'
export type Platform = 'LINEAR' | 'OTT' | 'SVOD' | 'AVOD' | 'PPV' | 'STREAMING'
export type SwitchTriggerType = 'CONDITIONAL' | 'REACTIVE' | 'EMERGENCY' | 'HARD_CUT' | 'COURT_SWITCH'
export type SwitchExecutionStatus = 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED'
export type OutboxPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type AdapterType = 'LIVE_SCORE' | 'OOP' | 'LIVE_TIMING' | 'AS_RUN' | 'EPG' | 'PLAYOUT' | 'NOTIFICATION'
export type AdapterDirection = 'INBOUND' | 'OUTBOUND'
export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO'

export interface ValidationResult {
  severity: ValidationSeverity
  code: string
  scope: string[]
  message: string
  remediation?: string
}
