/**
 * Server-side spec file selection for flow generation.
 *
 * Given an idea's steps and a list of available spec files, selects the
 * relevant specs needed for the AI to generate accurate flow XML.
 *
 * Moved from the frontend (src/lib/flow/buildPrompt.ts) to the server
 * so that the client doesn't need to send 50+ file paths — just an idea
 * reference and a version folder.
 */

interface IdeaLike {
  steps: string[];
  entities: string[];
  description: string;
}

/**
 * Parse idea steps to find exactly the spec files needed for each endpoint.
 *
 * Each step like "POST /v3/projects/{project_id}/categories" is parsed to
 * extract the HTTP method, resource name, and optional action sub-path,
 * then matched against available spec filenames.
 *
 * Handles:
 * - Standard CRUD: POST /articles → create-article.md
 * - Action endpoints: POST /articles/{id}/publish → publish-article.md
 * - Bulk operations: POST /articles/bulk/publish → bulk-publish-article.md
 */
export function filterRelevantSpecs(idea: IdeaLike, allSpecFiles: string[]): string[] {
  // Exclude system/distilled companion files — only match against raw spec files
  const eligibleFiles = allSpecFiles.filter(f =>
    !f.includes("/_system/") && !f.includes("/_distilled/")
  );
  const needed = new Set<string>();

  // Map HTTP methods to typical spec filename action prefixes
  const methodToActions: Record<string, string[]> = {
    POST: ["create-", "bulk-create-"],
    GET: ["get-", "list-"],
    DELETE: ["delete-", "bulk-delete-"],
    PUT: ["update-", "bulk-update-"],
    PATCH: ["update-", "patch-"],
  };

  // Exact filenames the swagger splitter generates (no hyphen suffix)
  const methodToExactNames: Record<string, string[]> = {
    POST: ["create.md"],
    GET: ["get.md", "list.md"],
    DELETE: ["delete.md"],
    PUT: ["update.md"],
    PATCH: ["patch.md", "update.md"],
  };

  for (const step of idea.steps) {
    // Parse: "POST /v3/projects/{project_id}/categories (description)"
    // or:   "POST /v3/projects/{project_id}/articles/{article_id}/publish"
    const stepMatch = step.match(/(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/i);
    if (!stepMatch) continue;

    const method = stepMatch[1].toUpperCase();
    const path = stepMatch[2];

    // Extract meaningful segments (skip version, "projects", path params)
    const segments = path.split("/").filter(
      (s) => s && !s.startsWith("{") && !/^v\d+$/i.test(s) && s !== "projects"
    );

    const resource = segments[0]?.toLowerCase();
    if (!resource) continue;

    const isBulk = segments.includes("bulk");

    // Detect action sub-paths: the last segment after a path param or "bulk"
    const lastSegment = segments[segments.length - 1]?.toLowerCase();
    const isActionEndpoint = segments.length >= 2 && lastSegment !== resource && lastSegment !== "bulk";
    const actionName = isActionEndpoint ? lastSegment : null;

    // Build the set of filename prefixes to match
    let actions: string[];
    if (actionName) {
      actions = isBulk ? [`bulk-${actionName}-`] : [`${actionName}-`];
    } else {
      actions = methodToActions[method] ?? [];
    }

    // Build exact names list, with GET path-parameter awareness
    let exactNames: string[];
    if (actionName) {
      // Action endpoints (e.g., /publish) use action-based matching, not exact names
      exactNames = [];
    } else if (method === "GET") {
      const endsWithParam = /\/\{[^}]+\}\s*$/.test(path);
      exactNames = endsWithParam ? ["get.md"] : ["list.md"];
    } else {
      exactNames = methodToExactNames[method] ?? [];
    }

    // Find the best matching spec file
    for (const file of eligibleFiles) {
      const lower = file.toLowerCase();
      const filename = lower.split("/").pop() ?? "";

      // Must relate to this resource (folder name or filename)
      if (!lower.includes(`/${resource}/`) && !filename.includes(resource)) continue;

      // Exact match first (splitter-generated names: create.md, patch.md, get.md)
      if (exactNames.includes(filename)) {
        needed.add(file);
        continue;
      }

      // Then existing startsWith prefix matching (create-xxx.md, update-xxx.md)
      for (const action of actions) {
        const isBulkAction = action.startsWith("bulk-");
        if (isBulk !== isBulkAction && !isActionEndpoint) continue;
        if (filename.startsWith(action)) {
          needed.add(file);
          break;
        }
      }

      // Fallback: if no action matched yet and this is an action endpoint,
      // try matching the action name anywhere in the filename
      if (actionName && !needed.has(file) && filename.includes(actionName)) {
        needed.add(file);
      }
    }
  }

  if (needed.size > 0) {
    const primaryFolders = new Set<string>();
    for (const f of needed) {
      const parts = f.split("/");
      if (parts.length >= 2) primaryFolders.add(parts.slice(0, -1).join("/"));
    }

    // Same-folder create/delete specs FIRST (high priority — needed for
    // teardown steps and response schema context for captures).
    const sameFolderDeps: string[] = [];
    for (const file of eligibleFiles) {
      if (needed.has(file)) continue;
      const lower = file.toLowerCase();
      const filename = lower.split("/").pop() ?? "";
      if (filename.startsWith("create-") || filename === "create.md"
        || filename.startsWith("delete-") || filename === "delete.md") {
        for (const folder of primaryFolders) {
          if (lower.includes(folder.toLowerCase() + "/")) {
            sameFolderDeps.push(file);
            break;
          }
        }
      }
    }
    for (const f of sameFolderDeps) needed.add(f);

    // Sibling folder create/delete specs SECOND (lower priority — for
    // prerequisite entity setup/teardown). Capped to avoid bloating.
    const MAX_SIBLING_DEPS = 10;
    let siblingCount = 0;
    for (const file of eligibleFiles) {
      if (siblingCount >= MAX_SIBLING_DEPS) break;
      if (needed.has(file)) continue;
      const filename = file.toLowerCase().split("/").pop() ?? "";
      const fileParts = file.split("/");
      const fileFolder = fileParts.length >= 2 ? fileParts.slice(0, -1).join("/") : "";
      // Skip files in the same folder (handled above)
      if (primaryFolders.has(fileFolder)) continue;
      // Include create/delete specs from other resource folders (dependencies)
      if (filename.startsWith("create-") || filename.startsWith("delete-")
        || filename === "create.md" || filename === "delete.md") {
        needed.add(file);
        siblingCount++;
      }
    }

    // Set insertion order is preserved: primary matches → same-folder deps → sibling deps.
    // buildSpecContext caps at MAX_SPEC_FILES, so important files come first.
    console.log(`[filterRelevantSpecs] Final selection (${needed.size}): primary=${needed.size - sameFolderDeps.length - siblingCount}, sameFolderDeps=${sameFolderDeps.length}, siblingDeps=${siblingCount}`);
    return Array.from(needed);
  }

  // Fallback: if step parsing found nothing (unusual), use keyword matching
  const stepText = idea.steps.join(" ").toLowerCase() + " " + idea.description.toLowerCase();
  const keywords = new Set<string>();
  for (const entity of idea.entities) keywords.add(entity.toLowerCase());
  const pathRe = /\/(?:v\d+\/)?(?:projects\/\{[^}]+\}\/)?([\w-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(stepText)) !== null) keywords.add(m[1].toLowerCase());

  return eligibleFiles
    .filter((name) => {
      const lower = name.toLowerCase();
      for (const kw of keywords) { if (lower.includes(kw)) return true; }
      return false;
    })
    .slice(0, 10);
}
