import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, getProjectId } from "../lib/auth";
import { loadAiContext } from "../lib/aiContext";
import { loadProjectVariables } from "../lib/projectVariables";
import { validateFlowXml } from "../lib/flowValidator";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: CORS_HEADERS, body: undefined };
  }

  const projectId = getProjectId(req);

  let body: { flowXml?: string; versionFolder?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return { status: 400, headers: CORS_HEADERS, jsonBody: { error: "Invalid JSON body" } };
  }

  const { flowXml, versionFolder } = body;
  if (!flowXml) {
    return { status: 400, headers: CORS_HEADERS, jsonBody: { error: "flowXml is required" } };
  }

  // Load spec context for all steps in the flow
  const aiCtx = await loadAiContext({
    projectId,
    versionFolder: versionFolder ?? null,
    flowXml,
    loadRules: false,
    loadVariables: false,
    loadDependencies: false,
    loadSpec: true,
  });

  // Build combined spec context from all step specs
  const specParts: string[] = [];
  for (const ss of aiCtx.flowStepSpecs) {
    if (ss.spec) specParts.push(ss.spec);
  }
  const specContext = specParts.join("\n\n");
  console.log(`[validateFlow] flowStepSpecs: ${aiCtx.flowStepSpecs.length} steps, ${specParts.length} with spec, specContext length=${specContext.length}`);
  if (specContext.length > 0) {
    // Log first 500 chars to see what headers are present
    console.log(`[validateFlow] specContext preview: ${specContext.slice(0, 500)}`);
  }

  // Load project variables
  const projVars = await loadProjectVariables(projectId);

  // Run validation
  const result = validateFlowXml(flowXml, specContext, projVars);
  console.log(`[validateFlow] result: ${result.summary.errors}E ${result.summary.warnings}W ${result.summary.info}I, issues: ${result.issues.map(i => `[${i.severity}] ${i.category}: ${i.message.slice(0, 80)}`).join(" | ")}`);

  return {
    status: 200,
    headers: CORS_HEADERS,
    jsonBody: result,
  };
}

app.http("validateFlow", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "validate-flow",
  handler: withAuth(handler),
});
