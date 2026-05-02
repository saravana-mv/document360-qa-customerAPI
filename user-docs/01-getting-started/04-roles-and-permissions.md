# Understanding roles and permissions

FlowForge uses a 5-tier role hierarchy to control what each team member can do within a project. This guide explains each role, its permissions, and how roles are assigned.

## Role hierarchy

Roles are ranked from highest to lowest privilege. A higher role includes all permissions of the roles below it.

| Level | Role | Description |
|---|---|---|
| 5 | **Super Owner** | Organization-wide administrator — full access to all projects and global settings |
| 4 | **Project Owner** | Full control of a specific project — can manage members, credits, and all settings |
| 3 | **QA Manager** | Manages test workflows — can lock scenarios, manage members, view audit logs |
| 2 | **QA Engineer** | Day-to-day testing — can create flows, run tests, configure connections and variables |
| 1 | **Member** | Read-only participant — can view specs, scenarios, and results but cannot modify |

## What each role can do

### Member (Level 1)

- View all specs, ideas, flows, and scenarios
- View test run results and history
- View project settings (General tab only)

Members are the default role assigned when someone is invited to a project. This role is suitable for stakeholders who need visibility into test results without making changes.

### QA Engineer (Level 2)

Everything a Member can do, plus:

- Import and upload API spec files
- Generate AI test ideas and flows
- Create and edit flow XML
- Create test scenarios from flows
- Run test scenarios
- Use AI diagnosis for failed steps
- Configure connections (add, edit credentials)
- Manage project variables
- Use the Flow Designer chat

This is the primary working role for team members who write and execute tests.

### QA Manager (Level 3)

Everything a QA Engineer can do, plus:

- **Lock/unlock scenarios** — Prevent other users from editing or deleting locked scenarios
- **Manage team members** — Invite users to the project, change roles, remove members
- **Manage API keys** — Create and revoke keys for the Public API
- **View audit log** — See all tracked actions in the project
- **Delete scenarios** — Remove test scenarios (even those created by others)

QA Managers oversee the testing process and control who has access to the project.

### Project Owner (Level 4)

Everything a QA Manager can do, plus:

- **Create projects** — Start new projects from the Project Selection page
- **Manage AI credits** — Set credit budgets for the project and monitor usage
- **Reset project** — Wipe all flows, ideas, and test runs (destructive action)
- **Delete project** — Remove the entire project

Project Owners have full administrative control over their projects.

### Super Owner (Level 5)

Everything a Project Owner can do, plus:

- **See all projects** — Access every project in the organization, regardless of membership
- **Manage all users** — Organization-wide user management via Settings > Users
- **Bypass permission checks** — No restrictions on any action in any project
- **Set global AI credit budgets** — Control AI spending across the organization

Super Owners are typically system administrators. The first Super Owner is designated during initial setup via the `SEED_OWNER_OID` environment variable.

## How roles are assigned

### Initial setup
The first user (identified by `SEED_OWNER_OID`) is automatically created as a Super Owner. All subsequent users must be invited.

### Inviting team members
1. Go to **Settings** > **Members** (requires QA Manager role or above)
2. Click **Invite Member**
3. The invited user receives access to the project
4. New users who don't have an organization-wide account are auto-created with the **Member** role at the tenant level

### Changing roles
1. Go to **Settings** > **Members**
2. Find the team member in the list
3. Select a new role from the dropdown
4. Changes take effect immediately

> **Important:** You can only assign roles up to your own level. A QA Manager cannot promote someone to Project Owner.

<!-- SCREENSHOT
id: roles-members-page
alt: Settings Members page showing team member list with role dropdowns
page: /settings
preconditions:
  - Logged in as QA Manager or above
  - At least two team members exist
actions:
  - Navigate to Settings > Members tab
highlight: Member list with role dropdown
annotations: Arrow pointing to role dropdown for a team member
crop: main-content
-->
[Screenshot: Settings Members page showing team member list with role dropdowns]

## Role-gated UI elements

FlowForge automatically hides or disables UI elements based on your role:

| Element | Minimum role |
|---|---|
| View specs, scenarios, results | Member |
| Run tests, edit flows | QA Engineer |
| Connections and Variables tabs | QA Engineer |
| Lock/unlock scenarios | QA Manager |
| Members tab | QA Manager |
| API Keys tab | QA Manager |
| Audit Log tab | QA Manager |
| AI Credits tab | Project Owner |
| Reset Project button | Project Owner |
| Users tab (global) | Super Owner |

If you can't see a feature mentioned in this documentation, check with your project administrator — you may need a higher role.

## Tips

- **Least privilege principle** — Assign the lowest role that allows a team member to do their job. Most testers need QA Engineer; managers need QA Manager.
- **Project isolation** — Roles are per-project. A user can be a QA Manager in one project and a Member in another.
- **Audit trail** — All role changes are logged in the audit log for accountability.

## Related articles

- [How to manage team members](../06-settings-and-administration/02-how-to-manage-team-members.md) — Step-by-step member management
- [How to view the audit log](../06-settings-and-administration/05-how-to-view-the-audit-log.md) — Track all project actions
- [Navigating the FlowForge interface](../01-getting-started/03-navigating-the-interface.md) — Where to find role-gated features
