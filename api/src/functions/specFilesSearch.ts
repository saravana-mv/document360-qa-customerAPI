import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listBlobs, downloadBlob } from "../lib/blobClient";
import { withAuth, getProjectId } from "../lib/auth";
import MiniSearch from "minisearch";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

interface SearchDoc {
  id: string;
  name: string;
  content: string;
}

interface SearchResult {
  name: string;
  matches: string[];
  score: number;
}

/** Extract context snippets around matching terms in the content. */
function extractSnippets(content: string, terms: string[], maxSnippets = 3): string[] {
  const snippets: string[] = [];
  const lower = content.toLowerCase();
  const lines = content.split("\n");

  for (const term of terms) {
    const termLower = term.toLowerCase();
    for (let i = 0; i < lines.length && snippets.length < maxSnippets; i++) {
      if (lines[i].toLowerCase().includes(termLower)) {
        const line = lines[i].trim();
        if (line.length > 0 && !snippets.includes(line)) {
          // Truncate long lines
          snippets.push(line.length > 200 ? line.slice(0, 200) + "..." : line);
        }
      }
    }
  }
  return snippets;
}

/**
 * GET /api/spec-files/search?q=<term>&version=<versionFolder>
 *
 * Full-text search across spec files in a project.
 * - `q` (required): search query
 * - `version` (optional): version folder prefix to scope search (e.g. "V3")
 */
async function searchSpecFiles(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  const query = req.query.get("q")?.trim();
  if (!query) return err(400, "q query param is required");

  let projectId: string;
  try {
    projectId = getProjectId(req);
  } catch {
    return err(400, "Project ID is required");
  }

  const version = req.query.get("version")?.trim();

  try {
    // List all blobs under the project (optionally scoped to version folder)
    const prefix = version ? `${projectId}/${version}/` : `${projectId}/`;
    const allBlobs = await listBlobs(prefix);

    // Filter to searchable files: .md and .json, excluding _system, _distilled, _versions, _sources
    const searchableBlobs = allBlobs.filter(b => {
      const name = b.name;
      if (name.includes("/_system/")) return false;
      if (name.includes("/_distilled/")) return false;
      if (name.includes("/_versions/")) return false;
      if (name.endsWith("_sources.json")) return false;
      return name.endsWith(".md") || name.endsWith(".json");
    });

    // Download content in parallel (cap at 100 files to avoid timeout)
    const toIndex = searchableBlobs.slice(0, 100);
    const docs: SearchDoc[] = [];

    const downloads = await Promise.allSettled(
      toIndex.map(async (blob) => {
        const content = await downloadBlob(blob.name);
        const cleanName = blob.name.startsWith(projectId + "/")
          ? blob.name.slice(projectId.length + 1)
          : blob.name;
        return { id: cleanName, name: cleanName, content } as SearchDoc;
      })
    );

    for (const result of downloads) {
      if (result.status === "fulfilled") docs.push(result.value);
    }

    if (docs.length === 0) return ok([]);

    // Build MiniSearch index
    const miniSearch = new MiniSearch<SearchDoc>({
      fields: ["name", "content"],
      storeFields: ["name"],
      searchOptions: {
        boost: { name: 2 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
    miniSearch.addAll(docs);

    // Search
    const raw = miniSearch.search(query).slice(0, 20);

    // Build results with context snippets
    const terms = query.split(/\s+/).filter(Boolean);
    const results: SearchResult[] = raw.map(hit => {
      const doc = docs.find(d => d.id === hit.id);
      const matches = doc ? extractSnippets(doc.content, terms) : [];
      return { name: hit.id, matches, score: hit.score };
    });

    return ok(results);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

app.http("specFilesSearch", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/search",
  handler: withAuth(searchSpecFiles),
});
