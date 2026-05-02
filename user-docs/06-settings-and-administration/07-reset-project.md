# How to reset a project

Resetting a project permanently deletes all generated content while preserving your spec files and team configuration. Use this when you want to start fresh — for example, after major API changes or during initial setup when you've been experimenting.

## Prerequisites

- Logged in with **Project Owner** role or above
- A project selected

## What gets deleted

| Deleted | Preserved |
|---|---|
| All flows (XML files) | Spec files |
| All ideas | API rules and diagnostic lessons |
| All active scenarios | Project variables |
| All test run history | Connections |
| Local UI caches | Team members and roles |
| | API keys |
| | Audit log |

## Steps

### 1. Open Settings > General

Click the **gear icon** in the SideNav, then select the **General** tab. Scroll to the **Danger Zone** section at the bottom.

<!-- SCREENSHOT
id: reset-project-section
alt: Settings General page Danger Zone section with Reset Project button
page: /settings
preconditions:
  - Logged in as Project Owner or above
actions:
  - Scroll to bottom of General tab
highlight: Danger Zone section with Reset Project button
annotations: Arrow pointing to Reset Project button
crop: main-content
-->
[Screenshot: Settings General page Danger Zone section with Reset Project button]

### 2. Click Reset Project

Click the red **Reset Project** button. A confirmation modal appears.

### 3. Confirm the reset

The modal warns:

> "All flows, ideas, active tests, and test run history will be permanently deleted. Spec files and user accounts are preserved."

Click **Yes, reset everything** to proceed.

### 4. Wait for completion

FlowForge deletes all flows, ideas, and test runs from the database. This may take a few seconds for large projects. The page refreshes automatically when done.

## After resetting

- The Spec Manager shows your spec files but no flows or ideas
- The Scenario Manager is empty (no scenarios to run)
- You can immediately regenerate ideas and flows from your preserved specs
- The audit log records the reset action

## Tips

- **Export results first**: If you need test run history, export or screenshot the results before resetting.
- **Consider selective deletion**: If you only need to remove specific flows, delete them individually from the Spec Manager rather than resetting the entire project.
- **API keys still work**: Resetting doesn't revoke API keys, but all scenarios they reference will be gone.

## Related articles

- [How to create and manage projects](../06-settings-and-administration/01-create-manage-projects.md) — Project lifecycle
- [How to generate test ideas from API specs](../03-ideas-and-flows/01-generate-test-ideas.md) — Regenerating after reset
- [How to view the audit log](../06-settings-and-administration/05-view-audit-log.md) — Reset is logged
