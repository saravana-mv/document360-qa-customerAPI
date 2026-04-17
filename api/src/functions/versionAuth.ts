// Per-version auth management: store/retrieve API keys for versions that
// use API key auth instead of D360 OAuth.
//
// Routes:
//   POST   /api/version-auth/apikey   — store an API key for a version
//   DELETE /api/version-auth/apikey   — remove a stored API key
//   GET    /api/version-auth/status   — check auth status for a version

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, parseClientPrincipal } from "../lib/auth";
import { putApiKey, deleteApiKey, hasApiKey } from "../lib/versionApiKeyStore";

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

  if (req.method === "POST") {
    const body = (await req.json()) as { version?: string; apiKey?: string };
    if (!body.version || !body.apiKey) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "version and apiKey are required" }) };
    }
    await putApiKey(oid, body.version, body.apiKey);
    return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ configured: true, version: body.version }) };
  }

  if (req.method === "DELETE") {
    const version = new URL(req.url).searchParams.get("version");
    if (!version) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "version query param required" }) };
    }
    await deleteApiKey(oid, version);
    return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ configured: false, version }) };
  }

  if (req.method === "GET") {
    const version = new URL(req.url).searchParams.get("version");
    if (!version) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "version query param required" }) };
    }
    const configured = await hasApiKey(oid, version);
    return {
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ configured, method: configured ? "apikey" : "oauth", version }),
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
