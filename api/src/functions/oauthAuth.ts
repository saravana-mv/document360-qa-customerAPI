// Generic OAuth server-side endpoints.
//
// These generalize the D360-specific d360Auth.ts to work with any OAuth
// connection registered in the connections Cosmos container.
//
//   POST /api/oauth/exchange           body { connectionId, code, codeVerifier, redirectUri }
//   GET  /api/oauth/status/:connId     → { authenticated, expiresAt?, hasRefreshToken? }
//   POST /api/oauth/logout/:connId     → { loggedOut: true }
//   POST /api/oauth/refresh/:connId    → { refreshed: true, expiresAt }

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, parseClientPrincipal } from "../lib/auth";
import { getConnectionsContainer } from "../lib/cosmosClient";
import { getOAuthToken, putOAuthToken, deleteOAuthToken } from "../lib/oauthTokenStore";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
  "Content-Type": "application/json",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
}

interface ConnectionDoc {
  id: string;
  projectId: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

/** Fetch connection config from Cosmos. Searches across all projects the user might have access to. */
async function getConnectionDoc(connectionId: string): Promise<ConnectionDoc | null> {
  const container = await getConnectionsContainer();
  const { resources } = await container.items
    .query<ConnectionDoc>({
      query: "SELECT c.id, c.projectId, c.tokenUrl, c.clientId, c.clientSecret FROM c WHERE c.id = @id AND c.type = 'connection'",
      parameters: [{ name: "@id", value: connectionId }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

/** POST to the OAuth provider's token endpoint. */
async function postTokenEndpoint(tokenUrl: string, params: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token endpoint returned ${res.status}: ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/** POST /api/oauth/exchange — PKCE code→token exchange. */
async function exchangeHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(req);
  if (!principal) return err(401, "Unauthorized");

  try {
    const body = (await req.json()) as {
      connectionId?: string;
      code?: string;
      codeVerifier?: string;
      redirectUri?: string;
    };

    if (!body.connectionId || !body.code || !body.codeVerifier || !body.redirectUri) {
      return err(400, "connectionId, code, codeVerifier and redirectUri are required");
    }

    const conn = await getConnectionDoc(body.connectionId);
    if (!conn) return err(404, "Connection not found");

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: body.code,
      redirect_uri: body.redirectUri,
      client_id: conn.clientId,
      code_verifier: body.codeVerifier,
    });
    // Include client_secret if the connection has one (confidential client)
    if (conn.clientSecret) {
      params.set("client_secret", conn.clientSecret);
    }

    const tokenRes = await postTokenEndpoint(conn.tokenUrl, params);
    const expiresAt = Date.now() + (tokenRes.expires_in ?? 3600) * 1000;

    await putOAuthToken(principal.userId, body.connectionId, {
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
      expiresAt,
    });

    return ok({ authenticated: true, expiresAt });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** GET /api/oauth/status/:connectionId */
async function statusHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(req);
  if (!principal) return err(401, "Unauthorized");

  const connectionId = req.params.connectionId;
  if (!connectionId) return err(400, "connectionId is required");

  try {
    const row = await getOAuthToken(principal.userId, connectionId);
    if (!row) return ok({ authenticated: false });
    return ok({
      authenticated: true,
      expiresAt: row.expiresAt,
      expired: row.expiresAt < Date.now(),
      hasRefreshToken: !!row.refreshToken,
    });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** POST /api/oauth/logout/:connectionId */
async function logoutHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(req);
  if (!principal) return err(401, "Unauthorized");

  const connectionId = req.params.connectionId;
  if (!connectionId) return err(400, "connectionId is required");

  try {
    await deleteOAuthToken(principal.userId, connectionId);
    return ok({ loggedOut: true });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** POST /api/oauth/refresh/:connectionId — force-refresh the token. */
async function refreshHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(req);
  if (!principal) return err(401, "Unauthorized");

  const connectionId = req.params.connectionId;
  if (!connectionId) return err(400, "connectionId is required");

  try {
    const row = await getOAuthToken(principal.userId, connectionId);
    if (!row) return err(401, "Not authenticated for this connection");
    if (!row.refreshToken) return err(400, "No refresh token available");

    const conn = await getConnectionDoc(connectionId);
    if (!conn) return err(404, "Connection not found");

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
      client_id: conn.clientId,
    });
    if (conn.clientSecret) {
      params.set("client_secret", conn.clientSecret);
    }

    const tokenRes = await postTokenEndpoint(conn.tokenUrl, params);
    const expiresAt = Date.now() + (tokenRes.expires_in ?? 3600) * 1000;

    await putOAuthToken(principal.userId, connectionId, {
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token ?? row.refreshToken,
      expiresAt,
    });

    return ok({ refreshed: true, expiresAt });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── Route registration ────────────────────────────────────────────────────────

app.http("oauthExchange", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "oauth/exchange",
  handler: withAuth(async (req) => {
    if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
    return exchangeHandler(req);
  }),
});

app.http("oauthStatus", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "oauth/status/{connectionId}",
  handler: withAuth(async (req) => {
    if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
    return statusHandler(req);
  }),
});

app.http("oauthLogout", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "oauth/logout/{connectionId}",
  handler: withAuth(async (req) => {
    if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
    return logoutHandler(req);
  }),
});

app.http("oauthRefresh", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "oauth/refresh/{connectionId}",
  handler: withAuth(async (req) => {
    if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
    return refreshHandler(req);
  }),
});
