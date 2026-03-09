# Settings & Admin Panel Best Practices for Planza

Research compiled: 2026-03-06
Context: Broadcast sports planning tool (Sporza/VRT) with events, tech plans, crew, encoders, resources

---

## 1. Settings Organization Patterns

### The Three Dominant Layouts

**A. Left Sidebar Navigation (RECOMMENDED for Planza)**
Used by: Linear, GitHub, Notion, Stripe, WordPress
- Persistent left sidebar with grouped categories
- Content area on the right shows the active section
- Best for apps with 8+ settings categories (Planza currently has 9 admin tabs)
- Supports nested grouping: categories can expand to show sub-items
- Allows a search/filter bar at the top of the sidebar

**B. Tabbed Layout**
Used by: Google Calendar, smaller SaaS tools
- Horizontal tabs across the top
- Works for up to ~6 categories before tabs overflow
- Planza's current approach -- becoming strained at 9 tabs

**C. Card Layout**
Used by: Trello, mobile-first apps
- Clickable cards that navigate into sub-pages
- Good for onboarding or first-time setup wizards
- Not ideal for frequent admin use

### Recommended Structure for Planza

Replace the current flat 9-tab bar with a **left sidebar grouped into categories**:

```
WORKSPACE
  General / Organisation
  Sports
  Competitions

PLANNING
  Field Configuration
  Crew Roster
  Crew Templates
  Encoders

DATA
  CSV Import
  Publish / Webhooks

SYSTEM (admin-only)
  User Management
  Audit Log
  API Keys
```

### Key UX Principles

1. **Searchable settings** -- Add Cmd+K or a search bar that filters across all settings. Linear's command palette is the gold standard. Users should be able to type "crew" and jump straight to crew settings.

2. **Breadcrumb navigation** -- Show the current path (e.g., "Settings > Planning > Crew Roster") so users maintain orientation in nested views.

3. **Smart defaults** -- Every setting should have a sensible default. Document what the default is and why.

4. **Undo/revert** -- Offer a way to reset settings to defaults, especially for complex configurations like field layouts.

5. **Progressive disclosure** -- Show the most common settings first. Hide advanced options behind an "Advanced" expander or a toggle like "Show advanced settings."

---

## 2. Role-Based Settings & Permission-Gated UI

### Three-Tier Separation Pattern

Modern SaaS apps split settings into three tiers:

| Tier | Who Sees It | Examples in Planza |
|------|-------------|-------------------|
| **User Preferences** | Every user, in their profile/modal | Default view, theme, notification prefs, timezone, keyboard shortcuts |
| **Team/Workspace Settings** | Planners + Admins | Field configuration, crew templates (shared), default channels per sport |
| **System/Admin Settings** | Admins only | User management, API keys, audit log, publish config, org settings |

### UI Patterns for Permission Gating

1. **Hide, don't disable** -- If a user lacks permission, hide the section entirely rather than showing greyed-out controls. This reduces cognitive load.

2. **Separate entry points** -- User preferences open from the avatar/profile menu (top-right). Admin settings live in the sidebar nav under "Admin" or "Settings." This is the pattern used by Linear, Notion, Asana, and GitHub.

3. **Inline permission indicators** -- When showing a mix of editable and read-only settings (e.g., a planner viewing org settings), use a lock icon and "Managed by admin" label on read-only fields.

4. **Role badges in user management** -- Display role as a colored badge (Admin, Planner, Viewer) with a dropdown to change it. Require confirmation for role elevation.

### Recommended Split for Planza

**User Preferences (profile menu > "Preferences" modal or page):**
- Display: theme (light/dark/system), compact mode, date format, timezone
- Default view: which page opens on login (Planner, Sports, Contracts)
- Notifications: per-category toggles, channel preferences, quiet hours
- Keyboard shortcuts: view/customize bindings
- Personal crew templates (isShared=false ones)

**Admin Panel (sidebar "Admin" section, gated by role):**
- Everything currently in AdminView
- Plus: User Management, Audit Log, API Keys, Integration settings

---

## 3. User Preferences vs System Settings

### What Goes Where

**Global Settings Modal (user-facing, per-user)**
```
General
  - Language / locale
  - Date format (DD/MM/YYYY vs MM/DD/YYYY)
  - Time format (24h vs 12h)
  - Timezone
  - Week starts on (Monday vs Sunday)

Appearance
  - Theme (light / dark / system)
  - Compact mode toggle
  - Sidebar collapsed by default

Default Views
  - Start page after login
  - Default sport filter in Sports workspace
  - Default date range in Planner (today / this week / this month)
  - Default Planner view (day / week / month)

Notifications
  - (see Section 4 below)

Keyboard Shortcuts
  - View all shortcuts
  - Customize bindings (power user feature)
```

**Admin Panel (org-wide, admin-only)**
```
Organisation
  - Org name, logo, branding
  - Default timezone for new users
  - Working hours (e.g., 06:00-23:00 for broadcast)

Field Configuration
  - Tech plan field definitions per plan type
  - Custom field ordering

Resource Management
  - Sports, Competitions, Encoders
  - Crew Roster (canonical names, roles, contact)
  - Crew Templates (shared defaults per plan type)

Data & Integration
  - CSV Import
  - Publish feeds & webhooks
  - API keys
  - External system sync (e.g., Vizrt, Ross Video)

Security & Access
  - User management (invite, roles, deactivate)
  - Session management
  - Audit log
```

**Inline Configuration (neither modal nor admin -- lives in context)**
- Per-event tech plan fields: configured inline in the TechPlanCard
- Per-template crew assignments: configured in the template editor
- Per-competition import mappings: configured during CSV import flow

---

## 4. Notification & Alert Settings

### Categories for a Broadcast Planning Tool

| Category | Events | Default Delivery |
|----------|--------|-----------------|
| **My Assignments** | Assigned to event, removed from event, event time changed | Real-time (in-app + email) |
| **Crew Conflicts** | New conflict detected, conflict resolved | Real-time (in-app) |
| **Event Changes** | Event created/updated/deleted in my sports | Digest (daily) |
| **Tech Plan Updates** | Tech plan modified for my events | Real-time (in-app) |
| **Encoder Alerts** | Encoder swapped, encoder unavailable | Real-time (in-app + email) |
| **Import Results** | CSV import completed, errors found | Real-time (in-app) |
| **System** | Maintenance windows, version updates | Email only |

### UX Patterns

1. **Matrix layout** -- Rows = notification categories, Columns = channels (In-App, Email, Slack/Teams). Each cell is a toggle. This is the pattern used by GitHub, Linear, and Notion.

2. **Quiet hours** -- A time range picker (e.g., 22:00 - 07:00) during which only "critical" notifications are delivered. Critical = encoder failure, last-minute event cancellation.

3. **Digest frequency** -- Per-category choice: "Instant", "Hourly digest", "Daily digest", "Off". Daily digest is best sent at a configurable time (default: 08:00 in user's timezone).

4. **Critical notifications cannot be disabled** -- Mark certain notifications (e.g., "You've been assigned to a live event starting in 1 hour") as mandatory. Show them greyed out in the preference matrix with a tooltip explaining why.

5. **Snooze** -- Allow temporary muting of non-critical notifications for 1h / 4h / until tomorrow. Accessible from the notification bell icon.

6. **Admin defaults** -- Admins set org-wide defaults. Users can customize within those bounds. If admin disables a channel (e.g., no Slack integration), that column disappears from the user preference matrix.

---

## 5. Audit Log Best Practices

### Data Model

Each audit entry should capture:
- **timestamp** (server-synced, UTC, millisecond precision)
- **actor** (user ID, name, email, or "System" for automated actions)
- **action** (structured as `entity.verb`: `event.created`, `techPlan.updated`, `encoder.swapped`)
- **target** (entity type + ID + human-readable name)
- **changes** (JSON diff of before/after for updates)
- **context** (IP address, user agent, session ID)
- **group** (org/workspace ID for multi-tenant)

### UI Design

1. **Timeline view** -- Default display as a reverse-chronological feed. Each entry shows: icon for entity type, action description, actor name, relative timestamp, and target entity as a clickable link.

2. **Filtering** -- Provide combined filters for:
   - **Time range**: preset ranges (Last hour, Today, Last 7 days, Last 30 days, Custom)
   - **Actor**: dropdown/autocomplete of users
   - **Action type**: Create, Update, Delete, Login, Export
   - **Entity type**: Event, TechPlan, Encoder, CrewMember, User, Settings
   - **Full-text search**: search across descriptions and entity names

3. **Entity-linked logs** -- On every entity detail view (event, tech plan, encoder), add a "History" or "Activity" tab that shows the audit log pre-filtered to that entity. This is the pattern used by Jira, GitHub, and Linear. Use a right-side drawer to keep context.

4. **Export** -- CSV and JSON export with current filters applied. For compliance, support scheduled exports or SIEM integration via webhook.

5. **Diff viewer** -- For update actions, show a side-by-side or inline diff of what changed. Highlight added fields in green, removed in red, changed in yellow.

6. **Retention policy** -- Display the retention period (e.g., "Logs retained for 2 years") in the UI. Allow admins to configure this.

### Implementation Notes for Planza

The current audit log in AdminView is hardcoded mock data. To make it real:
- Add an `AuditLog` Prisma model (timestamp, actorId, action, entityType, entityId, entityName, changes JSON, ip)
- Add middleware or service-layer hooks that log on every create/update/delete
- Build a `/api/audit-logs` endpoint with pagination, filtering, and export
- Replace the static list in AdminView with a paginated, filterable component

---

## 6. Integration Settings UX

### Layout Pattern: Integration Cards

The standard pattern (used by Zapier, Slack, Linear, Notion):

1. **Integrations listing page** -- Grid of cards, each showing:
   - Integration icon/logo
   - Name and one-line description
   - Status badge: "Connected", "Not configured", "Error"
   - "Configure" or "Connect" button

2. **Integration detail page** -- After clicking into an integration:
   - Connection status with last sync timestamp
   - Configuration form (endpoint URL, credentials, sync options)
   - Test button ("Send test webhook")
   - Activity log (recent deliveries, successes, failures)
   - Danger zone: disconnect/remove

### Webhook Management (Planza already has PublishPanel)

Enhancements based on best practices:
- **Delivery log with retry** -- Show each delivery attempt with status code, response time, payload preview. Allow manual retry of failed deliveries.
- **Secret signing** -- Display the webhook signing secret with a copy button. Allow rotation with a confirmation dialog.
- **Event selection** -- Checkboxes for which event types trigger the webhook (event.created, techPlan.updated, encoder.swapped, etc.)
- **Payload preview** -- Show a sample JSON payload for the selected event types so integrators can build against it.

### API Key Management

- Display keys in a table: Name, Key (masked with "Show" toggle), Created date, Last used, Scopes
- "Create new key" button that shows the full key ONCE with a copy button and a warning: "This is the only time you'll see this key"
- Revoke button with confirmation
- Optional: key expiration dates with email reminders before expiry

---

## 7. Power User Settings for Broadcast Planning

### What Broadcast Planners Want (derived from Vizrt, Dramatify, vMix, and domain analysis)

**A. Auto-Fill & Default Rules**
- Default encoder assignment per sport or venue
- Default crew template auto-applied when creating a tech plan for a given plan type (Planza already does this)
- Default channel assignment per competition (e.g., "Jupiler Pro League" always on "Canvas")
- Default event duration per sport (football=2h, cycling=5h, tennis=3h)
- Auto-fill participant names from recent fixtures for a competition

**B. Keyboard Shortcuts**
Priority shortcuts for broadcast planners:
| Action | Suggested Default |
|--------|------------------|
| New event | N |
| Quick search / command palette | Cmd+K |
| Navigate to today | T |
| Next/previous day/week | Arrow keys or J/K |
| Open tech plan for selected event | Enter |
| Assign encoder | E |
| Toggle sidebar | [ |
| Save current view | Cmd+S |
| Undo last action | Cmd+Z |

Implementation: Store shortcuts in user preferences. Show a "Keyboard Shortcuts" modal (triggered by "?") listing all bindings. Allow rebinding via a "Press new key" capture UX.

**C. Workflow Automation Triggers**
- "When event is created for [sport], auto-assign default crew template"
- "When event is within 24 hours and tech plan is incomplete, send reminder notification"
- "When encoder conflict detected, notify encoder coordinator"
- "When CSV import completes with errors, email the importer"
- These can start as hardcoded rules with toggle on/off, evolving into a rules engine later.

**D. View Customization**
- Planner view: configurable visible columns, row height, color-coding scheme (by sport, by status, by channel)
- Sports workspace: remember last-selected sport filter, tab, and sub-tab per user
- Crew matrix: configurable time granularity (15min, 30min, 1h)
- Saved filter presets: "My events this week", "Unassigned encoders", "Conflicts only"

**E. Template Management Access**
- Quick access to crew templates from both the admin panel AND inline in the tech plan card (Planza already does the latter)
- "Save current crew as template" directly from a tech plan
- Template versioning or "last modified" timestamp so users know if a template is stale
- Import/export templates as JSON for sharing between environments

**F. Broadcast-Specific Settings**
- Working hours definition (broadcast ops often run 06:00-01:00, not 9-5)
- Minimum crew rest period between assignments (configurable, e.g., 8 hours)
- Encoder cooldown/maintenance window configuration
- Channel lineup management (which channels are available, HD/UHD flags)
- Venue/location presets with default encoder and crew configurations

---

## 8. Concrete Recommendations for Planza

### Priority 1: Restructure Admin into Sidebar Navigation

Replace the 9-tab horizontal bar with a left sidebar grouped into the categories from Section 1. This immediately improves navigation as more sections are added.

### Priority 2: Separate User Preferences

Create a "Preferences" modal accessible from the user avatar menu. Move personal settings (theme, default view, timezone, notification prefs) out of Admin. Admin should only contain org-wide configuration.

### Priority 3: Build Real Audit Logging

Replace mock data with a real AuditLog model and filterable UI. This is both a power-user feature and a compliance requirement for broadcast operations where "who changed what when" matters for live event coordination.

### Priority 4: Add Notification Preferences

Start with in-app notifications for crew conflicts and assignment changes. Add the preference matrix UI so users can control what they receive.

### Priority 5: Enhance Integration Settings

Expand PublishPanel into a full Integrations section with delivery logs, retry, and payload preview. Add API key management for external system access.

### Priority 6: Keyboard Shortcuts

Implement a shortcut system with a "?" help modal. Start with navigation shortcuts (Cmd+K, arrow keys, T for today) and expand to action shortcuts.

---

## Sources

- [Settings UI Design Best Practices - SetProduct](https://www.setproduct.com/blog/settings-ui-design)
- [How to Improve App Settings UX - Toptal](https://www.toptal.com/designers/ux/settings-ux)
- [Designing Profile, Account, and Setting Pages - Medium/Bootcamp](https://medium.com/design-bootcamp/designing-profile-account-and-setting-pages-for-better-ux-345ef4ca1490)
- [Settings Pattern - Material Design](https://m1.material.io/patterns/settings.html)
- [Settings Page UI Examples - BricxLabs](https://bricxlabs.com/blogs/settings-page-ui-examples)
- [Enterprise Ready SaaS Audit Logging](https://www.enterpriseready.io/features/audit-log/)
- [Audit Logging Best Practices - Chris Dermody](https://chrisdermody.com/best-practices-for-audit-logging-in-a-saas-business-app/)
- [Guide to Building Audit Logs - Medium](https://medium.com/@tony.infisical/guide-to-building-audit-logs-for-application-software-b0083bb58604)
- [Notification Preferences Guide - SuprSend](https://www.suprsend.com/post/the-ultimate-guide-to-perfecting-notification-preferences-putting-your-users-in-control)
- [Design Guidelines for Better Notifications UX - Smashing Magazine](https://www.smashingmagazine.com/2025/07/design-guidelines-better-notifications-ux/)
- [Push Notification Best Practices - Boundev](https://www.boundev.com/blog/push-notification-best-practices-ux-guide)
- [How We Redesigned the Linear UI - Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [SaaS Roles and Permissions - Perpetual](https://www.perpetualny.com/blog/how-to-design-effective-saas-roles-and-permissions)
- [Modern SaaS Administration - Planorama](https://planorama.design/blog/designing-modern-enterprise-saas-users-and-access-management/)
- [Admin Dashboard Design Best Practices - Medium](https://medium.com/@rosalie24/admin-dashboard-design-best-practices-for-saas-platforms-2f77e21b394b)
- [Dramatify Crew Scheduling](https://dramatify.com/features/crew-scheduling)
- [Sports Broadcast Production Features - Dramatify](https://dramatify.com/sports-broadcast-production)
- [Svix - Webhooks as a Service](https://www.svix.com/)
