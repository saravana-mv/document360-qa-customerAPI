/**
 * HAR File Parser — client-side only.
 * Parses HAR JSON, filters API calls, sanitizes sensitive data,
 * and produces a compact trace for AI prompt injection.
 */

// ── Types ──

export interface HarParseResult {
  totalEntries: number;
  filteredEntries: number;
  apiCalls: ParsedApiCall[];
  trace: string;
  baseUrlUsed: string;
  detectedBaseUrls: string[];
}

export interface ParsedApiCall {
  seq: number;
  method: string;
  path: string;
  pathTemplate: string;
  status: number;
  timingMs: number;
  requestBodyKeys: string[];
  responseBodyKeys: string[];
}

interface HarEntry {
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    postData?: { mimeType?: string; text?: string };
  };
  response: {
    status: number;
    headers: Array<{ name: string; value: string }>;
    content?: { mimeType?: string; text?: string; size?: number };
  };
  time?: number;
  timings?: { wait?: number; receive?: number };
}

interface HarLog {
  log: {
    version?: string;
    entries: HarEntry[];
  };
}

// ── Constants ──

const SENSITIVE_HEADERS = /^(authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i;
const SENSITIVE_HEADER_CONTENT = /token|secret|auth|password|credential/i;
const SENSITIVE_BODY_KEYS = /^(password|token|secret|apiKey|api_key|accessToken|access_token|refreshToken|refresh_token|client_secret|private_key)$/;
const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webp|avif|mp4|webm)(\?|$)/i;
const ANALYTICS_PATHS = /\/(analytics|telemetry|tracking|beacon|collect|pixel|gtag|gtm)\b/i;

// UUID: 8-4-4-4-12 hex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// MongoDB ObjectID: 24 hex chars
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
// Pure numeric
const NUMERIC_RE = /^\d+$/;

const DEFAULT_MAX_CHARS = 15_000;

// ── Core Functions ──

export function parseHarFile(json: string): HarLog {
  const parsed = JSON.parse(json);
  if (!parsed?.log?.entries || !Array.isArray(parsed.log.entries)) {
    throw new Error("Invalid HAR file: missing log.entries array");
  }
  return parsed as HarLog;
}

export function detectBaseUrls(entries: HarEntry[]): string[] {
  const freq = new Map<string, number>();
  for (const entry of entries) {
    try {
      const url = new URL(entry.request.url);
      const origin = url.origin;
      freq.set(origin, (freq.get(origin) ?? 0) + 1);
    } catch {
      // skip invalid URLs
    }
  }
  // Sort by frequency descending, filter out common non-API origins
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .filter((url) => !url.includes("google-analytics") && !url.includes("googleapis.com/analytics"));
}

export function filterApiCalls(entries: HarEntry[], baseUrlFilter?: string): HarEntry[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const { url, method } = entry.request;

    // Filter by base URL if provided
    if (baseUrlFilter && !url.startsWith(baseUrlFilter)) return false;

    // Skip static assets
    const path = extractPath(url);
    if (STATIC_EXTENSIONS.test(path)) return false;

    // Skip analytics/tracking
    if (ANALYTICS_PATHS.test(path)) return false;

    // Only keep JSON API calls (or requests with no content-type that return JSON)
    const reqContentType = entry.request.postData?.mimeType ?? "";
    const resContentType = entry.response.content?.mimeType ?? "";
    const isJsonReq = reqContentType.includes("json");
    const isJsonRes = resContentType.includes("json");
    const isApiCall = isJsonReq || isJsonRes || method !== "GET";

    if (!isApiCall) return false;

    // Collapse duplicate polling requests (same method + templateized path)
    const template = templateizePath(path);
    const key = `${method}:${template}:${entry.response.status}`;
    if (seen.has(key) && method === "GET") return false;
    seen.add(key);

    return true;
  });
}

export function sanitizeEntry(entry: HarEntry): HarEntry {
  const clone = JSON.parse(JSON.stringify(entry)) as HarEntry;

  // Sanitize request headers
  clone.request.headers = clone.request.headers.filter((h) => {
    if (SENSITIVE_HEADERS.test(h.name)) return false;
    if (SENSITIVE_HEADER_CONTENT.test(h.name)) return false;
    return true;
  });

  // Sanitize response headers
  clone.response.headers = clone.response.headers.filter((h) => {
    if (SENSITIVE_HEADERS.test(h.name)) return false;
    if (SENSITIVE_HEADER_CONTENT.test(h.name)) return false;
    return true;
  });

  // Redact sensitive body fields in request
  if (clone.request.postData?.text) {
    clone.request.postData.text = redactJsonBody(clone.request.postData.text);
  }

  // Redact sensitive body fields in response
  if (clone.response.content?.text) {
    clone.response.content.text = redactJsonBody(clone.response.content.text);
  }

  return clone;
}

export function templateizePath(path: string): string {
  return path
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (UUID_RE.test(seg)) return "{id}";
      if (OBJECT_ID_RE.test(seg)) return "{id}";
      if (NUMERIC_RE.test(seg)) return "{id}";
      return seg;
    })
    .join("/");
}

export function compactTrace(calls: ParsedApiCall[], maxChars = DEFAULT_MAX_CHARS): string {
  const lines: string[] = [];

  for (const call of calls) {
    const line = `[${call.seq}] ${call.method} ${call.pathTemplate} → ${call.status} (${call.timingMs}ms)`;
    lines.push(line);

    if (call.requestBodyKeys.length > 0) {
      const keys = call.requestBodyKeys.slice(0, 10).join(", ");
      const suffix = call.requestBodyKeys.length > 10 ? `, ... (${call.requestBodyKeys.length} total)` : "";
      lines.push(`    Body: ${keys}${suffix}  [${call.requestBodyKeys.length} fields]`);
    }

    if (call.responseBodyKeys.length > 0) {
      const keys = call.responseBodyKeys.slice(0, 10).join(", ");
      const suffix = call.responseBodyKeys.length > 10 ? `, ... (${call.responseBodyKeys.length} total)` : "";
      lines.push(`    Response: ${keys}${suffix}  [${call.responseBodyKeys.length} fields]`);
    }

    lines.push("");
  }

  let trace = lines.join("\n");
  if (trace.length > maxChars) {
    trace = trace.slice(0, maxChars - 50) + "\n\n... (trace truncated to fit token budget)";
  }
  return trace;
}

export function parseAndFilter(rawJson: string, baseUrlFilter?: string): HarParseResult {
  const har = parseHarFile(rawJson);
  const entries = har.log.entries;
  const detectedBaseUrls = detectBaseUrls(entries);

  const effectiveBase = baseUrlFilter ?? detectedBaseUrls[0] ?? "";
  const filtered = filterApiCalls(entries, effectiveBase || undefined);
  const sanitized = filtered.map(sanitizeEntry);

  const apiCalls: ParsedApiCall[] = sanitized.map((entry, i) => {
    const path = extractPath(entry.request.url);
    return {
      seq: i + 1,
      method: entry.request.method.toUpperCase(),
      path,
      pathTemplate: templateizePath(path),
      status: entry.response.status,
      timingMs: Math.round(entry.time ?? entry.timings?.wait ?? 0),
      requestBodyKeys: extractBodyKeys(entry.request.postData?.text),
      responseBodyKeys: extractBodyKeys(entry.response.content?.text),
    };
  });

  const trace = compactTrace(apiCalls);

  return {
    totalEntries: entries.length,
    filteredEntries: apiCalls.length,
    apiCalls,
    trace,
    baseUrlUsed: effectiveBase,
    detectedBaseUrls,
  };
}

// ── Helpers ──

function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function extractBodyKeys(text?: string): string[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed);
    }
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
      return Object.keys(parsed[0]);
    }
  } catch {
    // not JSON
  }
  return [];
}

function redactJsonBody(text: string): string {
  try {
    const obj = JSON.parse(text);
    redactObject(obj);
    return JSON.stringify(obj);
  } catch {
    return text;
  }
}

function redactObject(obj: unknown): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) redactObject(item);
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_BODY_KEYS.test(key)) {
      (obj as Record<string, unknown>)[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redactObject(value);
    }
  }
}
