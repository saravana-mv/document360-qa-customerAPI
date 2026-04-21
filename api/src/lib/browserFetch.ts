/**
 * Shared browser-mimicking fetch helpers for server-side URL fetching.
 *
 * Cloudflare-fronted origins (e.g. Document360 apidocs) reject requests
 * without real browser headers. This module provides:
 * - Browser User-Agent and Accept headers
 * - Cookie jar that preserves Set-Cookie across redirect hops
 */

const MAX_REDIRECTS = 20;

/** Extract the `name=value` pair from a Set-Cookie header. */
function extractCookiePair(setCookie: string): string | null {
  const first = setCookie.split(";")[0]?.trim();
  if (!first || !first.includes("=")) return null;
  return first;
}

/** Standard browser-like headers for fetching spec content. */
export function browserHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/markdown, text/plain, text/html, */*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  return headers;
}

/**
 * Manually follow redirects preserving cookies across hops.
 * Cloudflare and similar edge protections set a session cookie on the first
 * 3xx response — undici's built-in redirect follower drops Set-Cookie.
 */
export async function fetchWithCookieJar(
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

    // Collect cookies from this response
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
      await res.arrayBuffer().catch(() => undefined);
      continue;
    }
    return res;
  }
  throw new Error(`too many redirects (>${MAX_REDIRECTS})`);
}

/**
 * Fetch a URL with browser headers and cookie jar support.
 * Returns the Response object. Throws on network/redirect errors.
 */
export async function browserFetch(
  url: string,
  accessToken?: string,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = browserHeaders(accessToken);
    const response = await fetchWithCookieJar(url, headers, controller.signal);
    return response;
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    const cause = fetchErr instanceof Error && (fetchErr as Error & { cause?: unknown }).cause;
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : "";
    throw new Error(`Fetch failed: ${msg}${causeMsg ? ` (${causeMsg})` : ""}`);
  } finally {
    clearTimeout(timer);
  }
}
