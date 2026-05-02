# How to create and manage projects

Projects are the top-level containers in FlowForge. Each project holds its own specs, flows, scenarios, connections, variables, and team members. This guide covers creating, selecting, and deleting projects.

## Prerequisites

- Logged in to FlowForge
- **Project Owner** role or above to create projects

## The Project Selection page

After logging in, you land on the Project Selection page — a grid of project tiles showing all projects you have access to.

Each tile displays:
- Project name
- Description (if set)
- Member count
- Last updated time

<!-- SCREENSHOT
id: project-selection-page
alt: Project Selection page showing grid of project tiles
page: /projects
preconditions:
  - Logged in
  - At least two projects exist
actions:
  - Navigate to /projects
highlight: Project tile grid
annotations: Labels for project name, member count, and Create Project button
crop: full-page
-->
[Screenshot: Project Selection page showing grid of project tiles]

## Creating a project

### 1. Click Create Project

Click the **Create Project** button in the top-right corner. An inline form appears above the project tiles.

### 2. Fill in the details

| Field | Required | Description |
|---|---|---|
| **Project name** | Yes | A unique name for the project |
| **Description** | No | Brief description of what this project tests |

### 3. Submit

Press **Enter** or click **Create**. The project is created and appears as a new tile. Click it to enter the project.

## Selecting a project

Click any project tile to enter it. The tile highlights with a blue border on hover. Once selected, FlowForge loads that project's data across all pages (Spec Manager, Scenario Manager, Settings).

To switch projects, click the project name in the TopBar to return to the Project Selection page.

## Deleting a project

> **Warning:** Project deletion is permanent and cannot be undone.

Only **Super Owners** can delete projects.

1. Hover over the project tile — a trash icon appears
2. Click the trash icon
3. A confirmation modal appears listing everything that will be deleted:
   - Spec files
   - Flows
   - Test runs
   - API keys
   - Members
   - Audit logs
4. Type the exact project name to confirm
5. Click **Delete**

## Who can do what

| Action | Required role |
|---|---|
| View projects | Any authenticated user (sees only assigned projects) |
| Create a project | Project Owner or above |
| Enter a project | Any project member |
| Delete a project | Super Owner only |

> **Note:** Super Owners can see and access all projects. Other users see only projects they've been invited to.

## Tips

- **One project per API**: Keep each API in its own project for clean separation of specs, variables, and credentials.
- **Descriptive names**: Use names like "Customer API - Production" to help team members identify projects quickly.
- **No projects visible?** If you see an empty page, ask a Project Owner to invite you to a project.

## Related articles

- [Navigating the FlowForge interface](../01-getting-started/03-navigating-the-interface.md) — Understanding the layout
- [How to manage team members](../06-settings-and-administration/02-manage-team-members.md) — Inviting users to projects
- [Understanding roles and permissions](../01-getting-started/04-roles-and-permissions.md) — Role hierarchy
