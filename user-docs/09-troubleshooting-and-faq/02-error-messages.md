# Understanding error messages

FlowForge displays error messages at various stages — during connection setup, test execution, and AI operations. This reference explains what each message means and how to resolve it.

## Connection errors

| Message | Meaning | Solution |
|---|---|---|
| "OAuth sign-in required" | No valid OAuth token exists | Check Client ID, Secret, and Token URL in Settings > Connections |
| "Connection health check failed" | Stored credentials can't authenticate | Re-enter credentials in Settings > Connections |
| "No credential configured" | Connection exists but has no secret/token | Edit the connection and add the missing credential |
| "Connection not found" | The selected connection was deleted | Select a different connection in the Scenario Manager |

## Pre-run validation errors

| Message | Meaning | Solution |
|---|---|---|
| "Missing project variables: X, Y" | Flow XML references `{{proj.X}}` but the variable doesn't exist | Add the variable in Settings > Variables |
| "Empty project variables: X" | Variable exists but has no value | Set a value in Settings > Variables |
| "Connection required" | No connection selected for this version | Click "Connect" in the Scenario Manager and select a connection |

## Step execution errors

| Message | Meaning | Solution |
|---|---|---|
| "Status equals X" (failed) | HTTP status code didn't match the assertion | Check the API response — the endpoint may have changed behavior |
| "Field response.X.Y equals Z" (failed) | A response field didn't match the expected value | Verify the assertion value or update it to match the actual response |
| "Unresolved variable: {{proj.X}}" | A `{{proj.*}}` reference couldn't be resolved at runtime | Add or fix the variable in Settings > Variables |
| "Capture failed: path not found" | A `<capture>` path doesn't exist in the response | Check the response structure and fix the capture path |
| "Request failed: Network error" | The target API is unreachable | Verify the base URL and that the API is running |
| "Request failed: Timeout" | The API took too long to respond | Check if the API is under heavy load; increase timeout if available |

## Flow validation errors

| Message | Meaning | Solution |
|---|---|---|
| "Invalid XML: not well-formed" | XML syntax error (unclosed tags, invalid characters) | Check for missing closing tags or unescaped special characters |
| "Missing required element: steps" | The `<steps>` wrapper is missing | Wrap all `<step>` elements inside `<steps>` |
| "Missing required element: name" | The `<name>` element is missing from the flow | Add `<name>Your Flow Name</name>` inside `<flow>` |
| "Invalid assertion syntax" | An `<assertion>` element has wrong structure | Use `<status code="X"/>` or `<field path="X" value="Y"/>` |
| "Invalid capture syntax" | A `<capture>` element is missing attributes | Ensure both `name` and `path` attributes are present |
| "Invalid namespace" | Wrong or missing XML namespace | Use `xmlns="https://flowforge.io/qa/flow/v1"` on the `<flow>` element |

## AI operation errors

| Message | Meaning | Solution |
|---|---|---|
| "Credits exhausted" | Project or user AI budget is fully consumed | Contact a Super Owner to increase the budget |
| "AI service unavailable" | Claude API is temporarily unreachable | Wait a moment and retry |
| "Context too large" | Too many spec files selected for a single operation | Use focused scopes (single folder) instead of entire version |

## API (Public) errors

| HTTP Status | Message | Solution |
|---|---|---|
| 400 | "Missing scenarioId" | Include `{"scenarioId": "..."}` in the request body |
| 401 | "Invalid API key" | Check the `X-Api-Key` header value |
| 404 | "Scenario not found" | Verify the scenario ID and that it's active |
| 422 | "Flow parse error" | The scenario's flow XML is invalid — fix it in the Spec Manager |
| 500 | "Internal server error" | Check connection credentials; review the audit log for details |

## Tips

- **Red badges on scenarios**: Indicate validation errors — hover or click to see the specific issue.
- **Step-level errors**: Only the specific failing step is marked red, not the entire scenario.
- **AI diagnosis**: For assertion failures, use the Diagnose tab — it can analyze the actual vs. expected response and suggest fixes.

## Related articles

- [Common issues and solutions](../09-troubleshooting-and-faq/01-common-issues.md) — Broader troubleshooting guide
- [Frequently asked questions](../09-troubleshooting-and-faq/03-faq.md) — Quick answers
- [How to edit flow XML manually](../07-ai-features/04-edit-flow-xml.md) — Fixing flow validation errors
