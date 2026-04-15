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
