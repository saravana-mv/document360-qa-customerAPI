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

import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { withAuth, parseClientPrincipal } from "../lib/auth";
import { getValidAccessToken } from "../lib/d360Token";

const D360_BASE_URL =
  (process.env.D360_API_BASE_URL ?? "https://apihub.berlin.document360.net").replace(/\/$/, "");

// Headers we refuse to forward from the client → D360. The proxy supplies
// Authorization; the rest are hop-by-hop or would break content negotiation.
const HOP_BY_HOP_REQUEST = new Set([
  "authorization",
  "host",
  "content-length",
  "connection",
  "x-ms-client-principal",
  "x-ms-client-principal-id",
  "x-ms-client-principal-name",
  "x-ms-client-principal-idp",
  "cookie",
  "x-d360-no-auth",
]);

// Response headers we forward back to the browser. Everything else is
// dropped so SWA/Functions can set its own CORS etc.
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-language", "etag"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function errJson(status: number, message: string, extra?: Record<string, unknown>): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ error: message, ...extra }),
  };
}

async function proxyHandler(req: HttpRequest): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: CORS_HEADERS };
  }

  const principal = parseClientPrincipal(req);
  if (!principal) return errJson(401, "Unauthorized");

  // Extract the sub-path from the route, e.g. /api/d360/proxy/v3/projects/xyz
  // params.path contains everything after "d360/proxy/".
  const subPath = (req.params?.path ?? "").replace(/^\/+/, "");
  if (!subPath) return errJson(400, "Missing upstream path");

  // Preserve the query string verbatim.
  const url = new URL(req.url);
  const upstreamUrl = `${D360_BASE_URL}/${subPath}${url.search}`;

  // Opt-out header lets flow tests deliberately call D360 without auth so they
  // can verify the 401 path. We still require Entra — this is only about
  // whether we inject the D360 Bearer header.
  const noAuth = (req.headers.get("x-d360-no-auth") ?? "").toLowerCase() === "1";

  let accessToken = "";
  if (!noAuth) {
    try {
      ({ accessToken } = await getValidAccessToken(principal.userId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "D360_NOT_AUTHENTICATED" || msg === "D360_REFRESH_UNAVAILABLE") {
        return errJson(401, "D360 sign-in required", { code: msg });
      }
      return errJson(502, `Token refresh failed: ${msg}`);
    }
  }

  // Build forwarded headers.
  const forwardHeaders: Record<string, string> = noAuth
    ? { Authorization: "Bearer __invalid__" }
    : { Authorization: `Bearer ${accessToken}` };
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_REQUEST.has(key.toLowerCase())) {
      forwardHeaders[key] = value;
    }
  });

  // Body: only attach for methods that carry one. @azure/functions exposes
  // arrayBuffer() for any payload, which preserves JSON, XML, binary, etc.
  const hasBody = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const bodyBuf = hasBody ? await req.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: bodyBuf && bodyBuf.byteLength > 0 ? Buffer.from(bodyBuf) : undefined,
    });
  } catch (e) {
    return errJson(502, `Upstream fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
  for (const h of FORWARDED_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) responseHeaders[h] = v;
  }

  // Pass through the body as a buffer — Functions v4 handles content-length.
  const responseBuf = Buffer.from(await upstream.arrayBuffer());

  return {
    status: upstream.status,
    headers: responseHeaders,
    body: responseBuf,
  };
}

app.http("d360Proxy", {
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "d360/proxy/{*path}",
  handler: withAuth(proxyHandler),
});
