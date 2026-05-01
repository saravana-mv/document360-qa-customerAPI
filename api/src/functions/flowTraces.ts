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
  const folderPath = req.query.get("folderPath");
  const traceType = req.query.get("type"); // "ideas-trace" | "flow-trace"

  if (!traceId && !folderPath) {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "traceId or folderPath query parameter is required" }),
    };
  }

  try {
    const container = await getFlowTracesContainer();

    // Lookup by folderPath — return the latest trace of the given type for that folder
    if (folderPath && !traceId) {
      const type = traceType || "ideas-trace";
      const { resources } = await container.items.query({
        query: "SELECT TOP 1 * FROM c WHERE c.projectId = @pid AND c.type = @type AND c.request.folderPath = @fp ORDER BY c.createdAt DESC",
        parameters: [
          { name: "@pid", value: projectId },
          { name: "@type", value: type },
          { name: "@fp", value: folderPath },
        ],
      }).fetchAll();
      if (resources.length === 0) {
        return {
          status: 404,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "No trace found for this folder" }),
        };
      }
      return {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify(resources[0]),
      };
    }

    // Lookup by traceId
    const { resource } = await container.item(traceId!, projectId).read();
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
