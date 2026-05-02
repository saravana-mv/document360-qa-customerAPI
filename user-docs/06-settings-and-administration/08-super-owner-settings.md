# Super Owner: Global settings and user management

Super Owners have tenant-wide administrative access in FlowForge. They can see all projects, manage global AI credit defaults, and invite other Super Owners. This guide covers the Global Settings page available exclusively to Super Owners.

## Prerequisites

- Logged in with **Super Owner** role

## Accessing Global Settings

On the Project Selection page, a **settings icon** appears in the top-right header area (visible only to Super Owners). Click it to open the Global Settings page.

<!-- SCREENSHOT
id: global-settings-page
alt: Global Settings page showing AI credit defaults and Super Owner management
page: /global-settings
preconditions:
  - Logged in as Super Owner
actions:
  - Click settings icon on Project Selection page
highlight: AI Credits section and Super Owners section
annotations: Labels for default budget fields and Super Owner list
crop: full-page
-->
[Screenshot: Global Settings page showing AI credit defaults and Super Owner management]

## AI credit defaults

Set the default credit budgets that apply to new projects and new users:

| Field | Description |
|---|---|
| **Default Project Budget (USD)** | Starting AI credit limit for newly created projects |
| **Default User Budget (USD)** | Starting AI credit limit for new users across all projects |

Click **Update** to save changes. These defaults only apply to resources created after the change — existing projects and users keep their current budgets.

## Super Owner management

The Super Owners section lists all users with the `owner` tenant role.

### Inviting a Super Owner

1. Enter the user's email address
2. Click **Invite**

The user is created with Super Owner privileges. If they already have a FlowForge account, their role is elevated. Super Owners automatically have access to all projects.

## Super Owner capabilities

| Capability | Description |
|---|---|
| **See all projects** | Every project is visible on the Project Selection page |
| **Delete any project** | Trash icon on project tiles (with confirmation) |
| **Manage all AI budgets** | Edit project and user credit limits in any project's Settings |
| **Access Global Settings** | Tenant-wide configuration page |
| **Bypass role checks** | Full access to all Settings tabs in every project |
| **Invite Super Owners** | Add other tenant administrators |

## How Super Owners differ from Project Owners

| | Super Owner | Project Owner |
|---|---|---|
| **Scope** | All projects (tenant-wide) | Single project |
| **Project visibility** | Sees every project | Sees only assigned projects |
| **Delete projects** | Yes | No |
| **Global Settings** | Yes | No |
| **AI budget management** | All projects | Own project only |
| **Assigned automatically** | No (must be invited) | Per-project assignment |

## First Super Owner

The first Super Owner is configured via the `SEED_OWNER_OID` environment variable during deployment. This user is automatically recognized as the tenant owner on first login. Additional Super Owners are added through the Global Settings page.

## Tips

- **Limit Super Owners**: Keep the number small (1–3) since they have unrestricted access across all projects.
- **Set reasonable defaults**: Default credit budgets should cover typical usage. Teams can always request increases.
- **Use Project Owners for day-to-day management**: Delegate project-level administration to Project Owners rather than using Super Owner access for everything.

## Related articles

- [Understanding roles and permissions](../01-getting-started/04-roles-and-permissions.md) — Full role hierarchy
- [How to manage AI credits](../06-settings-and-administration/06-manage-ai-credits.md) — Per-project credit management
- [How to create and manage projects](../06-settings-and-administration/01-create-manage-projects.md) — Project lifecycle
