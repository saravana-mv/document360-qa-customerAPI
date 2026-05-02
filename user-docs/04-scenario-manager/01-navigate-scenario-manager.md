# How to navigate the Scenario Manager

The Scenario Manager is where you run test scenarios, view results, and track test execution history. This guide explains its layout and navigation.

## Prerequisites

- Logged in with any role (Member or above)
- A project selected with at least one scenario created

## Opening the Scenario Manager

Click the **test tube icon** in the SideNav (left sidebar) to open the Scenario Manager.

## Layout overview

The Scenario Manager has a two-panel layout:

- **Left panel** — Scenario tree showing all registered test scenarios
- **Right panel** — Run controls, live results, and run history

<!-- SCREENSHOT
id: scenario-manager-overview
alt: Scenario Manager showing the scenario tree on the left and run results on the right
page: /test-manager
preconditions:
  - At least one scenario exists
  - At least one test run completed
actions:
  - Navigate to Scenario Manager
highlight: Two-panel layout
annotations: Labels for scenario tree, run controls, and results panel
crop: full-page
-->
[Screenshot: Scenario Manager showing the scenario tree on the left and run results on the right]

## Scenario tree (left panel)

### Version accordions

The tree is organized by **version folders** (matching the Spec Manager structure). Each version appears as an expandable accordion:

- Click the version header to expand/collapse
- The version name matches your spec version folder (e.g., "v3")
- Each version can have its own API connection

### Folder tree

Inside each version, scenarios are organized in the same folder structure as your specs:

```
v3/                     <- Version accordion
  articles/             <- Resource folder
    create-and-retrieve-article    <- Scenario
    update-article-fields          <- Scenario
  categories/           <- Resource folder
    create-category-hierarchy      <- Scenario
```

### Status badges

Each scenario shows a status badge:

| Badge | Meaning |
|---|---|
| Grey circle | Idle — not yet run |
| Blue spinner | Running — currently executing |
| Green checkmark | Passed — all steps succeeded |
| Red X | Failed — one or more steps failed |
| Yellow warning | Error — execution error (not an assertion failure) |
| Lock icon | Locked — scenario is locked by a QA Manager |
| Blue slider icon | Override — has per-scenario environment override |

### Context menu

Right-click (or click "...") on a scenario for actions:

| Action | Required role | Description |
|---|---|---|
| **Edit** | QA Engineer | Open the flow XML in an editor |
| **Copy Scenario ID** | Member | Copy the unique ID to clipboard |
| **Lock / Unlock** | QA Manager | Prevent or allow editing and deletion |
| **Environment Override** | QA Manager | Set per-scenario connection overrides |
| **Delete** | QA Engineer | Remove the scenario (preserves the flow XML) |

<!-- SCREENSHOT
id: scenario-context-menu
alt: Context menu on a scenario node showing available actions
page: /test-manager
preconditions:
  - At least one scenario exists
actions:
  - Right-click on a scenario name
highlight: Context menu dropdown
annotations: Labels for each menu option
crop: panel-left
-->
[Screenshot: Context menu on a scenario node showing available actions]

## Run controls and results (right panel)

The right panel contains:

### Connection selector
Select which API connection to use for running scenarios in this version. The connection provides base URL, API version, and credentials.

### Run buttons
- **Run** — Execute selected scenarios
- **Run All** — Execute all scenarios in the version
- Health check status indicator (green = ready, red = connection issue)

### Live results
During and after a run, step-by-step results appear showing:
- Step name and HTTP method
- Pass/fail status
- Duration
- Expandable details for request, response, and assertions

### Run history tab
Switch to the Run History tab to view past test runs with timestamps and outcomes.

## Selecting scenarios

- **Click** a scenario to select it for viewing or running
- **Checkbox** next to each scenario for multi-select
- **Select All / Deselect All** toggle for the entire version

## Tips

- **Expand all**: Use the expand/collapse toggle to quickly see all scenarios.
- **Locked scenarios**: If you see a lock icon, a QA Manager has protected that scenario from changes.
- **Tree state persists**: Your expansion state and selections are saved between sessions.

## Related articles

- [How to connect an API endpoint](../04-scenario-manager/02-connect-api-endpoint.md) — Setting up the connection
- [How to run test scenarios](../04-scenario-manager/03-run-test-scenarios.md) — Executing tests
- [How to read test results and assertions](../04-scenario-manager/04-read-test-results.md) — Understanding outcomes
