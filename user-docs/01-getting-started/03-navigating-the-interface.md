# Navigating the FlowForge interface

FlowForge has a clean, focused layout designed around four main pages. This guide explains the interface structure so you can find your way around quickly.

## Overall layout

The FlowForge interface has three persistent elements:

- **TopBar** — Horizontal bar at the top with project name, AI cost tracker, credit usage, and version update indicator
- **SideNav** — Vertical sidebar on the left with page navigation icons
- **Main content area** — The active page content, which varies by page

<!-- SCREENSHOT
id: interface-layout-overview
alt: FlowForge interface with labeled TopBar, SideNav, and main content area
page: /spec-manager
preconditions:
  - Logged in with a project selected
  - Specs imported
actions:
  - Navigate to Spec Manager
highlight: Overall layout structure
annotations: Labels for TopBar, SideNav, and main content area with connecting lines
crop: full-page
-->
[Screenshot: FlowForge interface with labeled TopBar, SideNav, and main content area]

## TopBar

The TopBar is always visible and shows:

| Element | Description |
|---|---|
| **Project name** | The currently selected project — click to return to project selection |
| **AI cost pill** | Cumulative AI spend for the current session |
| **Credit usage pill** | Project-level AI credit consumption (turns red when exhausted) |
| **Update indicator** | Appears when a new FlowForge version is available — click to refresh |

## SideNav

The left sidebar provides quick access to all main pages:

| Icon | Page | Description |
|---|---|---|
| File/document icon | **Spec Manager** | Import, browse, and manage API specifications; generate ideas and flows |
| Test tube icon | **Scenario Manager** | Run test scenarios, view results, manage run history |
| Gear icon | **Settings** | Project configuration, team members, variables, connections, API keys |
| Grid icon | **Project Selection** | Switch between projects (also accessible by clicking the project name) |

The active page is highlighted in the SideNav. Navigation is instant — no page reloads.

## Page 1: Project Selection

The first screen after login. Displays all projects you have access to as tiles in a grid layout.

- **Project tiles** — Click to select and enter a project
- **Create Project** button — Start a new project (requires Project Owner role or above)
- **Visibility toggle** — Show/hide projects you're a member of

<!-- SCREENSHOT
id: interface-project-selection
alt: Project Selection page showing project tiles in a grid
page: /projects
preconditions:
  - Logged in
  - At least two projects exist
actions:
  - Navigate to Project Selection
highlight: Project tile grid
annotations: Label for Create Project button
crop: main-content
-->
[Screenshot: Project Selection page showing project tiles in a grid]

> **Tip:** Super Owners see all projects across the organization. Other users only see projects they've been invited to as members.

## Page 2: Spec Manager

The Spec Manager is where you work with API specifications and author test flows. It has a two-panel layout:

### Left panel — File tree
- **Version folders** — Top-level folders representing API versions (e.g., "v3")
- **Resource folders** — Subfolders grouping endpoints by resource (e.g., "articles", "categories")
- **Spec files** — Individual endpoint specification files (Markdown format)
- **System files** — Internal files (lock icon, muted text) containing rules, digests, and distilled specs
- **Drag and drop** — Move files and folders by dragging them in the tree
- **Context menu** — Right-click (or click "...") on any item for actions like rename, delete, or move

### Right panel — Content & tools
The right panel changes based on what's selected and which tab is active:

- **Viewer** tab — Read-only view of the selected spec file or flow XML
- **Ideas** tab — Generate and manage AI test ideas for the selected folder
- **Flows** tab — View and manage generated flow XML files
- **Chat** tab — Interactive conversation with the AI assistant about flows

<!-- SCREENSHOT
id: interface-spec-manager
alt: Spec Manager showing file tree on left and Ideas tab on right
page: /spec-manager
preconditions:
  - Specs imported
  - A folder selected
actions:
  - Select a resource folder in the file tree
  - Click the Ideas tab
highlight: Two-panel layout with file tree and Ideas tab
annotations: Labels for file tree, tab bar, and Ideas content
crop: main-content
-->
[Screenshot: Spec Manager showing file tree on left and Ideas tab on right]

## Page 3: Scenario Manager

The Scenario Manager is where you execute and monitor test scenarios. It also uses a two-panel layout:

### Left panel — Scenario tree
- **Version accordions** — Expandable sections for each API version
- **Folder tree** — Mirrors the spec folder structure, showing registered scenarios
- **Status badges** — Visual indicators for scenario state (active, locked, has overrides)
- **Context menu** — Right-click for actions like edit, delete, lock/unlock, or set environment overrides

### Right panel — Run controls & results
- **Connect** — Select an API connection for the version
- **Run controls** — Run selected scenarios or all scenarios; shows health check status
- **Live results** — Real-time step-by-step execution output
- **Run history** — Past runs with clickable rows to review details

<!-- SCREENSHOT
id: interface-scenario-manager
alt: Scenario Manager showing scenario tree on left and run results on right
page: /test-manager
preconditions:
  - At least one scenario created and run
actions:
  - Navigate to Scenario Manager
  - Expand a version to show scenarios
highlight: Scenario tree and results panel
annotations: Labels for version accordion, scenario tree, run controls, and results
crop: main-content
-->
[Screenshot: Scenario Manager showing scenario tree on left and run results on right]

## Page 4: Settings

Settings is organized with a secondary navigation on the left side, showing different tabs based on your role:

| Tab | Required role | Description |
|---|---|---|
| **General** | Member | Project name and basic configuration |
| **Connections** | QA Engineer | API connections with credentials and auth setup |
| **Variables** | QA Engineer | Project-level key-value variables used in flows |
| **Members** | QA Manager | Invite and manage team members, assign roles |
| **API Keys** | QA Manager | Manage keys for the Public API |
| **AI Credits** | Owner | Monitor and configure AI credit budgets |
| **Audit Log** | QA Manager | View all tracked actions in the project |
| **Users** | Super Owner | Organization-wide user management |

<!-- SCREENSHOT
id: interface-settings
alt: Settings page showing the secondary navigation tabs and Connections content
page: /settings
preconditions:
  - Logged in as QA Manager or above
actions:
  - Navigate to Settings
  - Click Connections tab
highlight: Left navigation tabs and main content area
annotations: Labels for each settings tab
crop: main-content
-->
[Screenshot: Settings page showing the secondary navigation tabs and Connections content]

## Keyboard shortcuts and tips

- Navigation between pages is via the SideNav icons — there are no keyboard shortcuts for page switching
- The file tree in Spec Manager supports keyboard navigation (arrow keys to expand/collapse)
- Use the browser's back/forward buttons to navigate between previously viewed items

## Related articles

- [What is FlowForge?](../01-getting-started/01-what-is-flowforge.md) — Product overview
- [Quick start: Your first API test in 10 minutes](../01-getting-started/02-quick-start.md) — Hands-on tutorial
- [Understanding roles and permissions](../01-getting-started/04-roles-and-permissions.md) — What each role can access
