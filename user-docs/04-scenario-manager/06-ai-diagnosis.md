# How to use AI diagnosis for failed steps

When a test step fails, FlowForge's AI diagnosis analyzes the failure against the API spec to identify the root cause and suggest — or automatically apply — a fix.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A completed test run with at least one failing step
- AI credits available

## Steps

### 1. Find the failing step

1. In the **Scenario Manager**, locate the scenario with a red X (failed) status
2. Click the scenario to expand its steps
3. Find the step with the failure indicator

### 2. Open the Diagnose tab

Click the **Diagnose** tab on the failing step. FlowForge sends the failure context to the AI for analysis.

<!-- SCREENSHOT
id: diagnosis-tab
alt: Diagnose tab showing AI analysis of a failing step with root cause and suggested fix
page: /test-manager
preconditions:
  - A test run completed with a failing step
actions:
  - Click the failing step
  - Click Diagnose tab
highlight: Diagnosis results with root cause and fix suggestion
annotations: Labels for root cause, confidence level, and Fix it button
crop: panel-right
-->
[Screenshot: Diagnose tab showing AI analysis of a failing step with root cause and suggested fix]

### 3. Review the diagnosis

The AI provides:

| Field | Description |
|---|---|
| **Root cause** | What went wrong and why |
| **Category** | Type of issue (missing field, wrong value, schema mismatch, etc.) |
| **Confidence** | How confident the AI is in its diagnosis |
| **Can fix** | Whether the AI can automatically fix the issue |
| **Suggested fix** | Description of the proposed change |

### 4. Apply the fix

If the AI can fix the issue:

1. Click the **Fix it** button
2. The AI modifies the flow XML to correct the issue
3. Review the change in the diff view
4. If the fix looks correct, save it

If the fix succeeds, a **diagnostic lesson** is automatically recorded for future reference (see [API rules and diagnostic lessons](../02-spec-manager/06-configure-api-rules.md)).

### 5. Handle multiple fixes

When a scenario has multiple failing steps, the Diagnose tab supports **pagination** — you can navigate between fixes for each failing step:

- Use the **Next** and **Previous** buttons to move between fixes
- Each fix is independent and can be applied or skipped individually

## What the AI analyzes

The diagnosis considers:

- **The failing step's request and response** — What was sent and what came back
- **The API spec** — Expected schema, required fields, valid values
- **API rules** — Your custom rules for this version folder
- **Diagnostic lessons** — Previously learned fixes for similar issues
- **Flow context** — How this step relates to other steps (captures, dependencies)

## Anti-hallucination safeguards

When the API spec is unavailable for the failing endpoint, FlowForge enforces strict rules:

- Confidence is forced to **low**
- Automatic fix is **disabled** (you'll see suggestions but must apply manually)
- The AI explicitly notes that the spec is not available
- This prevents the AI from fabricating schemas or suggesting incorrect fixes

## Diagnosis categories

| Category | Description | Example |
|---|---|---|
| **missing_field** | Required field not in request body | `workspace_id` missing from POST |
| **wrong_value** | Field has incorrect value or format | Status as string instead of integer |
| **wrong_path** | Endpoint path is incorrect | `/article` instead of `/articles` |
| **schema_mismatch** | Response doesn't match expected schema | Field renamed in new API version |
| **auth_issue** | Authentication or authorization problem | Expired token, wrong scope |
| **no_spec** | Spec not available for analysis | Endpoint not imported |

## Tips

- **Fix the first failure first**: In a multi-step scenario, fixing the first failing step often resolves cascading failures in later steps.
- **Re-run after fixes**: After applying fixes, re-run the scenario to verify the changes work.
- **Lessons compound**: Each successful fix makes the AI smarter for future diagnoses. Over time, the same types of issues are caught and fixed faster.
- **Check the debug info**: The diagnosis includes metadata (`_debug` field) showing what context was available — useful if the diagnosis seems off.

## Related articles

- [How to read test results and assertions](../04-scenario-manager/04-read-test-results.md) — Understanding what failed
- [How to configure API rules and diagnostic lessons](../02-spec-manager/06-configure-api-rules.md) — How lessons are stored
- [How AI works in FlowForge](../07-ai-features/01-how-ai-works.md) — Understanding AI context
