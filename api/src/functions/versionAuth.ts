// Per-version auth management: store/retrieve credentials for versions.
// Supports generic auth types (bearer, API key header/query, basic, cookie).
//
// Routes:
//   POST   /api/version-auth/credential — store a credential for a version
//   DELETE /api/version-auth/credential — remove a stored credential
//   GET    /api/version-auth/status     — check auth status for a version
//   (Legacy) POST /api/version-auth/apikey — store API key (backward compat)
//   (Legacy) DELETE /api/version-auth/apikey — remove API key

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, parseClientPrincipal } from "../lib/auth";
import { putCredential, deleteCredential, getCredentialForVersion, putApiKey, deleteApiKey } from "../lib/versionApiKeyStore";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: CORS_HEADERS };
  }

  const principal = parseClientPrincipal(req);
  if (!principal) {
    return { status: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  const oid = principal.userId;
  const action = req.params?.action ?? "";

  // ── Generic credential endpoints ──────────────────────────────────────────

  if (action === "credential" && req.method === "POST") {
    const body = (await req.json()) as {
      version?: string;
      authType?: string;
      credential?: string;
      authHeaderName?: string;
      authQueryParam?: string;
    };
    if (!body.version || !body.credential || !body.authType) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "version, authType, and credential are required" }) };
    }
    const authType = body.authType as "bearer" | "apikey_header" | "apikey_query" | "basic" | "cookie";
    await putCredential(oid, body.version, body.credential, authType, body.authHeaderName, body.authQueryParam);
    return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ configured: true, version: body.version, authType }) };
  }

  if (action === "credential" && req.method === "DELETE") {
    const version = new URL(req.url).searchParams.get("version");
    if (!version) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "version query param required" }) };
    }
    await deleteCredential(oid, version);
    return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ configured: false, version }) };
  }

  // ── Legacy API key endpoints (backward compat) ────────────────────────────

  if (action === "apikey" && req.method === "POST") {
    const body = (await req.json()) as { version?: string; apiKey?: string };
    if (!body.version || !body.apiKey) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "version and apiKey are required" }) };
    }
    await putApiKey(oid, body.version, body.apiKey);
    return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ configured: true, version: body.version }) };
  }

  if (action === "apikey" && req.method === "DELETE") {
    const version = new URL(req.url).searchParams.get("version");
    if (!version) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "version query param required" }) };
    }
    await deleteApiKey(oid, version);
    return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ configured: false, version }) };
  }

  // ── Status endpoint ───────────────────────────────────────────────────────

  if (action === "status" && req.method === "GET") {
    const version = new URL(req.url).searchParams.get("version");
    if (!version) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "version query param required" }) };
    }
    const cred = await getCredentialForVersion(oid, version);
    return {
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        configured: cred !== null,
        authType: cred?.authType ?? "none",
        version,
      }),
    };
  }

  return { status: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
}

app.http("versionAuth", {
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "version-auth/{action?}",
  handler: withAuth(handler),
});
