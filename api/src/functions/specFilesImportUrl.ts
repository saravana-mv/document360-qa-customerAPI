import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { uploadBlob, downloadBlob, blobExists } from "../lib/blobClient";
import { withAuth } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT = 15_000;
const MAX_REDIRECTS = 20;

/**
 * Parse a Set-Cookie header value and extract the `name=value` pair only.
 * We intentionally ignore attributes (Domain, Path, Expires, Secure, …) —
 * this is a single-request transient jar, not a full cookie store.
 */
function extractCookiePair(setCookie: string): string | null {
  const first = setCookie.split(";")[0]?.trim();
  if (!first || !first.includes("=")) return null;
  return first;
}

/**
 * Manually follow redirects so we can preserve cookies across hops. Cloudflare
 * and similar edge protections often set a session cookie on the first 3xx
 * response and redirect to the same URL — undici's built-in redirect follower
 * drops Set-Cookie, so it loops until MAX_REDIRECTS and throws.
 */
async function fetchWithCookieJar(
  startUrl: string,
  initHeaders: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  let currentUrl = startUrl;
  const cookieJar: string[] = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const headers: Record<string, string> = { ...initHeaders };
    if (cookieJar.length > 0) headers["Cookie"] = cookieJar.join("; ");

    const res = await fetch(currentUrl, {
      signal,
      headers,
      redirect: "manual",
    });

    // Collect cookies set on this response. Node's Headers exposes combined
    // set-cookie via getSetCookie() (Node 20+). Fall back to split-on-comma
    // as a last resort — imperfect but good enough for a one-shot import.
    const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
    const setCookies: string[] = typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
    for (const sc of setCookies) {
      const pair = extractCookiePair(sc);
      if (!pair) continue;
      const [name] = pair.split("=");
      const idx = cookieJar.findIndex((c) => c.split("=")[0] === name);
      if (idx >= 0) cookieJar[idx] = pair; else cookieJar.push(pair);
    }

    // 3xx → follow. Otherwise return.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      currentUrl = new URL(location, currentUrl).toString();
      // Drain the body so the socket can be reused.
      await res.arrayBuffer().catch(() => undefined);
      continue;
    }
    return res;
  }
  throw new Error(`too many redirects (>${MAX_REDIRECTS})`);
}

interface SourceEntry {
  sourceUrl: string;
  importedAt: string;
  lastSyncedAt: string | null;
}

type SourcesManifest = Record<string, SourceEntry>;

/** Read or initialise the _sources.json manifest for a folder. */
async function readManifest(folderPath: string): Promise<SourcesManifest> {
  const manifestPath = folderPath ? `${folderPath}/_sources.json` : "_sources.json";
  try {
    const raw = await downloadBlob(manifestPath);
    return JSON.parse(raw) as SourcesManifest;
  } catch {
    return {};
  }
}

async function writeManifest(folderPath: string, manifest: SourcesManifest): Promise<void> {
  const manifestPath = folderPath ? `${folderPath}/_sources.json` : "_sources.json";
  await uploadBlob(manifestPath, JSON.stringify(manifest, null, 2), "application/json");
}

/** Derive a filename from a URL (last path segment). */
function filenameFromUrl(url: string): string {
  const u = new URL(url);
  const segments = u.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "imported.md";
  // Ensure it ends with .md
  return last.endsWith(".md") ? last : `${last}.md`;
}

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  try {
    const body = (await req.json()) as {
      url?: string;
      folderPath?: string;
      filename?: string;
      accessToken?: string;
      content?: string;        // Pre-fetched content from client-side fetch
    };
    const url = body.url?.trim();
    const folderPath = body.folderPath?.trim() ?? "";
    const filenameOverride = body.filename?.trim();
    const accessToken = body.accessToken?.trim();
    const clientContent = body.content;

    if (!url) return err(400, "url is required");

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return err(400, "Invalid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return err(400, "Only HTTP/HTTPS URLs are supported");
    }

    const filename = filenameOverride || filenameFromUrl(url);
    const blobPath = folderPath ? `${folderPath}/${filename}` : filename;

    let content: string;

    if (clientContent != null) {
      // Content was pre-fetched client-side (browser had session cookies)
      content = clientContent;
      if (content.length > MAX_SIZE) {
        return err(413, `File too large (max ${MAX_SIZE / 1024 / 1024}MB)`);
      }
    } else {
      // Fetch content from URL server-side
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      let response: Response;
      try {
        // Many origins (Cloudflare, Document360 apidocs, etc.) reject requests
        // without a real User-Agent or Accept header — Node's default fetch
        // sends neither and gets a bare "fetch failed" back. Mimic a browser.
        const fetchHeaders: Record<string, string> = {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/markdown, text/plain, text/html, */*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        };
        if (accessToken) fetchHeaders["Authorization"] = `Bearer ${accessToken}`;
        // Follow redirects manually so Set-Cookie from edge protections
        // (Cloudflare __cf_bm, session IDs, etc.) survive the hop chain.
        response = await fetchWithCookieJar(url, fetchHeaders, controller.signal);
      } catch (fetchErr) {
        clearTimeout(timer);
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        // Node's undici swallows the real cause in `err.cause` — surface it
        // so the user can tell DNS/TLS/connect-refused apart from each other.
        const cause = fetchErr instanceof Error && (fetchErr as Error & { cause?: unknown }).cause;
        const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : "";
        return err(502, `Failed to fetch URL: ${msg}${causeMsg ? ` (${causeMsg})` : ""}`);
      }
      clearTimeout(timer);

      if (!response.ok) {
        return err(502, `URL returned HTTP ${response.status}`);
      }

      // Check size via Content-Length header first
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
        return err(413, `File too large (max ${MAX_SIZE / 1024 / 1024}MB)`);
      }

      content = await response.text();
      if (content.length > MAX_SIZE) {
        return err(413, `File too large (max ${MAX_SIZE / 1024 / 1024}MB)`);
      }
    }

    // Upload to blob storage
    await uploadBlob(blobPath, content, "text/markdown");

    // Update _sources.json manifest
    const manifest = await readManifest(folderPath);
    manifest[filename] = {
      sourceUrl: url,
      importedAt: new Date().toISOString(),
      lastSyncedAt: null,
    };
    await writeManifest(folderPath, manifest);

    return ok({ name: blobPath, filename, uploaded: true, sourceUrl: url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

app.http("specFilesImportUrl", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/import-url",
  handler: withAuth(handler),
});
