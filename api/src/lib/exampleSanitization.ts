// Pure helpers for sanitization of captured Try-it data before it reaches the
// AI, and for post-pass detection of secrets the AI may have left behind.

const ALWAYS_STRIPPED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

const FF_INTERNAL_HEADERS = new Set([
  "x-ff-connection-id",
  "x-ff-base-url",
  "x-ff-content-type",
  "x-flowforge-projectid",
]);

const SECRET_HEADER_RE = /(^|-)(api[_-]?key|secret|token|session|csrf|xsrf|signature|bearer)(-|$)/i;

export interface StripAuthResult {
  sanitized: Record<string, string>;
  strippedValues: string[];
}

export function stripAuthHeaders(headers: Record<string, string>): StripAuthResult {
  const sanitized: Record<string, string> = {};
  const strippedValues: string[] = [];
  for (const [key, value] of Object.entries(headers ?? {})) {
    const k = key.toLowerCase();
    const isInternal = FF_INTERNAL_HEADERS.has(k) || k.startsWith("x-ms-client-principal");
    const isSecret = ALWAYS_STRIPPED_HEADERS.has(k) || SECRET_HEADER_RE.test(k);
    if (isInternal || isSecret) {
      if (typeof value === "string" && value.length > 0) strippedValues.push(value);
      continue;
    }
    sanitized[key] = value;
  }
  return { sanitized, strippedValues };
}

const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9_\-.~+/=]+/i;

export function detectResidualSecrets(value: unknown, knownSecretValues: string[]): string[] {
  const hits = new Set<string>();
  const seen = new WeakSet<object>();

  function walk(v: unknown): void {
    if (typeof v === "string") {
      if (JWT_RE.test(v)) hits.add("jwt");
      if (BEARER_RE.test(v)) hits.add("bearer_prefix");
      for (const known of knownSecretValues) {
        if (typeof known === "string" && known.length >= 8 && v.includes(known)) {
          hits.add("known_secret_value");
          break;
        }
      }
      return;
    }
    if (v === null || typeof v !== "object") return;
    if (seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
    } else {
      for (const item of Object.values(v as Record<string, unknown>)) walk(item);
    }
  }

  walk(value);
  return Array.from(hits);
}

export interface TruncateResult {
  text: string;
  truncated: boolean;
  originalSize: number;
}

export function truncateForAi(s: string | null | undefined, maxBytes = 65536): TruncateResult {
  const text = s ?? "";
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) {
    return { text, truncated: false, originalSize: bytes };
  }
  const buf = Buffer.from(text, "utf8");
  const slicedText = buf.subarray(0, maxBytes).toString("utf8");
  return {
    text: `${slicedText}\n…(truncated, ${bytes} bytes total)`,
    truncated: true,
    originalSize: bytes,
  };
}
