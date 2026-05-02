# How to view the audit log

The audit log records all significant actions taken within a project — who did what, when, and to which resource. Use it to track changes, investigate issues, and maintain compliance.

## Prerequisites

- Logged in with **QA Manager** role or above
- A project selected

## Accessing the audit log

1. Click the **gear icon** in the SideNav to open Settings
2. Select the **Audit Log** tab

The page shows a paginated list of audit entries with the total count displayed in the header.

<!-- SCREENSHOT
id: audit-log-page
alt: Settings Audit Log page showing filtered list of actions
page: /settings
preconditions:
  - Logged in as QA Manager or above
  - Project has some activity
actions:
  - Click Settings > Audit Log tab
highlight: Audit log table with filters
annotations: Labels for filter controls and action badges
crop: main-content
-->
[Screenshot: Settings Audit Log page showing filtered list of actions]

## Reading the audit log

Each entry shows:

| Column | Description |
|---|---|
| **Action** | What happened — color-coded badge by category |
| **Target** | The resource that was affected (name or path) |
| **User** | Who performed the action |
| **Timestamp** | When it happened (relative time, e.g., "2 minutes ago") |
| **Details** | Additional context (key-value pairs) |

### Action categories and colors

| Category | Badge color | Example actions |
|---|---|---|
| **Flows** | Blue | Flow created, updated, deleted, locked, unlocked |
| **Scenarios** | Green | Scenario activated, deactivated, run |
| **Specs** | Amber | Spec uploaded, updated, renamed, deleted, imported, synced |
| **API Keys** | Purple | Key created, revoked |
| **Users** | Red | Member invited, role changed, removed |
| **Project** | Red | Project reset |

## Filtering the log

Three filters are available above the log table:

### Search

Type in the search box to filter by action name, target name, or user. Press **Enter** to apply.

### Action filter

Select a specific action type from the dropdown (grouped by category). Choose "All actions" to clear the filter.

### Date range

Enter **From** and **To** dates (YYYY-MM-DD format) to narrow results to a specific time period.

All filters can be combined — for example, search for a user name while filtering to "Flow created" actions within the last week.

## Pagination

The log displays 50 entries per page. Use the **Previous** and **Next** buttons at the bottom to navigate. The current page and total entry count are shown.

## What gets logged

| Action | Logged when |
|---|---|
| Flow created | A new flow XML is saved in the Spec Manager |
| Flow updated | An existing flow is edited (manual or AI-assisted) |
| Flow deleted | A flow file is removed |
| Flow locked/unlocked | A QA Manager locks or unlocks a flow |
| Scenario activated | A flow is registered as a runnable scenario |
| Scenario deactivated | A scenario is removed from the runner |
| Scenario run | A scenario is executed (browser or API) |
| Spec uploaded | Spec files are uploaded manually |
| Spec imported | Specs are imported from an OpenAPI URL |
| Spec synced | Specs are re-imported/synced from source |
| API key created | A new Public API key is generated |
| API key revoked | An API key is permanently revoked |
| Member invited | A new user is added to the project |
| Role changed | A member's project role is updated |
| Member removed | A user is removed from the project |
| Project reset | All flows, ideas, and test runs are wiped |

## Tips

- **Investigate failures**: If a scenario suddenly fails, check the audit log for recent flow edits or variable changes.
- **Track API usage**: Filter by "API key" actions to see key creation and revocation history.
- **Compliance**: The audit log provides a full trail of who changed what — useful for regulated environments.

## Related articles

- [Understanding roles and permissions](../01-getting-started/04-roles-and-permissions.md) — Who can perform which actions
- [How to manage team members](../06-settings-and-administration/02-manage-team-members.md) — Member changes are logged
- [How to manage API keys for the Public API](../06-settings-and-administration/04-manage-api-keys.md) — Key events are logged
