// Thin proxy that forwards SPA calls to the Document360 Customer API.
//
// The browser calls /api/d360/proxy/<path>[?query]; this function:
//   1. Resolves the caller's Entra oid from x-ms-client-principal (via withAuth)
//   2. Fetches the stored D360 token row and refreshes if near expiry
//   3. Forwards the request to D360 with Authorization: Bearer <access_token>
//   4. Streams back status + body + content-type
//
// The SPA never sees the D360 access or refresh token — only this proxy and
// the token store do.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, parseClientPrincipal } from "../lib/auth";
import { getValidAccessToken } from "../lib/d360Token";
import { getApiKeyForVersion } from "./versionAuth";

const D360_BASE_URL =
  (process.env.D360_API_BASE_URL ?? "https://apihub.berlin.document360.net").replace(/\/$/, "");

// Allowlist of request headers we forward upstream. Everything else is
// dropped — browser-added noise (Origin, Referer, sec-ch-*, sec-fetch-*,
// User-Agent, Accept-Encoding, Accept-Language) caused D360 to 500 with an
// empty body on DELETE. The API docs try-it works because it sends a minimal
// header set; mirror that.
const ALLOWED_REQUEST_HEADERS = new Set([
  "content-type",
  "accept",
  "if-match",
  "if-none-match",
]);

// Response headers we forward back to the browser. Everything else is
// dropped so SWA/Functions can set its own CORS etc.
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-language", "etag"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-D360-Method, X-D360-No-Auth, X-D360-Auth-Method, X-D360-Version",
  // Allow the SPA to read our debug headers from cross-origin responses.
  "Access-Control-Expose-Headers": "X-D360-Proxy-Build, X-D360-Proxy-Crash, X-D360-Upstream-Status, X-D360-Upstream-Url, X-D360-Trace-Id, Content-Type",
};

function errJson(status: number, message: string, extra?: Record<string, unknown>): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ error: message, ...extra }),
  };
}

async function proxyHandler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    return await proxyHandlerInner(req, ctx);
  } catch (e) {
    // Anything unexpected — body parse error, upstream stream interruption,
    // out-of-memory etc. Without this top-level catch, Azure Functions returns
    // an opaque 500 with no body and no custom headers, hiding the cause.
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack ?? "" : "";
    ctx.error(`[d360Proxy] handler crashed: ${msg}\n${stack}`);
    // Return 502 instead of 500 — SWA edge strips body/headers from 5xx,
    // but passes 502 through since it means "gateway error".
    return {
      status: 502,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "X-D360-Proxy-Build": "envelope-v6-rpc",
        "X-D360-Proxy-Crash": "1",
      },
      body: JSON.stringify({
        _proxyDebug: "Proxy handler threw before producing a response",
        error: msg,
        stack: stack.split("\n").slice(0, 10),
      }, null, 2),
    };
  }
}

async function proxyHandlerInner(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: CORS_HEADERS };
  }

  const principal = parseClientPrincipal(req);
  if (!principal) return errJson(401, "Unauthorized");

  // Extract the sub-path from the route, e.g. /api/d360/proxy/v3/projects/xyz
  // params.path contains everything after "d360/proxy/".
  const subPath = (req.params?.path ?? "").replace(/^\/+/, "");
  if (!subPath) return errJson(400, "Missing upstream path");

  // Method tunneling: Azure SWA edge has been observed to reject DELETE
  // requests from the browser with a bare 500 (no function invocation,
  // only x-ms-middleware-request-id in the response). As a workaround,
  // the SPA may send the request as POST with `X-D360-Method: DELETE`,
  // and we'll forward to the upstream with the real method.
  const methodOverride = (req.headers.get("x-d360-method") ?? "").toUpperCase();
  const effectiveMethod = methodOverride && ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(methodOverride)
    ? methodOverride
    : req.method;

  // Preserve the query string verbatim.
  const url = new URL(req.url);
  let upstreamUrl = `${D360_BASE_URL}/${subPath}${url.search}`;

  // Opt-out header lets flow tests deliberately call D360 without auth so they
  // can verify the 401 path. We still require Entra — this is only about
  // whether we inject the D360 Bearer header.
  const noAuth = (req.headers.get("x-d360-no-auth") ?? "").toLowerCase() === "1";

  // Per-version auth: client may send X-D360-Auth-Method: apikey and
  // X-D360-Version: v2 to indicate this version uses API key auth.
  const authMethodHint = (req.headers.get("x-d360-auth-method") ?? "").toLowerCase();
  const versionHint = req.headers.get("x-d360-version") ?? "";

  const forwardHeaders: Record<string, string> = {};
  forwardHeaders["Accept"] = "application/json";

  if (noAuth) {
    forwardHeaders["Authorization"] = "Bearer __invalid__";
  } else if (authMethodHint === "apikey" && versionHint) {
    // API key auth: fetch the stored key for this user+version and inject
    // as api_token query parameter (D360's API key mechanism).
    const apiKey = await getApiKeyForVersion(principal.userId, versionHint);
    if (!apiKey) {
      return errJson(401, "API key not configured for this version", { code: "APIKEY_NOT_CONFIGURED", version: versionHint });
    }
    // D360 API key goes as api_token query param
    const separator = upstreamUrl.includes("?") ? "&" : "?";
    upstreamUrl = `${upstreamUrl}${separator}api_token=${encodeURIComponent(apiKey)}`;
  } else {
    let accessToken = "";
    try {
      ({ accessToken } = await getValidAccessToken(principal.userId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "D360_NOT_AUTHENTICATED" || msg === "D360_REFRESH_UNAVAILABLE") {
        return errJson(401, "D360 sign-in required", { code: msg });
      }
      return errJson(502, `Token refresh failed: ${msg}`);
    }
    forwardHeaders["Authorization"] = `Bearer ${accessToken}`;
  }
  req.headers.forEach((value, key) => {
    if (ALLOWED_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders[key] = value;
    }
  });

  // Body: only attach for methods that explicitly carry one. DELETE/GET/HEAD/
  // OPTIONS get NO body even if the SPA accidentally passed one — some
  // intermediaries reject DELETE with Content-Length > 0.
  //
  // Note: we key off EFFECTIVE method, not the incoming request method. A
  // tunneled DELETE arrives as POST with x-d360-method: DELETE; we must
  // drop the body before forwarding, matching a real DELETE.
  const methodsWithBody = new Set(["POST", "PUT", "PATCH"]);
  const bodyBuf = methodsWithBody.has(effectiveMethod) ? await req.arrayBuffer() : undefined;

  // SWA Free plan kills Functions at 30s. Cap the upstream request at 25s and
  // return a clean 502 envelope before SWA returns its generic bare 500.
  // D360's DELETE of live entities can take tens of seconds (cascading
  // cleanup of versions/references) — this is the main trigger for the
  // "bare 500 with only x-ms-middleware-request-id" pattern.
  const controller = new AbortController();
  const timeoutMs = 25000;
  const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: effectiveMethod,
      headers: forwardHeaders,
      body: bodyBuf && bodyBuf.byteLength > 0 ? Buffer.from(bodyBuf) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutTimer);
    const isAbort = (e as { name?: string })?.name === "AbortError";
    const msg = isAbort
      ? `Upstream did not respond within ${timeoutMs}ms (SWA would kill us at 30s)`
      : `Upstream fetch failed: ${e instanceof Error ? e.message : String(e)}`;
    // Use 502 so SWA edge doesn't strip the body/headers (it masks 5xx).
    return {
      status: 502,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "X-D360-Proxy-Build": "envelope-v6-rpc",
        "X-D360-Upstream-Url": upstreamUrl,
        "X-D360-Upstream-Timeout": isAbort ? "1" : "0",
      },
      body: JSON.stringify({
        _proxyDebug: isAbort ? "Upstream timeout" : "Upstream fetch error",
        error: msg,
        upstream: { method: effectiveMethod, url: upstreamUrl },
      }, null, 2),
    };
  }
  clearTimeout(timeoutTimer);

  const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
  for (const h of FORWARDED_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) responseHeaders[h] = v;
  }
  // Sentinel header — present on EVERY proxied response so we can confirm the
  // current proxy build is the one handling the request (cache-buster check).
  responseHeaders["X-D360-Proxy-Build"] = "envelope-v6-rpc";
  responseHeaders["X-D360-Upstream-Status"] = String(upstream.status);

  // Pass through the body as a buffer — Functions v4 handles content-length.
  let responseBuf = Buffer.from(await upstream.arrayBuffer());

  // Diagnostic envelope: ANY 5xx from upstream is worth surfacing in detail.
  // Wrap the original body (which is often empty) in a JSON envelope that
  // includes the upstream headers (trace_id etc) and exactly what we sent.
  // Also expose the same info in custom response headers so the data is
  // visible even if the body is dropped by some intermediary.
  if (upstream.status >= 500) {
    const upstreamHeaders: Record<string, string> = {};
    upstream.headers.forEach((v, k) => { upstreamHeaders[k] = v; });
    const envelope = {
      _proxyDebug: "Upstream 5xx — wrapped by d360 proxy",
      upstream: {
        method: req.method,
        url: upstreamUrl,
        status: upstream.status,
        headers: upstreamHeaders,
        bodyPreview: responseBuf.toString("utf8").slice(0, 4000),
        bodyBytes: responseBuf.byteLength,
      },
      request: {
        method: effectiveMethod,
        headers: { ...forwardHeaders, Authorization: noAuth ? "Bearer __invalid__" : "Bearer ***" },
        bodyBytes: bodyBuf?.byteLength ?? 0,
      },
    };
    responseBuf = Buffer.from(JSON.stringify(envelope, null, 2));
    responseHeaders["Content-Type"] = "application/json";
    responseHeaders["X-D360-Upstream-Status"] = String(upstream.status);
    responseHeaders["X-D360-Upstream-Url"] = upstreamUrl;
    const traceId = upstream.headers.get("trace_id") || upstream.headers.get("x-request-id") || upstream.headers.get("x-trace-id") || "";
    if (traceId) responseHeaders["X-D360-Trace-Id"] = traceId;

    ctx.warn(`[d360Proxy] upstream ${upstream.status} ${effectiveMethod} ${upstreamUrl}`, {
      requestHeaders: envelope.request.headers,
      requestBodyBytes: envelope.request.bodyBytes,
      responseHeaders: upstreamHeaders,
      responseBodyPreview: envelope.upstream.bodyPreview,
    });
  }

  // Azure SWA's edge strips the body AND custom headers from 5xx responses
  // returned by managed functions — you get a bare `content-length: 0` with
  // only `x-ms-middleware-request-id`, hiding the real upstream failure.
  // Remap any upstream 5xx to 502 (Bad Gateway) so SWA passes our envelope
  // through unmolested. The original upstream status is preserved in the
  // X-D360-Upstream-Status header and in the envelope body.
  const returnStatus = upstream.status >= 500 ? 502 : upstream.status;

  // Undici's Response constructor (used by Azure Functions v4 to serialize
  // our HttpResponseInit) REJECTS any body on 204/205/304 — even an empty
  // Buffer throws `Invalid response status code 204` and the runtime emits
  // a generic 500 to the caller. D360 returns 204 for successful DELETE.
  const nullBodyStatuses = new Set([204, 205, 304]);
  const finalBody = nullBodyStatuses.has(returnStatus) ? undefined : responseBuf;

  return {
    status: returnStatus,
    headers: responseHeaders,
    body: finalBody,
  };
}

app.http("d360Proxy", {
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "d360/proxy/{*path}",
  handler: withAuth(proxyHandler),
});
