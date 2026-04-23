/**
 * Auto-detect endpoint configuration from OpenAPI 3.x or Swagger 2.x specs.
 *
 * Extracts:
 * - Base URL from `servers` (OAS3) or `host`+`basePath`+`schemes` (Swagger 2)
 * - API version from URL path or `info.version`
 * - Auth type from `securityDefinitions` (Swagger 2) or `components.securitySchemes` (OAS3)
 * - Auth header/query param names for API key auth
 */

import type { AuthType } from "../../types/test.types";

export interface DetectedEndpoint {
  baseUrl: string;
  apiVersion: string;
  authType: AuthType;
  authHeaderName?: string;
  authQueryParam?: string;
  endpointLabel?: string;
  /** Human-readable description of what was detected */
  summary: string;
}

interface OAS3SecurityScheme {
  type: string;       // "apiKey" | "http" | "oauth2" | "openIdConnect"
  in?: string;        // "header" | "query" | "cookie" (for apiKey)
  name?: string;      // Header/query param name (for apiKey)
  scheme?: string;    // "bearer" | "basic" (for http)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flows?: any;        // OAuth2 flows
}

interface Swagger2SecurityDef {
  type: string;       // "apiKey" | "basic" | "oauth2"
  in?: string;        // "header" | "query" (for apiKey)
  name?: string;      // Header/query param name (for apiKey)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flow?: string;      // OAuth2 flow type
}

/**
 * Try to parse content as an OpenAPI/Swagger spec and extract endpoint config.
 * Returns null if the content is not a valid OpenAPI/Swagger spec.
 */
export function detectEndpointFromSpec(content: string): DetectedEndpoint | null {
  let spec: Record<string, unknown>;
  try {
    spec = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null; // Not valid JSON
  }

  // Detect spec version
  const isOAS3 = typeof spec.openapi === "string" && spec.openapi.startsWith("3");
  const isSwagger2 = spec.swagger === "2.0";
  if (!isOAS3 && !isSwagger2) return null;

  // Must have paths to be a valid API spec
  if (!spec.paths || typeof spec.paths !== "object") return null;

  const info = spec.info as { title?: string; version?: string } | undefined;
  const title = info?.title ?? "API";

  // ── Extract base URL ──────────────────────────────────────────────────────

  let baseUrl = "";
  let apiVersion = "";

  if (isOAS3 && Array.isArray(spec.servers) && spec.servers.length > 0) {
    const server = spec.servers[0] as { url?: string; description?: string };
    if (server.url) {
      baseUrl = normalizeServerUrl(server.url);
    }
  } else if (isSwagger2) {
    const host = spec.host as string | undefined;
    const basePath = spec.basePath as string | undefined;
    const schemes = spec.schemes as string[] | undefined;
    if (host) {
      const scheme = schemes?.[0] ?? "https";
      baseUrl = `${scheme}://${host}`;
      if (basePath && basePath !== "/") {
        // Don't append basePath to baseUrl — it often contains the version segment
        // which we want to extract separately
        const vMatch = basePath.match(/^\/(v\d+)/i);
        if (vMatch) {
          apiVersion = vMatch[1];
        }
      }
    }
  }

  // Try to extract version from base URL path
  if (!apiVersion && baseUrl) {
    try {
      const urlObj = new URL(baseUrl);
      const vMatch = urlObj.pathname.match(/\/(v\d+)\b/i);
      if (vMatch) {
        apiVersion = vMatch[1];
        // Strip version from baseUrl — keep just scheme://host
        baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      }
    } catch { /* ignore */ }
  }

  // Fallback: try info.version
  if (!apiVersion && info?.version) {
    const vMatch = info.version.match(/^(v?\d+)/i);
    if (vMatch) {
      apiVersion = vMatch[1].startsWith("v") ? vMatch[1] : `v${vMatch[1]}`;
    }
  }

  // ── Extract auth type ─────────────────────────────────────────────────────

  let authType: AuthType = "none";
  let authHeaderName: string | undefined;
  let authQueryParam: string | undefined;

  if (isOAS3) {
    const components = spec.components as { securitySchemes?: Record<string, OAS3SecurityScheme> } | undefined;
    const schemes = components?.securitySchemes;
    if (schemes) {
      const detected = detectFromOAS3Schemes(schemes);
      authType = detected.authType;
      authHeaderName = detected.authHeaderName;
      authQueryParam = detected.authQueryParam;
    }
  } else if (isSwagger2) {
    const defs = spec.securityDefinitions as Record<string, Swagger2SecurityDef> | undefined;
    if (defs) {
      const detected = detectFromSwagger2Defs(defs);
      authType = detected.authType;
      authHeaderName = detected.authHeaderName;
      authQueryParam = detected.authQueryParam;
    }
  }

  // If no security schemes but spec has global security requirement, note it
  if (authType === "none") {
    const security = spec.security as Array<Record<string, string[]>> | undefined;
    if (security && security.length > 0) {
      // There's a security requirement but we couldn't determine the type
      authType = "bearer"; // Default assumption for secured APIs
    }
  }

  // ── Build summary ─────────────────────────────────────────────────────────

  const parts: string[] = [];
  if (baseUrl) parts.push(baseUrl);
  if (apiVersion) parts.push(apiVersion);
  if (authType !== "none") parts.push(authTypeLabel(authType));

  const pathCount = Object.keys(spec.paths as Record<string, unknown>).length;
  const summary = `Detected ${title} — ${pathCount} endpoint${pathCount !== 1 ? "s" : ""}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;

  // ── Build label ───────────────────────────────────────────────────────────

  let endpointLabel = title;
  if (apiVersion) endpointLabel += ` ${apiVersion}`;

  return {
    baseUrl,
    apiVersion,
    authType,
    authHeaderName,
    authQueryParam,
    endpointLabel,
    summary,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeServerUrl(url: string): string {
  // OAS3 server URLs can be relative or contain variables like {protocol}://
  // Strip trailing slash and variable placeholders
  let normalized = url.replace(/\/$/, "");
  // Replace {var} placeholders with common defaults
  normalized = normalized.replace(/\{protocol\}/g, "https");
  normalized = normalized.replace(/\{host\}/g, "api.example.com");
  normalized = normalized.replace(/\{basePath\}/g, "");
  normalized = normalized.replace(/\{version\}/g, "v1");
  return normalized;
}

function detectFromOAS3Schemes(
  schemes: Record<string, OAS3SecurityScheme>,
): { authType: AuthType; authHeaderName?: string; authQueryParam?: string } {
  // Priority: bearer > apiKey > basic > oauth2
  for (const [, scheme] of Object.entries(schemes)) {
    if (scheme.type === "http" && scheme.scheme?.toLowerCase() === "bearer") {
      return { authType: "bearer" };
    }
  }
  for (const [, scheme] of Object.entries(schemes)) {
    if (scheme.type === "apiKey") {
      if (scheme.in === "header") {
        return { authType: "apikey_header", authHeaderName: scheme.name };
      }
      if (scheme.in === "query") {
        return { authType: "apikey_query", authQueryParam: scheme.name };
      }
      if (scheme.in === "cookie") {
        return { authType: "cookie" };
      }
    }
  }
  for (const [, scheme] of Object.entries(schemes)) {
    if (scheme.type === "http" && scheme.scheme?.toLowerCase() === "basic") {
      return { authType: "basic" };
    }
  }
  for (const [, scheme] of Object.entries(schemes)) {
    if (scheme.type === "oauth2") {
      return { authType: "oauth" };
    }
  }
  return { authType: "none" };
}

function detectFromSwagger2Defs(
  defs: Record<string, Swagger2SecurityDef>,
): { authType: AuthType; authHeaderName?: string; authQueryParam?: string } {
  // Priority: apiKey > basic > oauth2
  for (const [, def] of Object.entries(defs)) {
    if (def.type === "apiKey") {
      if (def.in === "header") {
        return { authType: "apikey_header", authHeaderName: def.name };
      }
      if (def.in === "query") {
        return { authType: "apikey_query", authQueryParam: def.name };
      }
    }
  }
  for (const [, def] of Object.entries(defs)) {
    if (def.type === "basic") {
      return { authType: "basic" };
    }
  }
  for (const [, def] of Object.entries(defs)) {
    if (def.type === "oauth2") {
      return { authType: "oauth" };
    }
  }
  return { authType: "none" };
}

function authTypeLabel(authType: AuthType): string {
  const labels: Record<string, string> = {
    bearer: "Bearer Token",
    apikey_header: "API Key (Header)",
    apikey_query: "API Key (Query)",
    basic: "Basic Auth",
    cookie: "Cookie",
    oauth: "OAuth 2.0",
    none: "No Auth",
  };
  return labels[authType] ?? authType;
}

/**
 * Check if a filename looks like it could be an OpenAPI/Swagger spec.
 */
export function isLikelySpecFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith(".json") &&
    (lower.includes("swagger") || lower.includes("openapi") || lower.includes("spec") || lower.includes("api"))
  );
}
