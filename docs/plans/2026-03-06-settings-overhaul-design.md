# Settings & Admin Overhaul — Design

## Goal
Transform the Settings and Admin system from partially-stubbed flat tabs into a fully functional, role-aware, sidebar-navigated system with real data, notifications, user preferences, and power-user features.

## Current State

### What Works
- **Org config** (channels, phases, categories) — fully dynamic via AppSetting
- **Settings hierarchy** — global -> role -> user_role scope with fallback
- **Saved views** — per-user, per-context filter state
- **Audit log model** — entity-specific queries + restore
- **Notification model** — CRUD + frontend service

### What's Broken
- **AdminView stats** — hardcoded (12 users, 8 sessions, 2.4 GB, 14.2K calls)
- **AdminView users** — hardcoded 4-user array, no CRUD endpoint
- **AdminView audit** — hardcoded mock entries, not wired to real API
- **Notification UI** — model + service exist but no bell icon or dropdown
- **Settings Modal** — tabs 1-3 redirect to sub-modals instead of inlining editors

### What's Missing
- User preferences (default view, date format, compact mode)
- Notification preference matrix
- System-wide audit log query (current requires entity context)
- Keyboard shortcuts
- Admin sidebar navigation (9 flat tabs at breaking point)

## Design Decisions

### 1. Admin Navigation: Sidebar with Groups
Replace 9-tab horizontal bar with left sidebar grouped into:
- **Workspace**: Organisation, Sports, Competitions
- **Planning**: Field Config, Crew Roster, Crew Templates, Encoders, Auto-Fill Rules, Workflow Automation
- **Data**: CSV Import, Publish & Webhooks, Audit Log

### 2. User Preferences: Separate from Admin
User preferences accessible from avatar menu (not admin panel):
- Default view on login
- Default sport filter
- Date format (en-GB / en-US / nl-BE)
- Compact mode
- Show week numbers
- Notification preferences (matrix: categories x channels)

Stored in localStorage initially (can migrate to backend AppSetting later).

### 3. Notification Center: Bell + Dropdown
- Bell icon in Header between search and settings
- Unread badge (red circle)
- Dropdown with recent notifications (50 max)
- Mark read on click, mark all read button
- Poll every 30s (upgrade to WebSocket later)

### 4. Keyboard Shortcuts
- N: New Event
- Ctrl+K: Focus search
- T: Go to Today
- Shift+?: Show help modal
- 1/2/3: Navigate to Planning/Sports/Contracts
- Escape: Close modal / deselect

### 5. Auto-Fill Rules
Admin-configurable rules: "When Sport = Football, set Channel = Een"
- Trigger: sport or competition match
- Target: linearChannel, radioChannel, duration, complex
- Stored as AppSetting (global scope)

### 6. Workflow Automation Toggles
Simple on/off toggles stored in orgConfig:
- Auto-apply crew template on tech plan creation
- Incomplete tech plan reminder (24h before)
- Crew conflict notification
- Event change notification to assigned crew
- Auto-set status on publish

## Phasing

**Phase 1 (Fix What's Broken):** Tasks 1-6
- Wire audit log, user management, stats to real APIs
- Add notification bell
- Inline Settings Modal editors

**Phase 2 (Restructure & Enhance):** Tasks 7-10
- Admin sidebar navigation
- User preferences modal
- Notification preferences matrix
- Full audit log viewer with filters + export

**Phase 3 (Power Features):** Tasks 11-13
- Keyboard shortcuts + help modal
- Auto-fill rules configuration
- Workflow automation toggles

## Not Included (Deferred)
- Email notification delivery (requires SMTP setup)
- Cmd+K command palette (beyond search focus)
- Theme switching (dark/light — already uses CSS variables)
- User avatar upload
- Team/department model
- Session tracking / active users
