# How to view and compare run history

FlowForge persists every test run with full step-level detail. You can review past runs, compare results over time, and track regressions.

## Prerequisites

- Logged in with any role (Member or above)
- At least one test run completed

## Viewing run history

### 1. Open the Run History tab

In the **Scenario Manager**, click the **Run History** tab in the right panel. This shows a chronological list of all test runs.

<!-- SCREENSHOT
id: run-history-list
alt: Run History tab showing a list of past test runs with timestamps and status summaries
page: /test-manager
preconditions:
  - Multiple test runs completed
actions:
  - Click Run History tab
highlight: Run history list with timestamps and pass/fail counts
annotations: Labels for timestamp, status summary, and scenario count
crop: panel-right
-->
[Screenshot: Run History tab showing a list of past test runs with timestamps and status summaries]

### 2. Review a past run

Each run entry shows:

| Field | Description |
|---|---|
| **Timestamp** | When the run started |
| **Duration** | How long the run took |
| **Status summary** | Count of passed, failed, and errored scenarios |
| **Scenarios included** | Which scenarios were part of this run |

### 3. Click a run to view details

Click any run row to load its full results into the results panel. You'll see:

- Step-by-step results for each scenario
- Request/response data for each step
- Assertion outcomes
- Captured values

<!-- SCREENSHOT
id: run-history-details
alt: Past run details loaded into the results panel with step-level data
page: /test-manager
preconditions:
  - Multiple runs exist
actions:
  - Click on a past run in Run History
highlight: Run details with step results
annotations: Label for "Back to live" banner
crop: panel-right
-->
[Screenshot: Past run details loaded into the results panel with step-level data]

### 4. Return to live view

When viewing a past run, a **"Back to live"** banner appears at the top. Click it to return to the current/most recent run view.

## Comparing runs

To compare results between runs:

1. Note the results of a specific scenario in one run
2. Click another run to view its results
3. Compare step-by-step outcomes, response data, and assertion values

This helps you:

- **Detect regressions** — A step that passed before now fails
- **Verify fixes** — A previously failing step now passes after a flow update
- **Track API stability** — Consistent pass/fail patterns over time

## What's stored in each run

Every run persists:

- Start and end timestamps
- The connection used (base URL, API version)
- Pass/fail status per scenario
- Pass/fail status per step
- Full request details (method, URL, headers, body)
- Full response details (status, headers, body)
- Assertion outcomes (expected vs. actual)
- Captured variable values

## Run retention

Test runs are stored in Cosmos DB and persist indefinitely (subject to your storage limits). They are scoped to the project — each project has its own independent run history.

## Tips

- **Run regularly**: Frequent test runs create a history that makes regressions easy to spot.
- **Compare before and after**: When your API changes, compare a pre-change run with a post-change run to see exactly what broke.
- **Use for reporting**: Run history provides evidence of test coverage and API reliability over time.

## Related articles

- [How to run test scenarios](../04-scenario-manager/03-run-test-scenarios.md) — Creating new runs
- [How to read test results and assertions](../04-scenario-manager/04-read-test-results.md) — Understanding step-level results
- [How to navigate the Scenario Manager](../04-scenario-manager/01-navigate-scenario-manager.md) — Finding your way around
