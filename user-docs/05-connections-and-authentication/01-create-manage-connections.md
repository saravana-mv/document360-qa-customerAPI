# How to create and manage connections

Connections are the centralized way to configure API endpoint access in FlowForge. Each connection stores a base URL, API version, authentication credentials, and provider type — making it the single source of truth for how FlowForge communicates with your API.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A project selected

## What is a connection?

A connection is a saved configuration that tells FlowForge how to reach and authenticate with your API. It includes:

| Property | Description | Example |
|---|---|---|
| **Name** | A human-readable label | "Production API" |
| **Provider type** | Authentication method | OAuth 2.0, Bearer Token, API Key, etc. |
| **Base URL** | The API's root URL | `https://api.example.com` |
| **API Version** | The version path segment | `v3` |
| **Credentials** | Auth secrets (stored server-side) | Token, client ID/secret, API key |

> **Security note:** Credentials are stored server-side and never exposed to the browser. The FlowForge proxy injects authentication headers on your behalf.

## Creating a connection

### 1. Navigate to Settings > Connections

Click the **gear icon** in the SideNav, then select the **Connections** tab.

<!-- SCREENSHOT
id: connections-page
alt: Settings Connections page showing list of configured connections
page: /settings
preconditions:
  - Logged in as QA Engineer or above
  - On Settings page
actions:
  - Click Connections tab
highlight: Connections list and Add Connection button
annotations: Arrow pointing to Add Connection button
crop: main-content
-->
[Screenshot: Settings Connections page showing list of configured connections]

### 2. Click Add Connection

Click the **Add Connection** button to open the connection form.

### 3. Fill in the connection details

| Field | Required | Description |
|---|---|---|
| **Name** | Yes | Label for this connection |
| **Provider type** | Yes | Auth method (see supported types below) |
| **Base URL** | Yes | API root URL |
| **API Version** | No | Version path segment (e.g., `v3`) |
| **Credentials** | Yes | Varies by provider type |

<!-- SCREENSHOT
id: connections-form
alt: Connection form modal with fields for name, provider type, base URL, and credentials
page: /settings
preconditions:
  - Add Connection clicked
actions:
  - Fill in connection details
highlight: Form fields
annotations: Number labels for each field
crop: modal
-->
[Screenshot: Connection form modal with fields for name, provider type, base URL, and credentials]

### 4. Save

Click **Save** to create the connection. It's immediately available for use in the Scenario Manager.

## Supported provider types

| Provider | Credentials needed | How auth is applied |
|---|---|---|
| **OAuth 2.0** | Client ID, Client Secret, Token URL, Scopes | Bearer token in Authorization header (auto-refreshed) |
| **Bearer Token** | Token string | `Authorization: Bearer {token}` header |
| **API Key (Header)** | Key name + key value | Custom header (e.g., `X-API-Key: {value}`) |
| **API Key (Query)** | Parameter name + key value | Query parameter (e.g., `?api_key={value}`) |
| **Basic Auth** | Username + password | `Authorization: Basic {base64}` header |
| **Cookie** | Cookie string | `Cookie: {value}` header |

## Managing existing connections

### Editing a connection

1. Click on a connection in the list
2. Update the fields you need to change
3. Click **Save**

> **Note:** Credential fields show whether a secret is configured (`hasCredential` / `hasSecret`) but never display the actual value. To update credentials, enter a new value.

### Deleting a connection

1. Click the delete (trash) icon on the connection row
2. Confirm deletion

> **Warning:** Deleting a connection that's in use by a version in the Scenario Manager will break test execution for that version. Disconnect the version first or assign a different connection.

## Draft connections

When you import an OpenAPI spec, FlowForge may auto-detect security schemes and create **draft connections**. Draft connections:

- Have `baseUrl` and `apiVersion` pre-filled from the spec
- Skip credential validation (credentials must be added manually)
- Are marked as drafts in the connections list
- Become regular connections once you add credentials and save

## Connection status indicators

In the Scenario Manager's connection dropdown, each connection shows a status:

| Indicator | Meaning |
|---|---|
| Green checkmark | Healthy — credentials configured and valid |
| Yellow/Red | Needs attention — missing credentials or expired token |

## Tips

- **One connection per environment**: Create separate connections for development, staging, and production APIs.
- **Rename for clarity**: Use descriptive names like "Staging - OAuth" or "Prod - API Key" so team members can quickly identify the right connection.
- **Credentials are project-scoped**: Each project has its own connections. Team members in the same project share connection access (but not credential visibility).

## Related articles

- [How to set up OAuth 2.0 connections](../05-connections-and-authentication/02-setup-oauth2.md) — OAuth-specific setup
- [How to set up token-based connections](../05-connections-and-authentication/03-setup-token-connections.md) — Bearer, API key, basic auth
- [How to connect an API endpoint](../04-scenario-manager/02-connect-api-endpoint.md) — Using connections in the Scenario Manager
