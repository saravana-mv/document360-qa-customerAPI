# How to set up OAuth 2.0 connections

OAuth 2.0 connections let FlowForge authenticate with APIs that use the OAuth 2.0 authorization framework. FlowForge manages the token lifecycle — obtaining, refreshing, and injecting bearer tokens automatically.

## Prerequisites

- Logged in with **QA Engineer** role or above
- OAuth 2.0 client credentials from your API provider (Client ID, Client Secret, Token URL)

## Steps

### 1. Create a new connection

1. Go to **Settings** > **Connections**
2. Click **Add Connection**
3. Select **OAuth 2.0** as the provider type

### 2. Fill in OAuth details

| Field | Description | Example |
|---|---|---|
| **Name** | Label for this connection | "Production OAuth" |
| **Base URL** | API root URL | `https://api.example.com` |
| **API Version** | Version path (optional) | `v3` |
| **Client ID** | OAuth application ID | `abc123-client-id` |
| **Client Secret** | OAuth application secret | `secret-value` |
| **Token URL** | Endpoint to obtain tokens | `https://auth.example.com/oauth/token` |
| **Scopes** | Permission scopes (optional) | `read write` |

<!-- SCREENSHOT
id: oauth-connection-form
alt: Connection form with OAuth 2.0 fields including Client ID, Secret, Token URL, and Scopes
page: /settings
preconditions:
  - Add Connection clicked
  - OAuth 2.0 selected as provider
actions:
  - Fill in OAuth fields
highlight: OAuth-specific fields
annotations: Labels for Client ID, Secret, Token URL, Scopes
crop: modal
-->
[Screenshot: Connection form with OAuth 2.0 fields including Client ID, Secret, Token URL, and Scopes]

### 3. Save the connection

Click **Save**. FlowForge stores the credentials server-side.

### 4. Verify the connection

After saving, FlowForge performs a health check:

- Attempts to obtain a token using your client credentials
- Shows a green checkmark if successful
- Shows an error if token acquisition fails

If the health check fails, verify your Client ID, Client Secret, and Token URL are correct.

## How OAuth works in FlowForge

1. **Token acquisition**: FlowForge uses the client credentials grant to obtain an access token from your Token URL
2. **Token injection**: When running tests, the proxy adds `Authorization: Bearer {token}` to every API request
3. **Token refresh**: If a token expires during a test run, FlowForge automatically refreshes it
4. **Server-side only**: Tokens are never sent to the browser — they're managed entirely server-side

## Health check

OAuth connections are verified via a dedicated health check endpoint:

- Triggered when you select the connection in the Scenario Manager
- Validates that the stored credentials can obtain a valid token
- Run buttons are disabled until the health check passes

## Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| "OAuth sign-in required" | No valid token | Check Client ID/Secret and Token URL |
| Token expires quickly | Short token lifetime | FlowForge auto-refreshes; no action needed |
| 401 errors during test runs | Scopes insufficient | Add required scopes to the connection |
| Health check fails | Wrong Token URL | Verify the token endpoint URL |

## Tips

- **Client credentials grant**: FlowForge uses the client credentials flow (machine-to-machine). User-interactive OAuth flows (authorization code) are not supported.
- **Scope format**: Enter scopes as space-separated values (e.g., `read write admin`).
- **Rotate secrets**: When rotating OAuth secrets, update the connection in Settings > Connections. Active test runs are not affected until the next token refresh.

## Related articles

- [How to create and manage connections](../05-connections-and-authentication/01-create-manage-connections.md) — General connection management
- [How to set up token-based connections](../05-connections-and-authentication/03-setup-token-connections.md) — Simpler auth methods
- [How to connect an API endpoint](../04-scenario-manager/02-connect-api-endpoint.md) — Using connections for testing
