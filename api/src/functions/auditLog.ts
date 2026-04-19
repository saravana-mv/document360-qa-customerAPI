// GET /api/audit-log — Query audit log entries for a project.
// Supports filtering by action, actor, date range, and free-text search.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAuditLogContainer } from "../lib/cosmosClient";
import { withRole, getProjectId, ProjectIdMissingError } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
  "Content-Type": "application/json",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
}

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: CORS_HEADERS };
  }

  try {
    const projectId = getProjectId(req);

    // Query params for filtering
    const action = req.query.get("action") ?? undefined;
    const actor = req.query.get("actor") ?? undefined;
    const from = req.query.get("from") ?? undefined;
    const to = req.query.get("to") ?? undefined;
    const search = req.query.get("search") ?? undefined;
    const limitStr = req.query.get("limit");
    const offsetStr = req.query.get("offset");
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 100, 500) : 100;
    const offset = offsetStr ? parseInt(offsetStr, 10) || 0 : 0;

    // Build dynamic query
    const conditions: string[] = ["c.projectId = @pid", "c.type = 'audit'"];
    const parameters: Array<{ name: string; value: string }> = [
      { name: "@pid", value: projectId },
    ];

    if (action) {
      conditions.push("c.action = @action");
      parameters.push({ name: "@action", value: action });
    }

    if (actor) {
      conditions.push("(c.actor.oid = @actor OR CONTAINS(LOWER(c.actor.name), LOWER(@actor)))");
      parameters.push({ name: "@actor", value: actor });
    }

    if (from) {
      conditions.push("c.timestamp >= @from");
      parameters.push({ name: "@from", value: from });
    }

    if (to) {
      conditions.push("c.timestamp <= @to");
      parameters.push({ name: "@to", value: to });
    }

    if (search) {
      conditions.push(
        "(CONTAINS(LOWER(c.action), LOWER(@search)) OR CONTAINS(LOWER(c.target), LOWER(@search)) OR CONTAINS(LOWER(c.actor.name), LOWER(@search)))"
      );
      parameters.push({ name: "@search", value: search });
    }

    const where = conditions.join(" AND ");

    // Get total count
    const container = await getAuditLogContainer();
    const countQuery = `SELECT VALUE COUNT(1) FROM c WHERE ${where}`;
    console.log("[audit-log] countQuery:", countQuery, "params:", JSON.stringify(parameters));
    const { resources: countRes } = await container.items
      .query<number>({ query: countQuery, parameters })
      .fetchAll();
    const total = countRes[0] ?? 0;
    console.log("[audit-log] total:", total);

    // Get paginated results (OFFSET/LIMIT must be integer literals in Cosmos SQL)
    const dataQuery = `SELECT * FROM c WHERE ${where} ORDER BY c.timestamp DESC OFFSET ${offset} LIMIT ${limit}`;
    const { resources: entries } = await container.items
      .query({ query: dataQuery, parameters })
      .fetchAll();

    console.log("[audit-log] returned:", entries.length, "entries");
    return ok({ entries, total, limit, offset });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) {
      return err(400, e.message);
    }
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

app.http("auditLog", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "audit-log",
  handler: withRole(["owner", "qa_manager"], handler),
});
