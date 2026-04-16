// Azure Static Web Apps EasyAuth (Entra ID) server-side auth helper.
//
// When a request reaches an Azure Function through SWA's auth pipeline, SWA
// forwards the verified Entra principal via the `x-ms-client-principal` header
// as base64-encoded JSON. If the header is missing, the user is not signed in.
//
// We still allow OPTIONS preflights to pass through un-authed (CORS).
//
// Local dev: set AUTH_ENABLED=false in local.settings.json to bypass the check.
// Production: AUTH_ENABLED must be "true" (or unset — defaults to enabled).

import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { getUsersContainer } from "./cosmosClient";

export type AppRole = "owner" | "qa_manager" | "qa_engineer";
const TENANT_ID = "kovai";
const SEED_OWNER_OID = process.env.SEED_OWNER_OID ?? "";

export interface UserDocument {
  id: string;
  tenantId: string;
  type: "user";
  email: string;
  displayName: string;
  role: AppRole;
  status: "active" | "invited" | "disabled";
  invitedBy: string;
  invitedAt: string;
  acceptedAt?: string;
  updatedAt: string;
  updatedBy: string;
}

// In-memory cache per function invocation — avoid repeated Cosmos reads.
const _userCache = new Map<string, UserDocument | null>();

const CORS_HEADERS_JSON = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export interface ClientPrincipal {
  userId: string;              // Entra object ID (OID)
  userDetails: string;         // display name or UPN
  identityProvider: string;    // "aad"
  userRoles: string[];
  claims?: Array<{ typ: string; val: string }>;
}

function isAuthEnabled(): boolean {
  // Default to ON. Must be explicitly "false" to bypass (local dev only).
  return (process.env.AUTH_ENABLED ?? "true").toLowerCase() !== "false";
}

/** Parses the x-ms-client-principal header. Returns null if missing/invalid. */
export function parseClientPrincipal(req: HttpRequest): ClientPrincipal | null {
  const header = req.headers.get("x-ms-client-principal");
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const principal = JSON.parse(decoded) as ClientPrincipal;
    if (!principal.userId) return null;
    return principal;
  } catch {
    return null;
  }
}

/**
 * Wraps a function handler with Entra auth enforcement.
 * - OPTIONS preflights pass through (CORS).
 * - When AUTH_ENABLED=false, auth is bypassed (local dev).
 * - Otherwise, a valid x-ms-client-principal is required; else 401.
 */
/** Extracts { oid, name } from the Entra client principal on the request. */
export function getUserInfo(req: HttpRequest): { oid: string; name: string } {
  const principal = parseClientPrincipal(req);
  return {
    oid: principal?.userId ?? "anonymous",
    name: principal?.userDetails ?? "Anonymous",
  };
}

/** Reads X-FlowForge-ProjectId header. Throws 400 if missing. */
export function getProjectId(req: HttpRequest): string {
  const pid = req.headers.get("x-flowforge-projectid");
  if (!pid) {
    throw new ProjectIdMissingError();
  }
  return pid;
}

export class ProjectIdMissingError extends Error {
  constructor() {
    super("X-FlowForge-ProjectId header is required");
  }
}

export function withAuth<T extends unknown[]>(
  handler: (req: HttpRequest, ...rest: T) => Promise<HttpResponseInit>,
): (req: HttpRequest, ...rest: T) => Promise<HttpResponseInit> {
  return async (req: HttpRequest, ...rest: T): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") {
      return handler(req, ...rest);
    }
    if (!isAuthEnabled()) {
      return handler(req, ...rest);
    }
    const principal = parseClientPrincipal(req);
    if (!principal) {
      return {
        status: 401,
        headers: CORS_HEADERS_JSON,
        body: JSON.stringify({ error: "Unauthorized — Entra sign-in required" }),
      };
    }
    return handler(req, ...rest);
  };
}

/** Look up a user doc by OID. Auto-seeds the owner if the container is empty. */
export async function lookupUser(oid: string, displayName: string, email: string): Promise<UserDocument | null> {
  console.log("[lookupUser] oid=%s name=%s email=%s SEED_OWNER_OID=%s", oid, displayName, email, SEED_OWNER_OID);

  if (_userCache.has(oid)) {
    console.log("[lookupUser] cache hit, returning cached value");
    return _userCache.get(oid) ?? null;
  }

  const container = await getUsersContainer();

  // Try point-read by OID first
  try {
    const { resource } = await container.item(oid, TENANT_ID).read<UserDocument>();
    if (resource && resource.status !== "disabled") {
      console.log("[lookupUser] found by OID, role=%s status=%s", resource.role, resource.status);
      _userCache.set(oid, resource);
      return resource;
    }
    if (resource?.status === "disabled") {
      console.log("[lookupUser] user disabled");
      _userCache.set(oid, null);
      return null;
    }
  } catch (e) {
    console.log("[lookupUser] point-read miss: %s", e instanceof Error ? e.message : String(e));
  }

  // Try matching by email (pending invite)
  try {
    const { resources } = await container.items.query<UserDocument>({
      query: "SELECT * FROM c WHERE c.tenantId = @tid AND c.email = @email AND c.status = 'invited'",
      parameters: [
        { name: "@tid", value: TENANT_ID },
        { name: "@email", value: email.toLowerCase() },
      ],
    }).fetchAll();

    console.log("[lookupUser] email query returned %d results for email=%s", resources.length, email.toLowerCase());

    if (resources.length > 0) {
      const invite = resources[0];
      // Accept the invite — update with real OID and display name
      const accepted: UserDocument = {
        ...invite,
        id: oid,
        displayName,
        email: email.toLowerCase(),
        status: "active",
        acceptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Delete old invite doc (keyed by placeholder id) and create real one
      if (invite.id !== oid) {
        try { await container.item(invite.id, TENANT_ID).delete(); } catch { /* ignore */ }
      }
      await container.items.upsert(accepted);
      _userCache.set(oid, accepted);
      return accepted;
    }
  } catch (e) {
    console.log("[lookupUser] email query failed: %s", e instanceof Error ? e.message : String(e));
  }

  // Auto-seed owner on first ever request
  console.log("[lookupUser] seed check: SEED_OWNER_OID=%s oid=%s match=%s", SEED_OWNER_OID, oid, String(SEED_OWNER_OID === oid));
  if (SEED_OWNER_OID && oid === SEED_OWNER_OID) {
    try {
      const now = new Date().toISOString();
      const ownerDoc: UserDocument = {
        id: oid,
        tenantId: TENANT_ID,
        type: "user",
        email: email.toLowerCase(),
        displayName,
        role: "owner",
        status: "active",
        invitedBy: "system",
        invitedAt: now,
        acceptedAt: now,
        updatedAt: now,
        updatedBy: "system",
      };
      await container.items.upsert(ownerDoc);
      console.log("[lookupUser] owner auto-seeded successfully");
      _userCache.set(oid, ownerDoc);
      return ownerDoc;
    } catch (e) {
      console.error("[lookupUser] SEED FAILED:", e instanceof Error ? e.message : String(e));
    }
  }

  console.log("[lookupUser] no match — returning null");
  _userCache.set(oid, null);
  return null;
}

/**
 * Wraps a handler with role-based access control.
 * Must be used INSIDE withAuth (Entra is already validated).
 */
export function withRole<T extends unknown[]>(
  allowedRoles: AppRole[],
  handler: (req: HttpRequest, ...rest: T) => Promise<HttpResponseInit>,
): (req: HttpRequest, ...rest: T) => Promise<HttpResponseInit> {
  return withAuth(async (req: HttpRequest, ...rest: T): Promise<HttpResponseInit> => {
    if (!isAuthEnabled()) {
      return handler(req, ...rest);
    }
    const principal = parseClientPrincipal(req);
    if (!principal) {
      return { status: 401, headers: CORS_HEADERS_JSON, body: JSON.stringify({ error: "Unauthorized" }) };
    }
    const email = principal.userDetails ?? "";
    const user = await lookupUser(principal.userId, principal.userDetails ?? "Unknown", email);
    if (!user) {
      return { status: 403, headers: CORS_HEADERS_JSON, body: JSON.stringify({ error: "not_registered" }) };
    }
    if (!allowedRoles.includes(user.role)) {
      return { status: 403, headers: CORS_HEADERS_JSON, body: JSON.stringify({ error: "insufficient_role", role: user.role, required: allowedRoles }) };
    }
    return handler(req, ...rest);
  });
}
