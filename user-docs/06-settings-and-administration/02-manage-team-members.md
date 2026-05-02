# How to manage team members

FlowForge uses project-level membership to control who can access each project and what they can do. This guide covers inviting members, assigning roles, and removing access.

## Prerequisites

- Logged in with **QA Manager** role or above
- A project selected

## Viewing members

1. Click the **gear icon** in the SideNav to open Settings
2. Select the **Members** tab

The members list shows everyone with access to the current project:

| Column | Description |
|---|---|
| **Member** | Display name |
| **Email** | Email address |
| **Project Role** | Current role (color-coded badge) |
| **Status** | Active or Invited |
| **Added** | Date the member was added |

<!-- SCREENSHOT
id: members-page
alt: Settings Members page showing list of project members with roles
page: /settings
preconditions:
  - Logged in as QA Manager or above
  - At least two members exist
actions:
  - Click Settings > Members tab
highlight: Members table with role badges
annotations: Labels for role column and Add member button
crop: main-content
-->
[Screenshot: Settings Members page showing list of project members with roles]

## Inviting a member

### 1. Click Add member

Click the green **Add member** button in the top-right corner.

### 2. Fill in the details

| Field | Required | Description |
|---|---|---|
| **Email address** | Yes | The user's email (must match their Entra ID login) |
| **Display name** | No | How the user appears in the members list |
| **Project role** | Yes | QA Engineer (default), QA Manager, or Project Owner |

### 3. Click Add member

The user is added immediately. If they don't have a FlowForge account yet, one is auto-created with the `member` tenant role.

## Changing a member's role

1. In the members list, find the user
2. Click the role dropdown next to their name
3. Select the new role

Available project roles:

| Role | Badge color | Description |
|---|---|---|
| **QA Engineer** | Green | Can view specs, run scenarios, use AI features |
| **QA Manager** | Blue | + Access to Settings, can manage members and connections |
| **Project Owner** | Purple | + Full project control, can reset project |

> **Note:** At least one Project Owner must exist. The role selector is disabled for the last remaining Project Owner to prevent orphaning the project.

## Removing a member

1. Click the trash icon on the member's row
2. Confirm the removal

The user immediately loses access to the project and all its resources.

> **Warning:** Removing the last Project Owner is not allowed. Assign another member as Project Owner first.

## Tips

- **Start with QA Engineer**: Assign the lowest sufficient role. Promote to QA Manager when members need Settings access.
- **Check the status column**: "Invited" means the user hasn't logged in yet.
- **Email must match Entra ID**: The email address must match the user's Microsoft Entra ID login for authentication to work.

## Related articles

- [Understanding roles and permissions](../01-getting-started/04-roles-and-permissions.md) — Full role hierarchy
- [How to create and manage projects](../06-settings-and-administration/01-create-manage-projects.md) — Project setup
- [Super Owner: Global settings and user management](../06-settings-and-administration/08-super-owner-settings.md) — Tenant-level user management
