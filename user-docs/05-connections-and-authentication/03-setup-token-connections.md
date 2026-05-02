# How to set up token-based connections

For APIs that use bearer tokens, API keys, basic auth, or cookies, FlowForge provides straightforward connection types that inject credentials into every request automatically.

## Prerequisites

- Logged in with **QA Engineer** role or above
- API credentials from your API provider

## Bearer Token

Best for APIs that provide a long-lived access token.

### Setup

1. Go to **Settings** > **Connections** > **Add Connection**
2. Select **Bearer Token** as provider type
3. Fill in:
   - **Name**: Connection label
   - **Base URL**: API root URL
   - **API Version**: Version path (optional)
   - **Token**: Your bearer token string
4. Click **Save**

### How it works

FlowForge adds `Authorization: Bearer {your-token}` to every API request header.

## API Key (Header)

Best for APIs that authenticate via a custom header.

### Setup

1. Select **API Key (Header)** as provider type
2. Fill in:
   - **Name**: Connection label
   - **Base URL**: API root URL
   - **Header Name**: The custom header name (e.g., `X-API-Key`, `api_token`)
   - **API Key**: Your key value
3. Click **Save**

### How it works

FlowForge adds `{Header-Name}: {your-key}` to every API request header.

## API Key (Query Parameter)

Best for APIs that authenticate via a URL query parameter.

### Setup

1. Select **API Key (Query)** as provider type
2. Fill in:
   - **Name**: Connection label
   - **Base URL**: API root URL
   - **Parameter Name**: The query parameter name (e.g., `api_key`, `token`)
   - **API Key**: Your key value
3. Click **Save**

### How it works

FlowForge appends `?{param}={your-key}` to every API request URL.

## Basic Auth

Best for APIs using HTTP Basic authentication.

### Setup

1. Select **Basic Auth** as provider type
2. Fill in:
   - **Name**: Connection label
   - **Base URL**: API root URL
   - **Username**: Your username
   - **Password**: Your password
3. Click **Save**

### How it works

FlowForge adds `Authorization: Basic {base64(username:password)}` to every request header.

## Cookie

Best for APIs that use session cookies for authentication.

### Setup

1. Select **Cookie** as provider type
2. Fill in:
   - **Name**: Connection label
   - **Base URL**: API root URL
   - **Cookie**: The full cookie string
3. Click **Save**

### How it works

FlowForge adds `Cookie: {your-cookie-string}` to every request header.

## Security

All connection types share these security properties:

- **Server-side storage**: Credentials are stored in Cosmos DB, never in the browser
- **Proxy injection**: The FlowForge proxy adds auth headers/params on the server side
- **No exposure**: The browser never sees actual credentials — only `hasCredential: true/false`
- **Sanitized responses**: API responses from the proxy strip any credential-bearing headers

## Choosing the right type

| Your API uses... | Choose... |
|---|---|
| OAuth 2.0 with client credentials | OAuth 2.0 (see [OAuth setup guide](../05-connections-and-authentication/02-setup-oauth2.md)) |
| A long-lived bearer/access token | Bearer Token |
| A custom API key header | API Key (Header) |
| API key in the URL | API Key (Query) |
| Username and password | Basic Auth |
| Session cookies | Cookie |

## Tips

- **Token rotation**: When tokens expire, update the connection in Settings > Connections. No need to reconfigure the Scenario Manager.
- **Multiple connections**: You can create multiple connections with different auth methods for the same API to test different access levels.
- **Test without auth**: Select "No auth" in the Scenario Manager connection dropdown to test unauthenticated endpoints.

## Related articles

- [How to create and manage connections](../05-connections-and-authentication/01-create-manage-connections.md) — General connection management
- [How to set up OAuth 2.0 connections](../05-connections-and-authentication/02-setup-oauth2.md) — OAuth-specific setup
- [How to connect an API endpoint](../04-scenario-manager/02-connect-api-endpoint.md) — Using connections for testing
