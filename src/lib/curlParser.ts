/**
 * Parse a cURL command string into structured endpoint configuration.
 *
 * Supports:
 * - Bearer tokens, Basic auth, API key (header & query), session cookies
 * - Both single-quote and double-quote header values
 * - Multiline commands with \ (Unix) or ^ (Windows) continuations
 * - -u user:pass shorthand for Basic auth
 */

export interface CurlParseResult {
  baseUrl: string;
  apiVersion: string;
  authType: "bearer" | "apikey_header" | "apikey_query" | "basic" | "cookie" | "none";
  /** Header name for apikey_header auth (e.g. "X-Api-Key") */
  authHeaderName?: string;
  /** Query param name for apikey_query auth (e.g. "api_key") */
  authQueryParam?: string;
  /** The raw credential value */
  credential: string;
  /** HTTP method if specified (-X / --request) */
  method?: string;
  /** Full URL as pasted */
  rawUrl: string;
  /** Parse warnings (non-fatal) */
  warnings: string[];
}

const API_KEY_HEADERS = new Set([
  "api_token", "api-token", "apitoken",
  "api_key", "api-key", "apikey",
  "x-api-key", "x-api-token",
  "x-auth-token", "x-auth-key",
  "access_token", "access-token",
  "token",
]);

const API_KEY_QUERY_PARAMS = new Set([
  "api_token", "api_key", "apikey", "apiKey",
  "access_token", "token", "key",
]);

/** Normalise multiline continuations and collapse into a single line. */
function normaliseCurl(raw: string): string {
  return raw
    .replace(/\\\s*\n/g, " ")   // Unix continuation
    .replace(/\^\s*\n/g, " ")   // Windows continuation
    .replace(/\n/g, " ")
    .trim();
}

/** Extract tokens respecting quotes. Returns array of argument strings. */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < line.length) {
    // Skip whitespace
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;

    const ch = line[i];
    if (ch === '"' || ch === "'") {
      // Quoted token
      const quote = ch;
      i++; // skip opening quote
      let tok = "";
      while (i < line.length && line[i] !== quote) {
        if (line[i] === "\\" && i + 1 < line.length) {
          tok += line[i + 1];
          i += 2;
        } else {
          tok += line[i];
          i++;
        }
      }
      if (i < line.length) i++; // skip closing quote
      tokens.push(tok);
    } else {
      // Unquoted token
      let tok = "";
      while (i < line.length && !/\s/.test(line[i])) {
        tok += line[i];
        i++;
      }
      tokens.push(tok);
    }
  }

  return tokens;
}

/** Try to extract a version segment like /v2/ or /v3 from a URL path. */
function extractApiVersion(urlPath: string): string {
  const match = urlPath.match(/\/(v\d+)\b/i);
  return match ? match[1] : "";
}

export function parseCurl(raw: string): CurlParseResult {
  const warnings: string[] = [];
  const line = normaliseCurl(raw);
  const tokens = tokenize(line);

  // Strip leading "curl" if present
  let start = 0;
  if (tokens.length > 0 && tokens[0].toLowerCase() === "curl") start = 1;

  let url = "";
  let method = "";
  const headers: Array<{ name: string; value: string }> = [];
  let basicAuth = "";

  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok === "-H" || tok === "--header") {
      i++;
      if (i < tokens.length) {
        const headerStr = tokens[i];
        const colonIdx = headerStr.indexOf(":");
        if (colonIdx > 0) {
          const name = headerStr.slice(0, colonIdx).trim();
          const value = headerStr.slice(colonIdx + 1).trim();
          headers.push({ name, value });
        }
      }
    } else if (tok === "-X" || tok === "--request") {
      i++;
      if (i < tokens.length) method = tokens[i].toUpperCase();
    } else if (tok === "-u" || tok === "--user") {
      i++;
      if (i < tokens.length) basicAuth = tokens[i];
    } else if (tok === "-d" || tok === "--data" || tok === "--data-raw" || tok === "--data-binary" || tok === "--data-urlencode") {
      i++; // skip the data value
    } else if (tok === "-o" || tok === "--output" || tok === "-L" || tok === "--location") {
      // skip -o with arg, -L has no arg
      if (tok === "-o" || tok === "--output") i++;
    } else if (tok.startsWith("-")) {
      // Unknown flag — skip
    } else {
      // Positional argument — treat as URL
      if (!url) url = tok;
    }

    i++;
  }

  if (!url) {
    return {
      baseUrl: "", apiVersion: "", authType: "none", credential: "",
      rawUrl: "", warnings: ["No URL found in cURL command"],
    };
  }

  // Parse URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      baseUrl: "", apiVersion: "", authType: "none", credential: "",
      rawUrl: url, warnings: [`Invalid URL: ${url}`],
    };
  }

  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const apiVersion = extractApiVersion(parsedUrl.pathname);

  // Detect auth from headers
  let authType: CurlParseResult["authType"] = "none";
  let credential = "";
  let authHeaderName: string | undefined;
  let authQueryParam: string | undefined;

  for (const h of headers) {
    const nameLower = h.name.toLowerCase();

    if (nameLower === "authorization") {
      const val = h.value;
      if (val.toLowerCase().startsWith("bearer ")) {
        authType = "bearer";
        credential = val.slice(7).trim();
      } else if (val.toLowerCase().startsWith("basic ")) {
        authType = "basic";
        credential = val.slice(6).trim();
      }
      break;
    }

    if (API_KEY_HEADERS.has(nameLower)) {
      authType = "apikey_header";
      authHeaderName = h.name; // preserve original casing
      credential = h.value;
      break;
    }

    if (nameLower === "cookie") {
      authType = "cookie";
      credential = h.value;
      break;
    }
  }

  // Check -u flag for Basic auth
  if (authType === "none" && basicAuth) {
    authType = "basic";
    credential = btoa(basicAuth); // encode user:pass to base64
  }

  // Check query params for API keys
  if (authType === "none") {
    for (const [key, value] of parsedUrl.searchParams) {
      if (API_KEY_QUERY_PARAMS.has(key)) {
        authType = "apikey_query";
        authQueryParam = key;
        credential = value;
        break;
      }
    }
  }

  if (authType === "none" && headers.length === 0 && !basicAuth) {
    warnings.push("No authentication detected — you may need to add credentials manually");
  }

  return {
    baseUrl,
    apiVersion,
    authType,
    authHeaderName,
    authQueryParam,
    credential,
    method: method || undefined,
    rawUrl: url,
    warnings,
  };
}

/** Mask a credential for display (show first 4 + last 2 chars). */
export function maskCredential(cred: string): string {
  if (cred.length <= 8) return "••••••";
  return `${cred.slice(0, 4)}${"•".repeat(Math.min(cred.length - 6, 12))}${cred.slice(-2)}`;
}

/** Human-friendly label for an auth type. */
export function authTypeLabel(authType: CurlParseResult["authType"]): string {
  const labels: Record<string, string> = {
    bearer: "Bearer Token",
    apikey_header: "API Key (Header)",
    apikey_query: "API Key (Query Param)",
    basic: "Basic Auth",
    cookie: "Session Cookie",
    none: "No Auth",
  };
  return labels[authType] ?? authType;
}
