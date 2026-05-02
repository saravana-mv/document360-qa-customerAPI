# How to run scenarios via the Public API

The FlowForge Public API lets you trigger scenario execution programmatically. Use it to run tests from scripts, CI/CD pipelines, monitoring systems, or any HTTP client.

## Prerequisites

- An active API key (created in Settings > API Keys)
- At least one active scenario in the Scenario Manager
- The scenario ID (visible in the Scenario Manager)

## API endpoint

```
POST /api/run-scenario
```

## Authentication

All requests must include an API key in the `X-Api-Key` header:

```
X-Api-Key: ff_your_api_key_here
```

API keys are created in **Settings > API Keys**. See [How to manage API keys](../06-settings-and-administration/04-manage-api-keys.md) for details.

## Request

### Headers

| Header | Required | Value |
|---|---|---|
| `Content-Type` | Yes | `application/json` |
| `X-Api-Key` | Yes | Your FlowForge API key |

### Body

```json
{
  "scenarioId": "a00c7330-c560-4ba0-b66a-26bd2f72655b"
}
```

| Field | Required | Description |
|---|---|---|
| `scenarioId` | Yes | The unique ID of the scenario to run |

### Finding the scenario ID

In the Scenario Manager, right-click (or click "...") on a scenario and select **Copy scenario ID**. The ID is a UUID like `a00c7330-c560-4ba0-b66a-26bd2f72655b`.

## Response

### Success (200 OK)

```json
{
  "scenarioId": "a00c7330-c560-4ba0-b66a-26bd2f72655b",
  "scenarioName": "Create and retrieve article",
  "status": "pass",
  "summary": {
    "total": 3,
    "pass": 3,
    "fail": 0,
    "skip": 0,
    "error": 0,
    "durationMs": 1234
  },
  "steps": [
    {
      "number": 1,
      "name": "Create article",
      "status": "pass",
      "httpStatus": 201,
      "durationMs": 450,
      "assertionResults": [
        {
          "id": "status-201",
          "description": "Status equals 201",
          "passed": true
        }
      ]
    }
  ],
  "startedAt": "2026-05-02T10:30:00Z",
  "completedAt": "2026-05-02T10:30:01Z"
}
```

### Response fields

| Field | Type | Description |
|---|---|---|
| `scenarioId` | string | The scenario that was run |
| `scenarioName` | string | Human-readable scenario name |
| `status` | string | Overall result: `pass`, `fail`, or `error` |
| `summary.total` | number | Total steps |
| `summary.pass` | number | Steps that passed |
| `summary.fail` | number | Steps that failed assertions |
| `summary.skip` | number | Steps skipped (due to prior failure) |
| `summary.error` | number | Steps that encountered runtime errors |
| `summary.durationMs` | number | Total execution time in milliseconds |
| `steps` | array | Per-step results (see below) |
| `startedAt` | string | ISO 8601 timestamp |
| `completedAt` | string | ISO 8601 timestamp |

### Step result fields

| Field | Type | Description |
|---|---|---|
| `number` | number | Step position (1-based) |
| `name` | string | Step label from flow XML |
| `status` | string | `pass`, `fail`, `skip`, or `error` |
| `httpStatus` | number | HTTP response status code |
| `durationMs` | number | Step execution time |
| `failureReason` | string | Why the step failed (only present on failure) |
| `assertionResults` | array | Individual assertion outcomes |

### Error responses

| Status | Cause |
|---|---|
| `400` | Missing or invalid request body |
| `401` | Missing or invalid API key |
| `404` | Scenario not found |
| `422` | Flow XML parse error |
| `500` | Runtime error (credential issue, upstream failure) |

## Examples

### Bash / cURL

```bash
curl -X POST https://your-flowforge-url/api/run-scenario \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: ff_your_api_key" \
  -d '{"scenarioId": "a00c7330-c560-4ba0-b66a-26bd2f72655b"}'
```

### PowerShell

```powershell
Invoke-RestMethod `
  -Uri "https://your-flowforge-url/api/run-scenario" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{ "X-Api-Key" = "ff_your_api_key" } `
  -Body '{"scenarioId": "a00c7330-c560-4ba0-b66a-26bd2f72655b"}'
```

### JavaScript / Node.js

```javascript
const response = await fetch('https://your-flowforge-url/api/run-scenario', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': 'ff_your_api_key'
  },
  body: JSON.stringify({
    scenarioId: 'a00c7330-c560-4ba0-b66a-26bd2f72655b'
  })
});

const result = await response.json();
console.log(result.status); // "pass" or "fail"
```

## How execution works

1. FlowForge authenticates the API key and resolves the project
2. The scenario's flow XML is loaded and parsed
3. Connection credentials are injected server-side (same connection used in the Scenario Manager)
4. Project variables are resolved
5. Steps execute sequentially with assertions and captures
6. The run result is saved to history (visible in the Scenario Manager's Run History tab)
7. An audit log entry is recorded

## Tips

- **Check the status field**: For CI/CD, use the top-level `status` field (`pass`/`fail`) to determine pipeline success.
- **Runs appear in history**: API-triggered runs are visible in the Scenario Manager's Run History tab, labeled with source "api".
- **Same credentials**: API runs use the same connection and credentials configured in the Scenario Manager.

## Related articles

- [How to manage API keys for the Public API](../06-settings-and-administration/04-manage-api-keys.md) — Creating and managing keys
- [How to integrate FlowForge with CI/CD pipelines](../08-public-api/02-cicd-integration.md) — Pipeline integration guide
- [How to run test scenarios](../04-scenario-manager/03-run-test-scenarios.md) — Browser-based execution
