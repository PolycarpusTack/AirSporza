# Pickup: UX/QoL Features (D2-D7) + Configuration System (C)

## What was done (session 2026-03-25)

Four sub-projects completed across a comprehensive code review:

### A) Production Hardening — DONE
- Zod env validation with fail-fast in production (`backend/src/config/env.ts`)
- SQL injection fix (`$executeRawUnsafe` → `$executeRaw`) + ESLint ban
- Auth gaps closed on 6 route groups + HMAC webhook verification
- Tiered rate limiting (4 tiers: public/standard/webhook/auth)
- Full Joi→Zod migration (29 schema files, 28 route files), Joi removed
- Helmet CSP disabled (API-only), CORS credentials removed, body limit 1mb

### B) Code Quality Cleanup — DONE
- PlannerView decomposed: 1,854 → 993 lines
- Extracted: CalendarGrid, EventCard, TimeGutter, WeekHeader (all React.memo)
- Extracted hooks: useCalendarNavigation, useEventActions
- Centralized utilities: `dateTime.ts` (9 functions), `calendarLayout.ts` (6 functions + constants), `apiError.ts`
- Error handling standardized with `handleApiError` across 20 files

### D1) Confirmation Dialogs — DONE
- `ConfirmDialog` component + `useConfirmDialog` hook (`src/components/ui/ConfirmDialog.tsx`)
- All `window.confirm()` replaced, 6 missing confirmations added
- Zero `window.confirm()` remaining in codebase

### Fix: TypeScript zero errors
- Resolved `selectedSport` variable shadowing in SportsWorkspace.tsx

## What remains

### D2: Field Validation Feedback
Inline field-level errors on DynamicEventForm and ContractForm. Currently errors show only as a top-level "Save failed" toast — need red borders + error text per field, real-time validation as user types.

### D3: Pagination
Add pagination UI to AuditLogViewer (currently hardcoded limit:50), ImportView jobs/sources, CrewRosterPanel. Backend already supports pagination on some endpoints.

### D4: Bulk Operations
Add "Select All" checkbox to tables, bulk ops in CrewRosterPanel (bulk rename/merge/deactivate), AdminView tables (bulk delete), ResourcesTab (bulk assign/unassign).

### D5: CSV Export
Add CSV export to ContractsView, CrewTab, ResourcesTab. Follow the existing pattern in AuditLogViewer which already has CSV export.

### D6: Command Palette & Navigation
Ctrl+K command palette for global search across events, contracts, crew, settings. Breadcrumbs for AdminView, SettingsView, IntegrationSettings.

### D7: Tooltips & Onboarding
Help "?" icons on complex fields (Rights Policy, cascade settings, schedule modes). Empty state CTAs with "Create your first..." action buttons. Getting-started prompts for new users.

### C: Configuration System (separate sub-project)
Extract hardcoded values into API-driven config: calendar hours (8-23), event min duration (15min), conflict default duration (3h), freeze window, form fields/sections, event status workflow, role system, platform options, contract expiry threshold.

## How to continue

For each remaining item (D2 through D7, then C):
1. Brainstorm the design (use `superpowers:brainstorming` skill)
2. Write implementation plan (use `superpowers:writing-plans` skill)
3. Execute via subagent-driven development (use `superpowers:subagent-driven-development` skill)
4. Merge to main

The design docs and plans from the completed work are in:
- `docs/superpowers/specs/2026-03-25-production-hardening-design.md`
- `docs/superpowers/specs/2026-03-25-code-quality-cleanup-design.md`
- `docs/superpowers/specs/2026-03-25-d1-confirmation-dialogs-design.md`
- `docs/superpowers/plans/2026-03-25-production-hardening.md`
- `docs/superpowers/plans/2026-03-25-code-quality-cleanup.md`
- `docs/superpowers/plans/2026-03-25-d1-confirmation-dialogs.md`

## Key files to know about
- `src/components/ui/ConfirmDialog.tsx` — reusable confirmation dialog (created this session)
- `src/utils/dateTime.ts` — centralized date utilities (created this session)
- `src/utils/calendarLayout.ts` — calendar constants + layout functions (created this session)
- `src/utils/apiError.ts` — handleApiError utility (created this session)
- `src/components/ui/Modal.tsx` — base modal component
- `src/components/Toast.tsx` — toast system with useToast() hook
- `backend/src/middleware/validate.ts` — Zod validation middleware (created this session)
- `backend/src/schemas/common.ts` — shared Zod schemas (created this session)
- `backend/src/config/env.ts` — environment validation (created this session)
