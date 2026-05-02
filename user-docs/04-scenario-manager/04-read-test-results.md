# How to read test results and assertions

Understanding test results is key to effective API testing. This guide explains how to read step-level results, interpret assertions, and identify the root cause of failures.

## Prerequisites

- At least one test run completed
- Logged in with any role (Member or above)

## Step-level results

Each step in a scenario shows:

| Field | Description |
|---|---|
| **Step name** | The description from the flow XML |
| **HTTP method** | GET, POST, PUT, PATCH, DELETE |
| **Status icon** | Green checkmark (pass), red X (fail), yellow warning (error) |
| **Duration** | Time taken for the API call |

Click a step to expand its full details.

## Request details

The request section shows exactly what was sent to the API:

- **Method + URL** — Full URL including base URL, path, and query parameters
- **Headers** — All request headers (auth headers are injected by the proxy)
- **Body** — The request body (JSON) with all variables resolved

This is useful for verifying that variables, captures, and interpolations resolved correctly.

## Response details

The response section shows what the API returned:

- **Status code** — The HTTP status (e.g., 200, 201, 404, 500)
- **Headers** — Response headers
- **Body** — The full response body (JSON), displayed in a formatted CodeMirror viewer

## Assertions

Assertions are the core of test validation. Each assertion shows:

| Column | Description |
|---|---|
| **Type** | What's being checked (status code, field value, existence) |
| **Expected** | The value defined in the flow XML |
| **Actual** | The value from the API response |
| **Result** | Pass (green) or Fail (red) |

<!-- SCREENSHOT
id: results-assertions
alt: Assertion results showing expected vs actual values with pass/fail indicators
page: /test-manager
preconditions:
  - A test run with both passing and failing assertions
actions:
  - Expand a step with mixed assertion results
highlight: Assertion table with expected/actual columns
annotations: Labels for expected value, actual value, and result indicator
crop: panel-right
-->
[Screenshot: Assertion results showing expected vs actual values with pass/fail indicators]

### Status code assertions

```xml
<assertion><status code="201"/></assertion>
```

Checks that the HTTP response status matches the expected code. A `201` assertion fails if the API returns `200` or `400`.

### Field value assertions

```xml
<assertion><field path="response.data.title" value="Test Article"/></assertion>
```

Checks that a specific field in the JSON response matches an expected value. The `path` uses dot notation to navigate the response structure.

### How values are compared

FlowForge uses **bidirectional matching** for assertions:

- **String comparison**: Exact match (case-sensitive)
- **Numeric comparison**: `"1"` matches `1` (type-flexible)
- **Enum aliases**: If configured, `"Published"` matches `1` when the alias `Published=1` is defined (see [API rules](../02-spec-manager/06-configure-api-rules.md))
- **Null handling**: `null` in response matches expected `null`

## Captures

Steps with captures show the extracted values:

| Capture | Path | Value |
|---|---|---|
| `article_id` | `response.data.id` | `abc-123-def` |
| `category_id` | `response.data.category_id` | `cat-456` |

These captured values feed into subsequent steps as `{{state.article_id}}`, etc.

## Diagnosing failures

When a step fails:

1. **Check the assertion table** — Compare expected vs. actual values
2. **Check the response body** — Look for error messages or unexpected structure
3. **Check the request** — Verify variables resolved correctly
4. **Use AI diagnosis** — Click the Diagnose tab for automated root cause analysis

### Common failure patterns

| Pattern | Likely cause |
|---|---|
| Status 401 instead of 200 | Authentication issue — check connection credentials |
| Status 404 instead of 200 | Wrong endpoint path or missing path parameter |
| Field value mismatch | API returns a different format (e.g., integer vs. string) |
| Missing field in response | API schema changed or optional field not returned |
| Status 400 | Missing required field in request body |
| Status 500 | Server-side error — check API logs |

## Tips

- **Focus on the first failure**: In a multi-step scenario, later steps often fail because an earlier step failed (e.g., capture didn't extract a value). Fix the first failure and re-run.
- **Check enum aliases**: If a field returns `1` but you expected `"Published"`, configure an enum alias in API rules.
- **Response viewer**: The response body is shown in a formatted JSON viewer — use it to explore nested structures.

## Related articles

- [How to use AI diagnosis for failed steps](../04-scenario-manager/06-ai-diagnosis.md) — Automated failure analysis
- [How to use breakpoints to debug tests](../04-scenario-manager/05-use-breakpoints.md) — Step-by-step debugging
- [How to configure API rules and diagnostic lessons](../02-spec-manager/06-configure-api-rules.md) — Enum aliases and AI context
