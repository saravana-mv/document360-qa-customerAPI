// Alternative proxy endpoint: single short URL, all request details carried
// in the JSON body. Exists because Azure SWA's edge and/or Functions runtime
// has been observed to reject DELETE (and tunneled-POST DELETE) requests on
// the catch-all /api/d360/proxy/{*path} route with a bare 500 that never
// invokes our function. This endpoint uses a fixed URL and POST only, which
// is the most reliable combination on SWA.
//
// Request (SPA → this function):
//   POST /api/d360/rpc
//   Content-Type: application/json
//   Body: { "method": "DELETE", "path": "v3/projects/.../articles/<uuid>", "query": "?project_version_id=...", "body": null, "noAuth": false }
//
// Response: same envelope as d360Proxy (wrapped 5xx, CORS, sentinel, etc.).

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, parseClientPrincipal } from "../lib/auth";
import { getValidAccessToken } from "../lib/d360Token";

const D360_BASE_URL =
  (process.env.D360_API_BASE_URL ?? "https://apihub.berlin.document360.net").replace(/\/$/, "");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "X-D360-Proxy-Build, X-D360-Upstream-Status, X-D360-Upstream-Url, X-D360-Trace-Id, Content-Type",
};

interface RpcBody {
  method: string;
  path: string;
  query?: string;
  body?: unknown;
  noAuth?: boolean;
}

function err(status: number, message: string, extra?: Record<string, unknown>): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-D360-Proxy-Build": "rpc-v1" },
    body: JSON.stringify({ error: message, ...extra }),
  };
}

async function handlerInner(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  const principal = parseClientPrincipal(req);
  if (!principal) return err(401, "Unauthorized");

  let rpc: RpcBody;
  try {
    rpc = (await req.json()) as RpcBody;
  } catch {
    return err(400, "Invalid JSON body");
  }

  const method = (rpc.method ?? "").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return err(400, `Unsupported method: ${method}`);
  }
  const path = (rpc.path ?? "").replace(/^\/+/, "");
  if (!path) return err(400, "Missing path");
  const query = rpc.query ?? "";
  const upstreamUrl = `${D360_BASE_URL}/${path}${query}`;

  let accessToken = "";
  if (!rpc.noAuth) {
    try {
      ({ accessToken } = await getValidAccessToken(principal.userId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "D360_NOT_AUTHENTICATED" || msg === "D360_REFRESH_UNAVAILABLE") {
        return err(401, "D360 sign-in required", { code: msg });
      }
      return err(502, `Token refresh failed: ${msg}`);
    }
  }

  const forwardHeaders: Record<string, string> = {
    Accept: "application/json",
    Authorization: rpc.noAuth ? "Bearer __invalid__" : `Bearer ${accessToken}`,
  };
  const methodsWithBody = new Set(["POST", "PUT", "PATCH"]);
  let bodyBytes: Buffer | undefined;
  if (methodsWithBody.has(method) && rpc.body !== undefined && rpc.body !== null) {
    forwardHeaders["Content-Type"] = "application/json";
    bodyBytes = Buffer.from(JSON.stringify(rpc.body), "utf8");
  }

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), 25000);
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: forwardHeaders,
      body: bodyBytes,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutTimer);
    const isAbort = (e as { name?: string })?.name === "AbortError";
    return {
      status: 502,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "X-D360-Proxy-Build": "rpc-v1",
        "X-D360-Upstream-Url": upstreamUrl,
        "X-D360-Upstream-Timeout": isAbort ? "1" : "0",
      },
      body: JSON.stringify({
        _proxyDebug: isAbort ? "Upstream timeout" : "Upstream fetch error",
        error: e instanceof Error ? e.message : String(e),
      }),
    };
  }
  clearTimeout(timeoutTimer);

  const responseHeaders: Record<string, string> = { ...CORS_HEADERS, "X-D360-Proxy-Build": "rpc-v1" };
  for (const h of ["content-type", "content-language", "etag"]) {
    const v = upstream.headers.get(h);
    if (v) responseHeaders[h] = v;
  }
  responseHeaders["X-D360-Upstream-Status"] = String(upstream.status);
  const traceId = upstream.headers.get("trace_id") || upstream.headers.get("x-request-id") || upstream.headers.get("x-trace-id") || "";
  if (traceId) responseHeaders["X-D360-Trace-Id"] = traceId;

  let responseBuf = Buffer.from(await upstream.arrayBuffer());

  if (upstream.status >= 500) {
    const upstreamHeaders: Record<string, string> = {};
    upstream.headers.forEach((v, k) => { upstreamHeaders[k] = v; });
    responseBuf = Buffer.from(JSON.stringify({
      _proxyDebug: "Upstream 5xx — wrapped by d360 rpc",
      upstream: {
        method, url: upstreamUrl, status: upstream.status,
        headers: upstreamHeaders,
        bodyPreview: responseBuf.toString("utf8").slice(0, 4000),
        bodyBytes: responseBuf.byteLength,
      },
    }, null, 2));
    responseHeaders["Content-Type"] = "application/json";
    responseHeaders["X-D360-Upstream-Url"] = upstreamUrl;
    ctx.warn(`[d360Rpc] upstream ${upstream.status} ${method} ${upstreamUrl}`);
  }

  // Remap upstream 5xx to 502 so SWA's edge doesn't strip the envelope.
  const returnStatus = upstream.status >= 500 ? 502 : upstream.status;
  return { status: returnStatus, headers: responseHeaders, body: responseBuf };
}

async function handler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    return await handlerInner(req, ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.error(`[d360Rpc] crashed: ${msg}`);
    return {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-D360-Proxy-Build": "rpc-v1", "X-D360-Proxy-Crash": "1" },
      body: JSON.stringify({ _proxyDebug: "RPC handler threw", error: msg }),
    };
  }
}

app.http("d360Rpc", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "d360/rpc",
  handler: withAuth(handler),
});
