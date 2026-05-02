# How to use breakpoints to debug tests

Breakpoints let you pause test execution at a specific step so you can inspect the current state before continuing. This is valuable for debugging multi-step scenarios where you need to see intermediate results.

## Prerequisites

- Logged in with **QA Engineer** role or above
- At least one scenario created
- A connection selected and healthy

## Setting a breakpoint

### Before a run

1. In the **Scenario Manager**, expand a scenario to see its steps
2. Click the **breakpoint indicator** (circle/dot) next to the step where you want to pause
3. The breakpoint appears as a red dot, indicating execution will pause before this step runs

<!-- SCREENSHOT
id: breakpoints-set
alt: Scenario steps with a breakpoint set on step 3, shown as a red dot
page: /test-manager
preconditions:
  - A scenario expanded to show steps
actions:
  - Click the breakpoint indicator on a step
highlight: Red breakpoint dot on a step
annotations: Arrow pointing to breakpoint indicator
crop: panel-left
-->
[Screenshot: Scenario steps with a breakpoint set on step 3, shown as a red dot]

### During a run

You can also set breakpoints while a test is running. If the runner hasn't reached that step yet, it will pause when it gets there.

## Running with breakpoints

1. Set one or more breakpoints
2. Click **Run** as normal
3. Execution proceeds step by step until it reaches a breakpoint
4. The runner **pauses** at the breakpoint step

When paused:

- The current step is highlighted
- All completed steps show their results
- The step at the breakpoint has **not yet executed**

## Inspecting state at a breakpoint

While paused, you can:

- **Review previous step results** — Check responses, assertions, and captured values
- **Verify captures** — Confirm that `{{state.*}}` variables have the expected values
- **Check the request** — See what the next step will send (with variables already resolved)

## Resuming execution

Click the **Resume** (play) button to continue execution:

- The paused step executes
- Execution continues until the next breakpoint or the end of the scenario

## Removing breakpoints

- **Individual**: Click the red breakpoint dot to remove it
- **All**: Breakpoints are stored locally and persist between sessions. Clear them by clicking each one.

## Breakpoint persistence

Breakpoints are saved in your browser's local storage:

- They persist between browser sessions
- They are per-user (other team members don't see your breakpoints)
- They survive page refreshes

## Use cases

### Debug a failing step

1. Set a breakpoint on the failing step
2. Run the scenario
3. When paused, check the captured values from previous steps
4. Verify the request body is correct before the step executes
5. Resume and observe the actual failure with full context

### Verify data flow

1. Set breakpoints after each step that captures data
2. Run and pause at each breakpoint
3. Confirm captured values match expectations
4. Verify the next step's request uses the captured values correctly

### Test with manual API changes

1. Set a breakpoint at a mid-point in the scenario
2. Run until the breakpoint
3. Use another tool (Postman, curl) to make manual changes to the API
4. Resume the scenario to test the remaining steps against the modified state

## Tips

- **Multiple breakpoints**: You can set breakpoints on several steps. Execution pauses at each one in order.
- **Breakpoints + diagnosis**: Combine breakpoints with AI diagnosis — pause before a known-failing step, inspect the state, then resume and diagnose the failure.
- **Don't forget to remove**: Leftover breakpoints from a previous debugging session can be confusing. Remove them when you're done.

## Related articles

- [How to run test scenarios](../04-scenario-manager/03-run-test-scenarios.md) — Running tests
- [How to read test results and assertions](../04-scenario-manager/04-read-test-results.md) — Understanding results
- [How to use AI diagnosis for failed steps](../04-scenario-manager/06-ai-diagnosis.md) — Automated debugging
