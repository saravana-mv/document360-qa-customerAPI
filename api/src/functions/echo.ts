// Diagnostic echo endpoint. Accepts every HTTP method on a catch-all route
// and returns a JSON body describing what was received. Used to isolate
// whether DELETE requests reach Azure Functions at all on SWA managed plan,
// independent of the d360Proxy function.
//
// Call:  /api/echo/{anything}
// Each response includes X-Echo-Build so we can verify the deployed build.

import { app, HttpRequest, HttpResponseInit } from "@azure/functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-D360-No-Auth",
  "Access-Control-Expose-Headers": "X-Echo-Build, X-Echo-Method, X-Echo-Path",
};

async function handler(req: HttpRequest): Promise<HttpResponseInit> {
  const subPath = (req.params?.path ?? "") as string;
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  if (req.method === "OPTIONS") {
    return { status: 204, headers: CORS };
  }

  return {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      "X-Echo-Build": "1",
      "X-Echo-Method": req.method,
      "X-Echo-Path": subPath,
    },
    body: JSON.stringify({
      ok: true,
      method: req.method,
      url: req.url,
      subPath,
      query: Object.fromEntries(new URL(req.url).searchParams),
      headers,
    }, null, 2),
  };
}

app.http("echo", {
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "echo/{*path}",
  handler,
});
