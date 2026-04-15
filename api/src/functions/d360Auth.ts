// D360 OAuth server-side endpoints.
//
// These functions replace the browser's direct POSTs to D360's token endpoint.
// The browser still drives the authorization-code + PKCE redirect (so the user
// sees D360's consent UI), but the code → token exchange happens here so the
// access + refresh tokens never reach the SPA.
//
//   POST /api/d360/auth/exchange   body { code, codeVerifier, redirectUri }
//   GET  /api/d360/auth/status     → { authenticated, projectId?, expiresAt? }
//   POST /api/d360/auth/logout     → { loggedOut: true }
//
// All three are Entra-gated via withAuth — the Entra `oid` from the SWA
// principal is used as the row key in the token store.

import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { withAuth } from "../lib/auth";
import { parseClientPrincipal } from "../lib/auth";
import { getTokenRow, putTokenRow, deleteTokenRow } from "../lib/tokenStore";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

const D360_TOKEN_URL =
  process.env.D360_TOKEN_URL ?? "https://identity.berlin.document360.net/connect/token";
const D360_CLIENT_ID = process.env.D360_CLIENT_ID ?? "apiHubWordClient";

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function err(status: number, message: string, extra?: Record<string, unknown>): HttpResponseInit {
  return { status, headers: CORS_HEADERS, body: JSON.stringify({ error: message, ...extra }) };
}

/** Extracts the doc360_project_id claim from a JWT access token, or "" if absent. */
function extractProjectId(accessToken: string): string {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return "";
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
    return (claims.doc360_project_id as string) || "";
  } catch {
    return "";
  }
}

interface D360TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

async function postToD360Token(body: URLSearchParams): Promise<D360TokenResponse> {
  const res = await fetch(D360_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D360 token endpoint returned ${res.status}: ${text}`);
  }
  return (await res.json()) as D360TokenResponse;
}

/** POST /api/d360/auth/exchange — finishes the PKCE flow server-side. */
export async function exchangeHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(req);
  if (!principal) return err(401, "Unauthorized");
  try {
    const body = (await req.json()) as {
      code?: string;
      codeVerifier?: string;
      redirectUri?: string;
    };
    if (!body.code || !body.codeVerifier || !body.redirectUri) {
      return err(400, "code, codeVerifier and redirectUri are required");
    }

    const tokenRes = await postToD360Token(
      new URLSearchParams({
        grant_type: "authorization_code",
        code: body.code,
        redirect_uri: body.redirectUri,
        client_id: D360_CLIENT_ID,
        code_verifier: body.codeVerifier,
      }),
    );

    const expiresAt = Date.now() + (tokenRes.expires_in ?? 3600) * 1000;
    const projectId = extractProjectId(tokenRes.access_token);

    await putTokenRow(principal.userId, {
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
      expiresAt,
      projectId,
    });

    return ok({ authenticated: true, projectId, expiresAt });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** GET /api/d360/auth/status — reports whether this user has a stored D360 token. */
export async function statusHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(req);
  if (!principal) return err(401, "Unauthorized");
  try {
    const row = await getTokenRow(principal.userId);
    if (!row) return ok({ authenticated: false });
    return ok({
      authenticated: true,
      projectId: row.projectId ?? "",
      expiresAt: row.expiresAt,
      hasRefreshToken: Boolean(row.refreshToken),
    });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** POST /api/d360/auth/logout — deletes the stored token row. */
export async function logoutHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(req);
  if (!principal) return err(401, "Unauthorized");
  try {
    await deleteTokenRow(principal.userId);
    return ok({ loggedOut: true });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

app.http("d360AuthExchange", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "d360/auth/exchange",
  handler: withAuth(async (req) => {
    if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
    return exchangeHandler(req);
  }),
});

app.http("d360AuthStatus", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "d360/auth/status",
  handler: withAuth(async (req) => {
    if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
    return statusHandler(req);
  }),
});

app.http("d360AuthLogout", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "d360/auth/logout",
  handler: withAuth(async (req) => {
    if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
    return logoutHandler(req);
  }),
});
