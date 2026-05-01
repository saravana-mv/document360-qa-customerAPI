import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
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

/** Shared rename logic: migrate ideas docs from oldPath to newPath */
async function renameIdeasInternal(
  projectId: string,
  oldPath: string,
  newPath: string,
  user: { oid: string; name: string },
): Promise<number> {
  const container = await getIdeasContainer();
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
  return migrated;
}

/** PATCH /api/ideas — rename: migrate ideas from old path to new path */
async function renameIdeas(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as { oldPath?: string; newPath?: string };
    if (!body.oldPath || !body.newPath) return err(400, "oldPath and newPath are required");
    const migrated = await renameIdeasInternal(projectId, body.oldPath, body.newPath, user);
    return ok({ migrated, oldPath: body.oldPath, newPath: body.newPath });
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

// ── Idea Folders ────────────────────────────────────────────────────────────

interface IdeaFolderDoc {
  id: string;
  projectId: string;
  type: "idea_folder";
  name: string;
  path: string;
  parentPath: string | null;
  order: number;
  createdAt: string;
  createdBy: { oid: string; name: string };
  updatedAt: string;
  updatedBy: { oid: string; name: string };
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function getFolders(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const container = await getIdeasContainer();
    const query = `SELECT * FROM c WHERE c.type="idea_folder" AND c.projectId=@pid ORDER BY c["order"]`;
    const { resources } = await container.items.query<IdeaFolderDoc>(
      { query, parameters: [{ name: "@pid", value: projectId }] },
      { partitionKey: projectId },
    ).fetchAll();
    return ok(resources);
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function createFolder(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as {
      name?: string;
      parentPath?: string | null;
    };
    if (!body.name?.trim()) return err(400, "name is required");

    const slug = slugify(body.name);
    if (!slug) return err(400, "name produces an empty slug");
    const parentPath = body.parentPath || null;
    const path = parentPath ? `${parentPath}/${slug}` : slug;

    const container = await getIdeasContainer();

    // Check duplicate path
    const dupQuery = `SELECT c.id FROM c WHERE c.type="idea_folder" AND c.projectId=@pid AND c.path=@path`;
    const { resources: dups } = await container.items.query(
      { query: dupQuery, parameters: [{ name: "@pid", value: projectId }, { name: "@path", value: path }] },
      { partitionKey: projectId },
    ).fetchAll();
    if (dups.length > 0) return err(409, `Folder already exists at path "${path}"`);

    // Find max order among siblings
    const orderQuery = parentPath === null
      ? `SELECT VALUE MAX(c["order"]) FROM c WHERE c.type="idea_folder" AND c.projectId=@pid AND IS_NULL(c.parentPath)`
      : `SELECT VALUE MAX(c["order"]) FROM c WHERE c.type="idea_folder" AND c.projectId=@pid AND c.parentPath=@pp`;
    const orderParams = parentPath === null
      ? [{ name: "@pid", value: projectId }]
      : [{ name: "@pid", value: projectId }, { name: "@pp", value: parentPath }];
    const { resources: [maxOrder] } = await container.items.query(
      { query: orderQuery, parameters: orderParams },
      { partitionKey: projectId },
    ).fetchAll();

    const now = new Date().toISOString();
    const doc: IdeaFolderDoc = {
      id: `ifolder:${randomUUID()}`,
      projectId,
      type: "idea_folder",
      name: body.name.trim(),
      path,
      parentPath,
      order: (typeof maxOrder === "number" ? maxOrder : -1) + 1,
      createdAt: now,
      createdBy: { oid: user.oid, name: user.name },
      updatedAt: now,
      updatedBy: { oid: user.oid, name: user.name },
    };

    await container.items.create(doc);
    return ok(doc);
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function updateFolder(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as {
      id?: string;
      name?: string;
      order?: number;
    };
    if (!body.id) return err(400, "id is required");

    const container = await getIdeasContainer();
    let existing: IdeaFolderDoc;
    try {
      const { resource } = await container.item(body.id, projectId).read<IdeaFolderDoc>();
      if (!resource) return err(404, "Folder not found");
      existing = resource;
    } catch {
      return err(404, "Folder not found");
    }

    const now = new Date().toISOString();
    const updatedBy = { oid: user.oid, name: user.name };

    // Check if name changed — triggers path cascade
    if (body.name && body.name.trim() !== existing.name) {
      const newSlug = slugify(body.name);
      if (!newSlug) return err(400, "name produces an empty slug");
      const oldPath = existing.path;
      const newPath = existing.parentPath ? `${existing.parentPath}/${newSlug}` : newSlug;

      if (newPath !== oldPath) {
        // Cascade: update all descendant folder docs
        const descQuery = `SELECT * FROM c WHERE c.type="idea_folder" AND c.projectId=@pid AND STARTSWITH(c.path, @prefix)`;
        const { resources: descendants } = await container.items.query<IdeaFolderDoc>(
          { query: descQuery, parameters: [{ name: "@pid", value: projectId }, { name: "@prefix", value: oldPath + "/" }] },
          { partitionKey: projectId },
        ).fetchAll();

        for (const desc of descendants) {
          const updatedPath = newPath + desc.path.slice(oldPath.length);
          const updatedParent = desc.parentPath === oldPath
            ? newPath
            : desc.parentPath
              ? newPath + desc.parentPath.slice(oldPath.length)
              : desc.parentPath;
          await container.items.upsert({
            ...desc,
            path: updatedPath,
            parentPath: updatedParent,
            updatedAt: now,
            updatedBy,
          });
        }

        // Cascade: rename ideas docs
        await renameIdeasInternal(projectId, oldPath, newPath, updatedBy);
      }

      existing.name = body.name.trim();
      existing.path = newPath;
    }

    if (body.order !== undefined) existing.order = body.order;
    existing.updatedAt = now;
    existing.updatedBy = updatedBy;

    await container.items.upsert(existing);
    return ok(existing);
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function deleteFolderHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const folderId = req.query.get("id");
    if (!folderId) return err(400, "id query param is required");

    const container = await getIdeasContainer();

    // Read folder to get its path
    let folderPath: string;
    try {
      const { resource } = await container.item(folderId, projectId).read<IdeaFolderDoc>();
      if (!resource) return err(404, "Folder not found");
      folderPath = resource.path;
    } catch {
      return err(404, "Folder not found");
    }

    // Delete the folder doc itself
    try { await container.item(folderId, projectId).delete(); } catch { /* idempotent */ }

    // Delete all descendant folder docs
    const descQuery = `SELECT * FROM c WHERE c.type="idea_folder" AND c.projectId=@pid AND STARTSWITH(c.path, @prefix)`;
    const { resources: descendants } = await container.items.query<IdeaFolderDoc>(
      { query: descQuery, parameters: [{ name: "@pid", value: projectId }, { name: "@prefix", value: folderPath + "/" }] },
      { partitionKey: projectId },
    ).fetchAll();
    for (const desc of descendants) {
      try { await container.item(desc.id, projectId).delete(); } catch { /* idempotent */ }
    }

    // Delete all matching ideas docs (exact path + prefix)
    const ideasQuery = `SELECT * FROM c WHERE c.type="ideas" AND c.projectId=@pid AND (c.folderPath=@exact OR STARTSWITH(c.folderPath, @prefix))`;
    const { resources: ideaDocs } = await container.items.query<IdeasDocument>(
      { query: ideasQuery, parameters: [{ name: "@pid", value: projectId }, { name: "@exact", value: folderPath }, { name: "@prefix", value: folderPath + "/" }] },
      { partitionKey: projectId },
    ).fetchAll();
    for (const doc of ideaDocs) {
      try { await container.item(doc.id, projectId).delete(); } catch { /* idempotent */ }
    }

    return ok({ deleted: true, path: folderPath });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function ideaFoldersRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return getFolders(req);
    case "POST":    return createFolder(req);
    case "PUT":     return updateFolder(req);
    case "DELETE":  return deleteFolderHandler(req);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("ideaFolders", {
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "ideas/folders",
  handler: withAuth(ideaFoldersRouter),
});
