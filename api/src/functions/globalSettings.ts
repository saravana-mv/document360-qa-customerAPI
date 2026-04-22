// Global (tenant-level) settings for FlowForge — Super Owner only.
//
// GET  /api/global-settings          — read tenant settings
// PUT  /api/global-settings          — upsert tenant settings
//
// Stored in the existing "settings" container, partitioned by userId,
// using a fixed userId of "global" to distinguish from per-user docs.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSettingsContainer } from "../lib/cosmosClient";
import { withRole, getUserInfo } from "../lib/auth";

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

// Fixed partition key for global settings — stored in "settings" container
const GLOBAL_PARTITION = "global";
const GLOBAL_DOC_ID = "tenant_settings";

interface GlobalSettingsDocument {
  id: string;               // "tenant_settings"
  userId: string;           // "global" (partition key)
  aiCredits: {
    projectDefault: number; // default AI budget per project ($)
    userDefault: number;    // default AI budget per user ($)
  };
  updatedAt: string;
  updatedBy: string;
  [key: string]: unknown;
}

const DEFAULT_SETTINGS: GlobalSettingsDocument = {
  id: GLOBAL_DOC_ID,
  userId: GLOBAL_PARTITION,
  aiCredits: {
    projectDefault: 10.0,
    userDefault: 5.0,
  },
  updatedAt: "",
  updatedBy: "",
};

async function handleGet(_req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const container = await getSettingsContainer();
    try {
      const { resource } = await container.item(GLOBAL_DOC_ID, GLOBAL_PARTITION).read<GlobalSettingsDocument>();
      if (!resource) return ok(stripCosmosMeta(DEFAULT_SETTINGS));
      return ok(stripCosmosMeta(resource));
    } catch {
      return ok(stripCosmosMeta(DEFAULT_SETTINGS));
    }
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function handlePut(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const user = getUserInfo(req);
    const body = (await req.json()) as Record<string, unknown>;

    const container = await getSettingsContainer();

    // Merge with existing
    let existing: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    try {
      const { resource } = await container.item(GLOBAL_DOC_ID, GLOBAL_PARTITION).read();
      if (resource) existing = resource as Record<string, unknown>;
    } catch { /* new doc */ }

    // Deep-merge aiCredits
    const existingCredits = (existing.aiCredits ?? DEFAULT_SETTINGS.aiCredits) as Record<string, unknown>;
    const bodyCredits = (body.aiCredits ?? {}) as Record<string, unknown>;

    const doc: GlobalSettingsDocument = {
      ...existing,
      ...body,
      id: GLOBAL_DOC_ID,
      userId: GLOBAL_PARTITION,
      aiCredits: {
        projectDefault: typeof bodyCredits.projectDefault === "number" ? bodyCredits.projectDefault : (existingCredits.projectDefault as number) ?? 10.0,
        userDefault: typeof bodyCredits.userDefault === "number" ? bodyCredits.userDefault : (existingCredits.userDefault as number) ?? 5.0,
      },
      updatedAt: new Date().toISOString(),
      updatedBy: user.oid,
    } as GlobalSettingsDocument;

    await container.items.upsert(doc);
    return ok(stripCosmosMeta(doc));
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

function stripCosmosMeta(doc: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, userId: _uid, _rid, _self, _etag, _attachments, _ts, ...rest } = doc as Record<string, unknown>;
  return rest;
}

async function router(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return handleGet(req);
    case "PUT":     return handlePut(req);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("globalSettings", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "global-settings",
  handler: withRole(["owner"], router),
});
