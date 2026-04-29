import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getIdeasContainer } from "../lib/cosmosClient";
import { withAuth, getUserInfo, getProjectId, ProjectIdMissingError } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

function ideasDocId(folderPath: string): string {
  // Cosmos DB forbids '/' in document IDs — replace with '|'
  return "ideas:" + folderPath.replace(/\//g, "|");
}

interface IdeasDocument {
  id: string;
  projectId: string;
  type: "ideas";
  folderPath: string;
  ideas: unknown[];
  usage: unknown | null;
  flowsUsage: unknown | null;
  generatedFlows: unknown[];
  updatedAt: string;
  updatedBy: { oid: string; name: string };
}

/** GET /api/ideas?folderPath=<path> — single folder's ideas
 *  GET /api/ideas?prefix=<path>    — all ideas under prefix (aggregation) */
async function getIdeas(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const folderPath = req.query.get("folderPath");
    const prefix = req.query.get("prefix");
    const container = await getIdeasContainer();

    if (folderPath) {
      // Single folder
      try {
        const { resource } = await container.item(ideasDocId(folderPath), projectId).read<IdeasDocument>();
        if (!resource) return ok({ folderPath, ideas: [], usage: null, flowsUsage: null, generatedFlows: [] });
        return ok({
          folderPath: resource.folderPath,
          ideas: resource.ideas,
          usage: resource.usage,
          flowsUsage: resource.flowsUsage,
          generatedFlows: resource.generatedFlows,
        });
      } catch {
        return ok({ folderPath, ideas: [], usage: null, flowsUsage: null, generatedFlows: [] });
      }
    }

    if (prefix) {
      // All under prefix
      const query = `SELECT * FROM c WHERE c.type="ideas" AND c.projectId=@pid AND (c.folderPath=@prefix OR STARTSWITH(c.folderPath, @prefixSlash))`;
      const params = [
        { name: "@pid", value: projectId },
        { name: "@prefix", value: prefix },
        { name: "@prefixSlash", value: prefix.endsWith("/") ? prefix : prefix + "/" },
      ];
      const { resources } = await container.items.query<IdeasDocument>({ query, parameters: params }, { partitionKey: projectId }).fetchAll();

      const result: Record<string, { folderPath: string; ideas: unknown[]; usage: unknown | null; flowsUsage: unknown | null; generatedFlows: unknown[] }> = {};
      for (const doc of resources) {
        result[doc.folderPath] = {
          folderPath: doc.folderPath,
          ideas: doc.ideas,
          usage: doc.usage,
          flowsUsage: doc.flowsUsage,
          generatedFlows: doc.generatedFlows,
        };
      }
      return ok(result);
    }

    // No filter — return all ideas for this project
    const query = `SELECT * FROM c WHERE c.type="ideas" AND c.projectId=@pid`;
    const { resources } = await container.items.query<IdeasDocument>({ query, parameters: [{ name: "@pid", value: projectId }] }, { partitionKey: projectId }).fetchAll();

    const result: Record<string, { folderPath: string; ideas: unknown[]; usage: unknown | null; flowsUsage: unknown | null; generatedFlows: unknown[] }> = {};
    for (const doc of resources) {
      result[doc.folderPath] = {
        folderPath: doc.folderPath,
        ideas: doc.ideas,
        usage: doc.usage,
        flowsUsage: doc.flowsUsage,
        generatedFlows: doc.generatedFlows,
      };
    }
    return ok(result);
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** PUT /api/ideas — upsert ideas for a folder */
async function putIdeas(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as {
      folderPath: string;
      ideas: unknown[];
      usage: unknown | null;
      flowsUsage: unknown | null;
      generatedFlows: unknown[];
    };
    if (!body.folderPath) return err(400, "folderPath is required");

    const container = await getIdeasContainer();
    const doc: IdeasDocument = {
      id: ideasDocId(body.folderPath),
      projectId,
      type: "ideas",
      folderPath: body.folderPath,
      ideas: body.ideas ?? [],
      usage: body.usage ?? null,
      flowsUsage: body.flowsUsage ?? null,
      generatedFlows: body.generatedFlows ?? [],
      updatedAt: new Date().toISOString(),
      updatedBy: { oid: user.oid, name: user.name },
    };

    await container.items.upsert(doc);
    return ok({ saved: true, folderPath: body.folderPath });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** DELETE /api/ideas?folderPath=<path> */
async function deleteIdeas(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const folderPath = req.query.get("folderPath");
    if (!folderPath) return err(400, "folderPath query param is required");

    const container = await getIdeasContainer();
    try {
      await container.item(ideasDocId(folderPath), projectId).delete();
    } catch {
      // idempotent
    }
    return ok({ deleted: true, folderPath });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** PATCH /api/ideas — rename: migrate ideas from old path to new path,
 *  updating specFiles references and folderPath inside ideas.
 *  Body: { oldPath: string; newPath: string } */
async function renameIdeas(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as { oldPath?: string; newPath?: string };
    if (!body.oldPath || !body.newPath) return err(400, "oldPath and newPath are required");

    const { oldPath, newPath } = body;
    const container = await getIdeasContainer();

    // Find all idea documents whose folderPath starts with oldPath (exact or prefix)
    const query = `SELECT * FROM c WHERE c.type="ideas" AND c.projectId=@pid AND (c.folderPath=@exact OR STARTSWITH(c.folderPath, @prefix))`;
    const params = [
      { name: "@pid", value: projectId },
      { name: "@exact", value: oldPath },
      { name: "@prefix", value: oldPath.endsWith("/") ? oldPath : oldPath + "/" },
    ];
    const { resources } = await container.items.query<IdeasDocument>({ query, parameters: params }, { partitionKey: projectId }).fetchAll();

    let migrated = 0;
    for (const doc of resources) {
      const updatedFolderPath = doc.folderPath === oldPath
        ? newPath
        : newPath + doc.folderPath.slice(oldPath.length);

      // Update specFiles paths inside each idea
      const updatedIdeas = (doc.ideas as Array<{ specFiles?: string[]; [k: string]: unknown }>).map(idea => {
        if (!Array.isArray(idea.specFiles)) return idea;
        return {
          ...idea,
          specFiles: idea.specFiles.map((f: string) =>
            f.startsWith(oldPath + "/") || f.startsWith(oldPath)
              ? newPath + f.slice(oldPath.length)
              : f
          ),
        };
      });

      // Delete old document, create new one with updated paths
      try { await container.item(doc.id, projectId).delete(); } catch { /* may already be gone */ }

      const newDoc: IdeasDocument = {
        ...doc,
        id: ideasDocId(updatedFolderPath),
        folderPath: updatedFolderPath,
        ideas: updatedIdeas,
        updatedAt: new Date().toISOString(),
        updatedBy: { oid: user.oid, name: user.name },
      };
      await container.items.upsert(newDoc);
      migrated++;
    }

    return ok({ migrated, oldPath, newPath });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function ideasRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return getIdeas(req);
    case "PUT":     return putIdeas(req);
    case "PATCH":   return renameIdeas(req);
    case "DELETE":  return deleteIdeas(req);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("ideas", {
  methods: ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "ideas",
  handler: withAuth(ideasRouter),
});
