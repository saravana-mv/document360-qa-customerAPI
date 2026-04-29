import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { withAuth, getProjectId } from "../lib/auth";
import { getFlowTracesContainer } from "../lib/cosmosClient";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FF-Project-Id, X-MS-CLIENT-PRINCIPAL",
};

async function flowTraces(req: HttpRequest): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }

  const traceId = req.query.get("traceId");
  if (!traceId) {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "traceId query parameter is required" }),
    };
  }

  try {
    const container = await getFlowTracesContainer();
    const { resource } = await container.item(traceId, projectId).read();
    if (!resource) {
      return {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Trace not found" }),
      };
    }
    return {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(resource),
    };
  } catch (e: unknown) {
    const code = (e as { code?: number }).code;
    if (code === 404) {
      return {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Trace not found" }),
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: msg }),
    };
  }
}

app.http("flowTraces", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "flow-traces",
  handler: withAuth(flowTraces),
});
