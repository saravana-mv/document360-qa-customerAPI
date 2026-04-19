// POST /api/run-scenario — FlowForge Public API endpoint.
//
// Authenticated via X-API-Key (not Entra). Runs a scenario server-side
// using the bound D360 credentials and returns structured results.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withApiKey, getApiKeyDoc, resolveD360Credentials } from "../lib/apiKeyAuth";
import { resolveScenario, ScenarioNotFoundError } from "../lib/flowRunner";
import { parseFlowXml, FlowXmlParseError } from "../lib/flowRunner";
import { executeScenario } from "../lib/flowRunner";
import type { RunContext } from "../lib/flowRunner";
import { getSettingsContainer, getTestRunsContainer } from "../lib/cosmosClient";
import { audit } from "../lib/auditLog";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  "Content-Type": "application/json",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function err(status: number, message: string, extra?: Record<string, unknown>): HttpResponseInit {
  return { status, headers: CORS_HEADERS, body: JSON.stringify({ error: message, ...extra }) };
}

/** Read the API key creator's settings to get version config (baseUrl, apiVersion, langCode). */
async function getCreatorSettings(oid: string): Promise<Record<string, unknown>> {
  const container = await getSettingsContainer();
  try {
    const { resource } = await container.item("user_settings", oid).read();
    return (resource as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

async function handleRunScenario(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method !== "POST") return err(405, "Method Not Allowed");

  const apiKeyDoc = getApiKeyDoc(req);

  // Parse request body
  let scenarioId: string;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    scenarioId = typeof body.scenarioId === "string" ? body.scenarioId.trim() : "";
    if (!scenarioId) return err(400, "scenarioId is required");
  } catch {
    return err(400, "Invalid JSON body");
  }

  // Resolve scenario XML from Cosmos
  let xml: string;
  try {
    const resolved = await resolveScenario(scenarioId, apiKeyDoc.projectId);
    xml = resolved.xml;
  } catch (e) {
    if (e instanceof ScenarioNotFoundError) {
      return err(404, e.message);
    }
    return err(500, `Failed to resolve scenario: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Parse flow XML
  let flow: ReturnType<typeof parseFlowXml>;
  try {
    flow = parseFlowXml(xml);
  } catch (e) {
    if (e instanceof FlowXmlParseError) {
      return err(422, `Flow XML parse error: ${e.message}`);
    }
    return err(500, `Unexpected parse error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Resolve D360 credentials
  let d360Creds: { d360AccessToken?: string; d360ApiKey?: string };
  try {
    d360Creds = await resolveD360Credentials(apiKeyDoc);
  } catch (e) {
    return err(401, `D360 credential error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Build RunContext from API key doc + creator's settings
  const settings = await getCreatorSettings(apiKeyDoc.createdBy.oid);
  const baseUrl = (typeof settings.baseUrl === "string" && settings.baseUrl)
    ? settings.baseUrl
    : "https://apihub.document360.io";
  const apiVersion = (typeof settings.apiVersion === "string" && settings.apiVersion)
    ? settings.apiVersion
    : "v2";
  const langCode = (typeof settings.langCode === "string" && settings.langCode)
    ? settings.langCode
    : "en";

  const ctx: RunContext = {
    projectId: apiKeyDoc.projectId,
    versionId: apiKeyDoc.versionId,
    langCode,
    apiVersion,
    baseUrl,
    authMethod: apiKeyDoc.authMethod,
    ...d360Creds,
  };

  // Execute the scenario
  const result = await executeScenario(flow, ctx, scenarioId);

  // Persist run to test-runs container (fire-and-forget)
  const runId = `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  getTestRunsContainer()
    .then((c) =>
      c.items.upsert({
        id: runId,
        projectId: apiKeyDoc.projectId,
        type: "test_run",
        source: "api",
        apiKeyName: apiKeyDoc.name,
        triggeredBy: { oid: apiKeyDoc.createdBy.oid, name: apiKeyDoc.createdBy.name },
        scenarioId,
        scenarioName: result.scenarioName,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        summary: result.summary,
        steps: result.steps,
      }),
    )
    .catch((e) => console.error("[run-scenario] failed to save run:", e instanceof Error ? e.message : String(e)));

  audit(apiKeyDoc.projectId, "scenario.run", apiKeyDoc.createdBy, scenarioId, { source: "api", status: result.status, durationMs: result.summary.durationMs });
  return ok(result);
}

// ── Registration ────────────────────────────────────────────────────────────

app.http("runScenario", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "run-scenario",
  handler: withApiKey(handleRunScenario),
});
