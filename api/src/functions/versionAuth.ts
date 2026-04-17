// Per-version auth management: store/retrieve API keys for versions that
// use API key auth instead of D360 OAuth.
//
// Routes:
//   POST   /api/version-auth/apikey   — store an API key for a version
//   DELETE /api/version-auth/apikey   — remove a stored API key
//   GET    /api/version-auth/status   — check auth status for a version

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, parseClientPrincipal } from "../lib/auth";
import { TableClient, RestError } from "@azure/data-tables";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const TABLE_NAME = "versionapikeys";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

interface ApiKeyEntity {
  partitionKey: string;
  rowKey: string;
  apiKey: string;
  version: string;
  createdAt: number;
  updatedAt: number;
}

let _client: TableClient | null = null;
let _tableEnsured = false;

function getClient(): TableClient {
  if (_client) return _client;
  if (!CONNECTION_STRING) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  _client = TableClient.fromConnectionString(CONNECTION_STRING, TABLE_NAME, {
    allowInsecureConnection: CONNECTION_STRING.includes("UseDevelopmentStorage=true"),
  });
  return _client;
}

async function ensureTable(): Promise<void> {
  if (_tableEnsured) return;
  try {
    await getClient().createTable();
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 409) {
      // already exists
    } else {
      throw e;
    }
  }
  _tableEnsured = true;
}

function rowKey(oid: string, version: string): string {
  return `${oid}:${version}`;
}

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
    await ensureTable();
    const now = Date.now();
    let createdAt = now;
    try {
      const existing = await getClient().getEntity<ApiKeyEntity>(oid, rowKey(oid, body.version));
      createdAt = existing.createdAt ?? now;
    } catch { /* new entry */ }

    const entity: ApiKeyEntity = {
      partitionKey: oid,
      rowKey: rowKey(oid, body.version),
      apiKey: body.apiKey,
      version: body.version,
      createdAt,
      updatedAt: now,
    };
    await getClient().upsertEntity(entity, "Replace");
    return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ configured: true, version: body.version }) };
  }

  if (req.method === "DELETE") {
    const version = new URL(req.url).searchParams.get("version");
    if (!version) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "version query param required" }) };
    }
    await ensureTable();
    try {
      await getClient().deleteEntity(oid, rowKey(oid, version));
    } catch (e) {
      if (e instanceof RestError && e.statusCode === 404) {
        // already gone
      } else {
        throw e;
      }
    }
    return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ configured: false, version }) };
  }

  if (req.method === "GET") {
    const version = new URL(req.url).searchParams.get("version");
    if (!version) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "version query param required" }) };
    }
    await ensureTable();
    try {
      await getClient().getEntity<ApiKeyEntity>(oid, rowKey(oid, version));
      return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ configured: true, method: "apikey", version }) };
    } catch (e) {
      if (e instanceof RestError && e.statusCode === 404) {
        return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ configured: false, method: "oauth", version }) };
      }
      throw e;
    }
  }

  return { status: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
}

/** Fetches the stored API key for a user+version. Returns null if none. */
export async function getApiKeyForVersion(oid: string, version: string): Promise<string | null> {
  await ensureTable();
  try {
    const entity = await getClient().getEntity<ApiKeyEntity>(oid, rowKey(oid, version));
    return entity.apiKey ?? null;
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 404) return null;
    throw e;
  }
}

app.http("versionAuth", {
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "version-auth/{action?}",
  handler: withAuth(handler),
});
