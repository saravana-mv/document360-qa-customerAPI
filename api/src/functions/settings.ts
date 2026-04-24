import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSettingsContainer } from "../lib/cosmosClient";
import { withAuth, getUserInfo } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

// Settings doc is keyed by Entra OID — no projectId needed (this IS where
// the user's project selection is stored).
interface SettingsDocument {
  id: string;          // "user_settings"
  userId: string;      // partition key — Entra OID
  selectedProjectId: string;
  baseUrl: string;
  apiVersion: string;
  aiModel: string;
  updatedAt: string;
  [key: string]: unknown; // future fields
}

/** GET /api/settings — read current user's settings */
async function getSettings(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const user = getUserInfo(req);
    const container = await getSettingsContainer();
    try {
      const { resource } = await container.item("user_settings", user.oid).read<SettingsDocument>();
      if (!resource) return ok({});
      // Strip Cosmos metadata, return only app fields
      const { id: _id, userId: _uid, _rid, _self, _etag, _attachments, _ts, ...settings } = resource as Record<string, unknown>;
      return ok(settings);
    } catch {
      return ok({});
    }
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** PUT /api/settings — upsert current user's settings */
async function putSettings(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const user = getUserInfo(req);
    const body = (await req.json()) as Record<string, unknown>;

    const container = await getSettingsContainer();

    // Merge with existing to preserve fields the client didn't send
    let existing: Record<string, unknown> = {};
    try {
      const { resource } = await container.item("user_settings", user.oid).read();
      if (resource) existing = resource as Record<string, unknown>;
    } catch {
      // new doc
    }

    const doc: SettingsDocument = {
      ...existing,
      ...body,
      id: "user_settings",
      userId: user.oid,
      updatedAt: new Date().toISOString(),
    } as SettingsDocument;

    await container.items.upsert(doc);

    const { id: _id, userId: _uid, _rid, _self, _etag, _attachments, _ts, ...settings } = doc as Record<string, unknown>;
    return ok(settings);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function settingsRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return getSettings(req);
    case "PUT":     return putSettings(req);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("settings", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "settings",
  handler: withAuth(settingsRouter),
});
