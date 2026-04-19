// DELETE /api/reset-project — Wipe all project data from Cosmos DB.
// Deletes: active_tests, scenario_org, all flow docs, all idea docs, all test-run docs.
// Preserves: user accounts, settings, spec-files (blob).
// Owner-only endpoint.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getFlowsContainer, getIdeasContainer, getTestRunsContainer } from "../lib/cosmosClient";
import { withRole, getProjectId, getUserInfo, ProjectIdMissingError } from "../lib/auth";
import { audit } from "../lib/auditLog";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
  "Content-Type": "application/json",
};

async function deleteAllInContainer(
  containerGetter: () => Promise<import("@azure/cosmos").Container>,
  projectId: string,
): Promise<number> {
  const container = await containerGetter();
  const { resources } = await container.items.query<{ id: string }>({
    query: "SELECT c.id FROM c WHERE c.projectId = @pid",
    parameters: [{ name: "@pid", value: projectId }],
  }).fetchAll();

  let deleted = 0;
  for (const doc of resources) {
    try {
      await container.item(doc.id, projectId).delete();
      deleted++;
    } catch {
      // ignore individual failures (already deleted, etc.)
    }
  }
  return deleted;
}

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: CORS_HEADERS };
  }

  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);

    // Audit BEFORE the destructive action
    audit(projectId, "project.reset", user, projectId);

    const [flows, ideas, testRuns] = await Promise.all([
      deleteAllInContainer(getFlowsContainer, projectId),
      deleteAllInContainer(getIdeasContainer, projectId),
      deleteAllInContainer(getTestRunsContainer, projectId),
    ]);

    return {
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Project data reset complete",
        deleted: { flows, ideas, testRuns },
      }),
    };
  } catch (e) {
    if (e instanceof ProjectIdMissingError) {
      return { status: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: e.message }) };
    }
    return { status: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) };
  }
}

app.http("resetProject", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "reset-project",
  handler: withRole(["owner"], handler),
});
