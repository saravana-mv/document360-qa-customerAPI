# How to connect an API endpoint

Before running test scenarios, you need to connect FlowForge to your API endpoint. The connection provides the base URL, API version, and authentication credentials.

## Prerequisites

- Logged in with **QA Engineer** role or above
- At least one connection configured in Settings > Connections (see [How to create and manage connections](../05-connections-and-authentication/01-create-manage-connections.md))
- At least one scenario created

## Steps

### 1. Open the connection selector

1. Navigate to the **Scenario Manager**
2. Expand the version accordion you want to test
3. Click the **Connect** button or the connection dropdown at the top of the right panel

<!-- SCREENSHOT
id: scenario-connect-dropdown
alt: Connection selector dropdown showing available API connections with status indicators
page: /test-manager
preconditions:
  - At least one connection configured
  - Version accordion expanded
actions:
  - Click Connect button or connection dropdown
highlight: Connection dropdown with connection options
annotations: Labels for connection name, type indicator, and status
crop: panel-right
-->
[Screenshot: Connection selector dropdown showing available API connections with status indicators]

### 2. Select a connection

The dropdown shows all connections configured for your project:

- **Connection name** — The label you assigned
- **Provider type** — Auth method (OAuth 2.0, Bearer, API Key, etc.)
- **Status indicator** — Green (ready), yellow (needs attention), red (missing credentials)

Click a connection to select it.

### 3. Health check

After selecting a connection, FlowForge runs a one-time health check:

- **OAuth connections**: Verified via a token health check endpoint
- **Non-OAuth connections**: Checked for valid credentials (has secret/token)

| Status | Meaning | Action |
|---|---|---|
| Green | Connection healthy, ready to run | Proceed with testing |
| Red error banner | Connection has issues | Click the "Settings > Connections" link to fix |

If the health check fails, the Run buttons remain disabled until the connection issue is resolved.

<!-- SCREENSHOT
id: scenario-health-check
alt: Run controls showing a healthy connection (green) and enabled Run buttons
page: /test-manager
preconditions:
  - Connection selected and healthy
actions:
  - Select a valid connection
highlight: Health check indicator and enabled Run buttons
annotations: Labels for health status and Run button
crop: panel-right
-->
[Screenshot: Run controls showing a healthy connection (green) and enabled Run buttons]

### 4. Per-version connections

Each version folder can use a different connection. This is useful when:

- Testing different API versions with different base URLs
- Using different credentials for different environments (staging vs. production)
- Testing OAuth vs. API key access on the same endpoints

The selected connection is remembered per version — you don't need to re-select it each time.

## Connection information

The selected connection provides:

| Property | Source | Example |
|---|---|---|
| **Base URL** | Connection config | `https://api.example.com` |
| **API Version** | Connection config | `v3` |
| **Auth credentials** | Stored server-side | Bearer token, OAuth token, API key |

These values are injected into every API call during test execution. The browser never sees the actual credentials — they're applied server-side through the proxy.

## Project variable validation

When a connection is selected, FlowForge also validates **project variables**:

- Scans all active flows for `{{proj.*}}` references
- Checks that each referenced variable exists in Settings > Variables
- Checks that each variable has a non-empty value

If variables are missing or empty, a red banner appears with a link to Settings > Variables. Run buttons stay disabled until all variables are resolved.

## Tips

- **Draft connections**: If you imported a spec that auto-detected security schemes, draft connections may exist but need credentials. Go to Settings > Connections to complete them.
- **Connection per environment**: Create separate connections for development, staging, and production to easily switch between environments.
- **Credentials are secure**: Connection credentials are stored server-side and never exposed to the browser.

## Related articles

- [How to create and manage connections](../05-connections-and-authentication/01-create-manage-connections.md) — Setting up connections
- [How to run test scenarios](../04-scenario-manager/03-run-test-scenarios.md) — Running tests after connecting
- [How to configure project variables](../06-settings-and-administration/03-configure-project-variables.md) — Setting up variables
