// API key management endpoint for the FlowForge Public API.
//
// POST   /api/api-keys          — create a new key (returns raw key once)
// GET    /api/api-keys          — list active keys (masked)
// DELETE /api/api-keys/{id}     — revoke a key

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withRole } from "../lib/auth";
import { getUserInfo, getProjectId } from "../lib/auth";
import { createApiKey, listApiKeys, revokeApiKey } from "../lib/apiKeyStore";
import { audit } from "../lib/auditLog";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleCreate(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const user = getUserInfo(req);
    const projectId = getProjectId(req);
    const body = (await req.json()) as Record<string, unknown>;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const versionId = typeof body.versionId === "string" ? body.versionId.trim() : "";
    const authMethod = body.authMethod === "apikey" ? "apikey" as const : "oauth" as const;

    if (!name) return err(400, "name is required");
    if (!versionId) return err(400, "versionId is required");

    const result = await createApiKey(projectId, name, versionId, authMethod, user);
    audit(projectId, "apikey.create", user, result.doc.id, { name, versionId, authMethod });

    return ok({
      key: result.key,
      id: result.doc.id,
      name: result.doc.name,
      keyPrefix: result.doc.keyPrefix,
      versionId: result.doc.versionId,
      authMethod: result.doc.authMethod,
      createdAt: result.doc.createdAt,
    });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function handleList(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const keys = await listApiKeys(projectId);

    return ok(
      keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        versionId: k.versionId,
        authMethod: k.authMethod,
        createdBy: k.createdBy,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
    );
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function handleRevoke(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const keyId = segments[segments.length - 1];

    if (!keyId || keyId === "api-keys") return err(400, "key id is required");

    const revoked = await revokeApiKey(keyId, projectId);
    if (!revoked) return err(404, "API key not found");

    const user = getUserInfo(req);
    audit(projectId, "apikey.revoke", user, keyId);
    return ok({ revoked: true });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

async function apiKeysRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "GET") return handleList(req);
  if (req.method === "POST") return handleCreate(req);
  return err(405, "Method Not Allowed");
}

async function apiKeysDeleteRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "DELETE") return handleRevoke(req);
  return err(405, "Method Not Allowed");
}

// ── Registration ────────────────────────────────────────────────────────────

app.http("apiKeys", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "api-keys",
  handler: withRole(["owner", "qa_manager"], apiKeysRouter),
});

app.http("apiKeysDelete", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "api-keys/{id}",
  handler: withRole(["owner", "qa_manager"], apiKeysDeleteRouter),
});
