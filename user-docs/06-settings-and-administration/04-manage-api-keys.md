# How to manage API keys for the Public API

API keys authenticate requests to the FlowForge Public API, allowing you to run scenarios programmatically from scripts, CI/CD pipelines, or external tools.

## Prerequisites

- Logged in with **QA Manager** role or above
- A project selected

## Viewing API keys

1. Click the **gear icon** in the SideNav to open Settings
2. Select the **API Keys** tab

The page shows all active API keys with their name, masked key prefix, creation date, and last used time.

<!-- SCREENSHOT
id: api-keys-page
alt: Settings API Keys page showing list of keys and curl example
page: /settings
preconditions:
  - Logged in as QA Manager or above
  - At least one API key exists
actions:
  - Click Settings > API Keys tab
highlight: API keys table and example section
annotations: Labels for key table columns and Create button
crop: main-content
-->
[Screenshot: Settings API Keys page showing list of keys and curl example]

## Creating an API key

### 1. Click Create

Click the green **Create** button in the top-right corner.

### 2. Enter a name

Give the key a descriptive name (e.g., "CI Pipeline", "Postman Tests", "GitHub Actions").

### 3. Copy the key

After creation, the full API key is displayed **once**. Copy it immediately — it won't be shown again.

The key format is: `ff_` followed by 40 hex characters (e.g., `ff_a1b2c3d4e5f6...`).

> **Important:** Store the key securely (e.g., in a CI/CD secret or password manager). FlowForge stores only a hash of the key and cannot recover it.

## Using an API key

The API Keys page includes a collapsible **Example** section with ready-to-use commands in multiple formats:

### Bash / macOS / Linux

```bash
curl -X POST https://your-flowforge-url/api/run-scenario \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{"scenarioId": "your-scenario-id"}'
```

### PowerShell

```powershell
Invoke-RestMethod `
  -Uri "https://your-flowforge-url/api/run-scenario" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{ "X-Api-Key" = "YOUR_API_KEY" } `
  -Body '{"scenarioId": "your-scenario-id"}'
```

## Revoking an API key

1. Click the trash icon on the key's row
2. Confirm: "Revoke this API key? Integrations using this key will stop working."

Revocation is immediate and permanent. Any script or pipeline using this key will receive 401 errors.

## API key details

| Property | Description |
|---|---|
| **Name** | Human-readable label |
| **Key prefix** | First 8 characters shown for identification (e.g., `ff_a1b2c3d4`) |
| **Created** | Creation date |
| **Last used** | Timestamp of the most recent API call (or "Never") |

## Tips

- **One key per integration**: Create separate keys for each CI pipeline or tool. This makes it easy to revoke a single integration without affecting others.
- **Rotate regularly**: Revoke old keys and create new ones periodically as a security practice.
- **Store in CI secrets**: Never hardcode API keys in source code. Use your CI platform's secret management (GitHub Secrets, GitLab CI Variables, etc.).

## Related articles

- [How to run scenarios via the Public API](../08-public-api/01-run-scenarios-via-api.md) — Full API reference
- [How to integrate FlowForge with CI/CD pipelines](../08-public-api/02-cicd-integration.md) — Pipeline setup guide
- [How to view the audit log](../06-settings-and-administration/05-view-audit-log.md) — API key usage is logged
