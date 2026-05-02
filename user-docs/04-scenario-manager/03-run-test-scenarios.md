# How to run test scenarios

Running scenarios executes your test flows against a live API endpoint. FlowForge shows real-time, step-by-step results as each API call is made.

## Prerequisites

- Logged in with **QA Engineer** role or above
- At least one scenario created
- A connection selected and healthy (see [How to connect an API endpoint](../04-scenario-manager/02-connect-api-endpoint.md))
- All `{{proj.*}}` variables resolved (no red variable banners)

## Steps

### 1. Select scenarios to run

In the Scenario Manager's left panel:

- **Single scenario**: Click a scenario to select it
- **Multiple scenarios**: Check the boxes next to each scenario you want to run
- **All scenarios**: Click the **Run All** button to execute everything in the version

### 2. Click Run

Click the **Run** button in the right panel. The test execution begins immediately.

<!-- SCREENSHOT
id: scenario-run-buttons
alt: Run controls showing Run and Run All buttons with scenario selection
page: /test-manager
preconditions:
  - Connection selected and healthy
  - Scenarios exist in the tree
actions:
  - Select one or more scenarios
highlight: Run and Run All buttons
annotations: Arrow pointing to Run button
crop: panel-right
-->
[Screenshot: Run controls showing Run and Run All buttons with scenario selection]

### 3. Watch live results

As the test executes, the results panel shows real-time progress:

- Each scenario appears as a group header
- Steps execute sequentially within each scenario
- Each step shows:
  - **Step name** and HTTP method (POST, GET, PUT, DELETE)
  - **Status icon** — green checkmark (pass) or red X (fail)
  - **Duration** — how long the step took

<!-- SCREENSHOT
id: scenario-live-results
alt: Live test results showing step-by-step execution with pass/fail indicators
page: /test-manager
preconditions:
  - A test run in progress or just completed
actions:
  - Run a scenario and watch results
highlight: Step results with status icons
annotations: Labels for step name, status, and duration
crop: panel-right
-->
[Screenshot: Live test results showing step-by-step execution with pass/fail indicators]

### 4. Review step details

Click on any step to expand its details:

- **Request** — HTTP method, full URL, headers, and request body sent
- **Response** — Status code, response headers, and response body received
- **Assertions** — Each assertion's expected value, actual value, and pass/fail result

<!-- SCREENSHOT
id: scenario-step-details
alt: Expanded step showing request, response, and assertion details
page: /test-manager
preconditions:
  - A test run completed with at least one step
actions:
  - Click on a step in the results
highlight: Request, response, and assertions sections
annotations: Labels for each section
crop: panel-right
-->
[Screenshot: Expanded step showing request, response, and assertion details]

## Understanding run outcomes

### Scenario-level status

| Status | Meaning |
|---|---|
| **Pass** (green) | All steps passed all assertions |
| **Fail** (red) | One or more steps had assertion failures |
| **Error** (yellow) | An execution error occurred (network issue, timeout, etc.) |

### Step-level status

| Status | Meaning |
|---|---|
| **Pass** | Status code and all assertions matched expected values |
| **Fail** | One or more assertions did not match |
| **Error** | Step couldn't execute (connection error, unresolved variable) |
| **Skipped** | Step was skipped due to a previous step failure |

> **Note:** Only the specific step with the problem is marked as error/fail — not the entire scenario. This makes it easy to pinpoint exactly where things went wrong.

## Running multiple scenarios

When running multiple scenarios:

- Scenarios execute sequentially
- Each scenario runs independently (a failure in one doesn't skip others)
- State variables (`{{state.*}}`) are scoped to each scenario — they don't leak between scenarios
- Results for all scenarios appear in the results panel

## Tips

- **Start with one scenario**: Run a single scenario first to verify the connection and basic flow before running everything.
- **Check variables first**: If the Run button is disabled, look for red banners about missing project variables.
- **Use breakpoints**: For debugging, set breakpoints on specific steps to pause execution (see [How to use breakpoints](../04-scenario-manager/05-use-breakpoints.md)).
- **Diagnose failures**: Don't manually debug failed steps — use the AI Diagnose feature for automated root cause analysis.

## Related articles

- [How to read test results and assertions](../04-scenario-manager/04-read-test-results.md) — Understanding results in detail
- [How to use breakpoints to debug tests](../04-scenario-manager/05-use-breakpoints.md) — Pausing execution
- [How to use AI diagnosis for failed steps](../04-scenario-manager/06-ai-diagnosis.md) — Automated debugging
